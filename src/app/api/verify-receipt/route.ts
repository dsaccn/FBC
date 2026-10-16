import { NextResponse } from 'next/server'
import { verifyEthioReceipt } from '@/lib/ethio-receipt-verifier'
import { prisma } from '@/lib/prisma'
import { Client as PgClient } from 'pg'
import { broadcastVerificationEvent } from '@/lib/scanner-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { referenceOrUrl, provider, accountDigits, expectedAmount, orderId } = body

    if (!referenceOrUrl || typeof referenceOrUrl !== 'string') {
      return NextResponse.json(
        { error: 'Transaction reference, code, or receipt URL is required' },
        { status: 400 }
      )
    }

    const receipt = await verifyEthioReceipt({
      referenceOrUrl: referenceOrUrl.trim(),
      provider,
      accountDigits,
      expectedAmount: typeof expectedAmount === 'number' ? expectedAmount : undefined,
    })

    let amountMatches = true
    let amountDifference = 0

    if (receipt.success && typeof receipt.amount === 'number' && typeof expectedAmount === 'number' && expectedAmount > 0) {
      // Allow +/- 0.50 margin for rounding
      amountMatches = Math.abs(receipt.amount - expectedAmount) < 0.5 || receipt.amount >= expectedAmount
      amountDifference = receipt.amount - expectedAmount
    }

    let linkedOrder: any = null

    // If verification succeeded
    if (receipt.success) {
      const cleanRef = String(receipt.reference || referenceOrUrl).trim().toUpperCase()

      // 🚨 DUPLICATE PROTECTION: Check if this transaction code was already used on a PAID order or delivery
      const duplicatePaidOrder = await prisma.order.findFirst({
        where: {
          verifiedRef: cleanRef,
          status: 'PAID',
          ...(orderId ? { id: { not: orderId } } : {})
        },
        include: {
          table: true,
          payment: true,
        }
      })

      const duplicatePaidPayment = !duplicatePaidOrder ? await prisma.payment.findFirst({
        where: {
          notes: { contains: cleanRef },
          order: {
            status: 'PAID',
            ...(orderId ? { id: { not: orderId } } : {})
          }
        },
        include: {
          order: { include: { table: true } }
        }
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
          error: `DUPLICATE RECEIPT: Transaction code ${cleanRef} was ALREADY paid & closed for ${tableLabel} on ${dateStr}! It cannot be reused.`,
          receipt: {
            ...receipt,
            success: false,
            errorMessage: `Duplicate Receipt: Already used for ${tableLabel} (${dateStr})`
          }
        }, { status: 400 })
      }

      const parsedAmount = typeof receipt.amount === 'number' ? receipt.amount : parseFloat(String(receipt.amount || '0'))
      const verifiedDate = new Date()

      // Case 1: An order was selected -> INSTANTLY link it and broadcast to Cashier POS in 0ms!
      if (orderId) {
        try {
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
            receipt.provider || provider || 'AUTO',
            isNaN(parsedAmount) ? null : parsedAmount,
            receipt.payerName || null,
            receipt.receiverName || null,
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

          linkedOrder = {
            id: updated?.id || orderId,
            tableNumber: updated?.table?.number || '?',
            verifiedRef: cleanRef,
            verifiedProvider: receipt.provider || provider || 'AUTO',
            verifiedAmount: parsedAmount,
            verifiedPayer: receipt.payerName,
            verifiedReceiver: receipt.receiverName,
            verifiedAt: verifiedDate,
          }

          // Best-effort async push to Neon
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
                  [cleanRef, receipt.provider || provider || 'AUTO', isNaN(parsedAmount) ? null : parsedAmount, receipt.payerName || null, receipt.receiverName || null, verifiedDate, orderId]
                )
              )
              .then(() => pg.end())
              .catch(err => {
                console.warn('[Sync to Neon failed for instant verification]', err?.message)
                try { pg.end() } catch {}
              })
          }

          // Broadcast instant ORDER_VERIFIED to PC Cashier POS screen
          broadcastVerificationEvent({
            type: 'ORDER_VERIFIED',
            orderId,
            tableNumber: updated?.table?.number,
            reference: cleanRef,
            provider: receipt.provider || provider || 'AUTO',
            amount: parsedAmount,
            payerName: receipt.payerName || undefined,
            receiverName: receipt.receiverName || undefined,
            timestamp: verifiedDate.toISOString(),
          })
        } catch (dbErr) {
          console.error('[Instant Order Link Error in verify-receipt]', dbErr)
        }
      } else {
        // Case 2: No order was selected yet -> Broadcast general RECEIPT_SCANNED to PC POS
        broadcastVerificationEvent({
          type: 'RECEIPT_SCANNED',
          reference: cleanRef,
          provider: receipt.provider || provider || 'AUTO',
          amount: parsedAmount,
          payerName: receipt.payerName || undefined,
          receiverName: receipt.receiverName || undefined,
          timestamp: verifiedDate.toISOString(),
        })
      }
    }

    return NextResponse.json({
      receipt,
      amountMatches,
      amountDifference,
      linkedOrder,
    })
  } catch (err: any) {
    console.error('[POST /api/verify-receipt]', err)
    return NextResponse.json(
      { error: err.message || 'Receipt verification failed' },
      { status: 500 }
    )
  }
}
