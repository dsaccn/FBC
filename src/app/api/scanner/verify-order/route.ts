import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Client as PgClient } from 'pg'
import { broadcastVerificationEvent } from '@/lib/scanner-events'
import { checkReceiptDuplicate } from '@/lib/receipt-dedup'
import { verifyEthioReceipt } from '@/lib/ethio-receipt-verifier'
import { isScannerAuthorized } from '@/lib/scanner-auth'

export async function POST(req: Request) {
  try {
    const authorized = await isScannerAuthorized(req)
    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Action restricted to authorized staff' }, { status: 401 })
    }

    const body = await req.json()
    const { orderId, reference, provider, amount, payerName, receiverName, manualConfirmed } = body

    if (!orderId || !reference) {
      return NextResponse.json({ success: false, error: 'Missing orderId or transaction reference' }, { status: 400 })
    }

    const rawRefStr = String(reference).trim()
    const cleanRef = rawRefStr.startsWith('v2-') ? rawRefStr : rawRefStr.toUpperCase()
    const verifiedDate = new Date()

    // 🚨 DUPLICATE PROTECTION: Check if this transaction code was already used on another order or payment
    const duplicateConflict = await checkReceiptDuplicate(cleanRef, orderId)
    if (duplicateConflict) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        error: duplicateConflict.errorMessage
      }, { status: 400 })
    }

    // 🚨 FETCH TARGET ORDER & BILL TOTAL
    const targetOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: { include: { menuItem: true } },
        table: true,
        waiter: { select: { fullName: true } }
      }
    })

    if (!targetOrder) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    const activeItems = targetOrder.orderItems.filter(i => i.status !== 'CANCELLED')
    const orderTotal = activeItems.reduce((acc, i) => acc + (i.menuItem?.price || 0) * i.quantity, 0) || 0

    let finalAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0')
    let finalPayer = payerName || null
    let finalReceiver = receiverName || null
    let finalProvider = provider || 'AUTO'

    // If not already verified on scanner UI or manually confirmed after slip review:
    if (!manualConfirmed && isNaN(finalAmount)) {
      const bankVerification = await verifyEthioReceipt({
        referenceOrUrl: cleanRef,
        provider: provider || 'AUTO',
        expectedAmount: orderTotal > 0 ? orderTotal : undefined,
      })

      if (!bankVerification.success) {
        return NextResponse.json({
          success: false,
          error: bankVerification.errorMessage || 'Invalid transaction: Bank verification failed. Please verify with official slip.',
        }, { status: 400 })
      }

      if (typeof bankVerification.amount === 'number') finalAmount = bankVerification.amount
      if (bankVerification.payerName) finalPayer = bankVerification.payerName
      if (bankVerification.receiverName) finalReceiver = bankVerification.receiverName
      if (bankVerification.provider) finalProvider = bankVerification.provider
    }

    // 🚨 AMOUNT CHECK: Do NOT attach if bank amount is less than order's bill!
    if (!isNaN(finalAmount) && orderTotal > 0 && finalAmount < orderTotal - 0.5) {
      const shortAmt = orderTotal - finalAmount
      return NextResponse.json({
        success: false,
        underpaid: true,
        orderTotal,
        shortAmount: shortAmt,
        error: `AMOUNT TOO LOW: Bank verified amount (${finalAmount.toFixed(2)} ETB) is less than order bill (${orderTotal.toFixed(2)} ETB). Short by ${shortAmt.toFixed(2)} ETB! Receipt was NOT attached.`
      }, { status: 400 })
    }

    // 1. Update database
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        verifiedRef: cleanRef,
        verifiedProvider: finalProvider,
        verifiedAmount: isNaN(finalAmount) ? null : finalAmount,
        verifiedPayer: finalPayer,
        verifiedReceiver: finalReceiver,
        verifiedAt: verifiedDate,
        pendingSync: true,
      },
      include: {
        table: true,
        waiter: { select: { fullName: true } }
      }
    })

    // 2. Best-effort async push to Neon Cloud if configured
    if (process.env.NEON_DATABASE_URL) {
      const pg = new PgClient({
        connectionString: process.env.NEON_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      })
      pg.connect()
        .then(() =>
          pg.query(
            `UPDATE "Order" 
             SET "verifiedRef" = $1, 
                 "verifiedProvider" = $2, 
                 "verifiedAmount" = $3, 
                 "verifiedPayer" = $4, 
                 "verifiedReceiver" = $5, 
                 "verifiedAt" = $6,
                 "updatedAt" = NOW() 
             WHERE id = $7`,
            [cleanRef, finalProvider, isNaN(finalAmount) ? null : finalAmount, finalPayer, finalReceiver, verifiedDate, orderId]
          )
        )
        .then(() => pg.end())
        .catch(err => {
          console.warn('[Sync to Neon failed for order verification]', err?.message)
          try { pg.end() } catch {}
        })
    }

    // 3. Instant Millisecond Broadcast to Cashier POS screens
    broadcastVerificationEvent({
      type: 'ORDER_VERIFIED',
      orderId,
      tableNumber: updated?.table?.number,
      reference: cleanRef,
      provider: finalProvider,
      amount: finalAmount,
      payerName: finalPayer || undefined,
      receiverName: finalReceiver || undefined,
      timestamp: verifiedDate.toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: `Payment verified for ${updated?.table?.number ? `Table ${updated.table.number}` : 'Order'}!`,
      order: {
        id: updated?.id || orderId,
        tableNumber: updated?.table?.number || '?',
        verifiedRef: cleanRef,
        verifiedProvider: finalProvider,
        verifiedAmount: finalAmount,
        verifiedPayer: finalPayer,
        verifiedReceiver: finalReceiver,
        verifiedAt: verifiedDate,
      }
    })
  } catch (err: any) {
    console.error('[POST /api/scanner/verify-order]', err)
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const authorized = await isScannerAuthorized(req)
    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Action restricted to authorized staff' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    let orderId = searchParams.get('orderId')
    if (!orderId) {
      try {
        const text = await req.text()
        if (text && text.trim()) {
          const body = JSON.parse(text)
          orderId = body?.orderId
        }
      } catch {}
    }

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 })
    }

    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          verifiedRef: null,
          verifiedProvider: null,
          verifiedAmount: null,
          verifiedPayer: null,
          verifiedReceiver: null,
          verifiedAt: null,
          pendingSync: true,
        }
      })
    } catch (orderErr: any) {
      console.warn('[DELETE /api/scanner/verify-order] Prisma update warning:', orderErr?.message)
    }

    if (process.env.NEON_DATABASE_URL) {
      const pg = new PgClient({
        connectionString: process.env.NEON_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      })
      pg.connect()
        .then(() =>
          pg.query(
            `UPDATE "Order" 
             SET "verifiedRef" = NULL, 
                 "verifiedProvider" = NULL, 
                 "verifiedAmount" = NULL, 
                 "verifiedPayer" = NULL, 
                 "verifiedReceiver" = NULL, 
                 "verifiedAt" = NULL,
                 "updatedAt" = NOW() 
             WHERE id = $1`,
            [orderId]
          )
        )
        .then(() => pg.end())
        .catch(() => { try { pg.end() } catch {} })
    }

    // Broadcast instant clear to Cashier screens
    broadcastVerificationEvent({
      type: 'ORDER_CLEARED',
      orderId,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Order verification cleared' })
  } catch (err: any) {
    console.error('[DELETE /api/scanner/verify-order]', err)
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 })
  }
}
