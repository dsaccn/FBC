import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Client as PgClient } from 'pg'
import { broadcastVerificationEvent } from '@/lib/scanner-events'

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

    // 🚨 DUPLICATE PROTECTION: Check if this transaction code was already used on a PAID order or delivery
    const duplicatePaidOrder = await prisma.order.findFirst({
      where: {
        verifiedRef: cleanRef,
        status: 'PAID',
        id: { not: orderId }
      },
      include: { table: true, payment: true }
    })

    const duplicatePaidPayment = !duplicatePaidOrder ? await prisma.payment.findFirst({
      where: {
        notes: { contains: cleanRef },
        order: {
          status: 'PAID',
          id: { not: orderId }
        }
      },
      include: { order: { include: { table: true } } }
    }) : null

    const conflictOrder = duplicatePaidOrder || duplicatePaidPayment?.order
    if (conflictOrder) {
      const rawTable = conflictOrder.table?.number || '?'
      const isDeliv = rawTable.startsWith('DELIV') || rawTable.startsWith('Delivery')
      const isTake = rawTable.startsWith('TAKE') || rawTable.startsWith('Takeaway')
      const tableLabel = isDeliv 
        ? `Delivery #${rawTable.replace(/^[A-Za-z-]+/, '')}`
        : (isTake ? `Takeaway #${rawTable.replace(/^[A-Za-z-]+/, '')}` : `Table ${rawTable}`)
      const paidAtStr = duplicatePaidOrder?.payment?.createdAt || duplicatePaidPayment?.createdAt || conflictOrder.updatedAt
      const dateStr = paidAtStr ? new Date(paidAtStr).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }) : 'earlier'

      return NextResponse.json({
        success: false,
        duplicate: true,
        error: `DUPLICATE RECEIPT: Transaction code ${cleanRef} was ALREADY paid & closed for ${tableLabel} on ${dateStr}! It cannot be reused.`
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
