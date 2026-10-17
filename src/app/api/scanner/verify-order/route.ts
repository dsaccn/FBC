import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Client as PgClient } from 'pg'
import { broadcastVerificationEvent } from '@/lib/scanner-events'
import { checkReceiptDuplicate } from '@/lib/receipt-dedup'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderId, reference, provider, amount, payerName, receiverName } = body

    if (!orderId || !reference) {
      return NextResponse.json({ success: false, error: 'Missing orderId or transaction reference' }, { status: 400 })
    }

    const cleanRef = String(reference).trim().toUpperCase()
    const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0')
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

    // 🚨 AMOUNT CHECK: Do NOT attach if scanned amount is less than order's bill!
    const targetOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: { include: { menuItem: true } },
        table: true,
        waiter: { select: { fullName: true } }
      }
    })

    const orderTotal = targetOrder?.orderItems?.reduce((acc, i) => acc + (i.menuItem?.price || 0) * i.quantity, 0) || 0
    if (!isNaN(parsedAmount) && orderTotal > 0 && parsedAmount < orderTotal - 0.5) {
      const shortAmt = orderTotal - parsedAmount
      return NextResponse.json({
        success: false,
        underpaid: true,
        orderTotal,
        shortAmount: shortAmt,
        error: `AMOUNT TOO LOW: Scanned amount (${parsedAmount.toFixed(2)} ETB) is less than order bill (${orderTotal.toFixed(2)} ETB). Short by ${shortAmt.toFixed(2)} ETB! Receipt was NOT attached.`
      }, { status: 400 })
    }

    // 1. Update local database
    await prisma.$executeRawUnsafe(
      `UPDATE "Order" 
       SET "verifiedRef" = ?, 
           "verifiedProvider" = ?, 
           "verifiedAmount" = ?, 
           "verifiedPayer" = ?, 
           "verifiedReceiver" = ?, 
           "verifiedAt" = ?, 
           "pendingSync" = 1 
       WHERE id = ?`,
      cleanRef,
      provider || 'AUTO',
      isNaN(parsedAmount) ? null : parsedAmount,
      payerName || null,
      receiverName || null,
      verifiedDate.toISOString(),
      orderId
    )

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
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
                 "verifiedAt" = $6 
             WHERE id = $7`,
            [cleanRef, provider || 'AUTO', isNaN(parsedAmount) ? null : parsedAmount, payerName || null, receiverName || null, verifiedDate, orderId]
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
      provider: provider || 'AUTO',
      amount: parsedAmount,
      payerName: payerName || undefined,
      receiverName: receiverName || undefined,
      timestamp: verifiedDate.toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: `Payment verified for ${updated?.table?.number ? `Table ${updated.table.number}` : 'Order'}!`,
      order: {
        id: updated?.id || orderId,
        tableNumber: updated?.table?.number || '?',
        verifiedRef: cleanRef,
        verifiedProvider: provider,
        verifiedAmount: parsedAmount,
        verifiedPayer: payerName,
        verifiedReceiver: receiverName,
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
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "Order" 
       SET "verifiedRef" = NULL, 
           "verifiedProvider" = NULL, 
           "verifiedAmount" = NULL, 
           "verifiedPayer" = NULL, 
           "verifiedReceiver" = NULL, 
           "verifiedAt" = NULL, 
           "pendingSync" = 1 
       WHERE id = ?`,
      orderId
    )

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
                 "verifiedAt" = NULL 
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
