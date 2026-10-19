import { NextResponse } from 'next/server'
import { verifyEthioReceipt, extractTelebirrTransactionId } from '@/lib/ethio-receipt-verifier'
import { prisma } from '@/lib/prisma'
import { Client as PgClient } from 'pg'
import { broadcastVerificationEvent } from '@/lib/scanner-events'
import { checkReceiptDuplicate, extractTransactionReference } from '@/lib/receipt-dedup'

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

    const trimmedInput = referenceOrUrl.trim()
    const extractedRef = extractTransactionReference(trimmedInput) || extractTelebirrTransactionId(trimmedInput) || trimmedInput.toUpperCase()

    // 🚨 1. DUPLICATE PROTECTION: Run FIRST! Instant check in local DB/Neon (<2ms) before slow bank networks
    if (extractedRef) {
      const duplicateConflict = await checkReceiptDuplicate(extractedRef, orderId)
      if (duplicateConflict) {
        return NextResponse.json({
          success: false,
          duplicate: true,
          error: duplicateConflict.errorMessage,
          receipt: {
            success: false,
            reference: extractedRef,
            provider: provider || (extractedRef.startsWith('FT') ? 'CBE' : 'TELEBIRR'),
            status: 'FAILED',
            isDuplicate: true,
            errorMessage: duplicateConflict.errorMessage,
          }
        }, { status: 400 })
      }
    }

    const receipt = await verifyEthioReceipt({
      referenceOrUrl: trimmedInput,
      provider,
      accountDigits,
      expectedAmount: typeof expectedAmount === 'number' ? expectedAmount : undefined,
    })

    // 🚨 2. WRONG RECEIVER MISMATCH: Immediately flag fraud/wrong payment
    if (receipt.isReceiverMatched === false) {
      return NextResponse.json({
        success: false,
        receiverMismatch: true,
        error: receipt.errorMessage || 'RECEIVER MISMATCH: Payment was NOT credited to your business account!',
        receipt,
      }, { status: 400 })
    }

    let amountMatches = true
    let amountDifference = 0
    let isUnderpaid = false

    if (receipt.success && typeof receipt.amount === 'number' && typeof expectedAmount === 'number' && expectedAmount > 0) {
      // Allow +/- 0.50 margin for rounding
      amountMatches = Math.abs(receipt.amount - expectedAmount) < 0.5 || receipt.amount >= expectedAmount
      amountDifference = receipt.amount - expectedAmount
      if (receipt.amount < expectedAmount - 0.5) {
        isUnderpaid = true
      }
    }

    let linkedOrder: any = null

    // If verification succeeded
    if (receipt.success) {
      const cleanRef = String(receipt.reference || extractedRef || trimmedInput).trim().toUpperCase()

      // Double-check duplicate protection just in case reference was updated by bank receipt payload
      const duplicateConflict = await checkReceiptDuplicate(cleanRef, orderId)
      if (duplicateConflict) {
        return NextResponse.json({
          success: false,
          duplicate: true,
          error: duplicateConflict.errorMessage,
          receipt: {
            ...receipt,
            success: false,
            isDuplicate: true,
            errorMessage: duplicateConflict.errorMessage,
          }
        }, { status: 400 })
      }

      const parsedAmount = typeof receipt.amount === 'number' ? receipt.amount : parseFloat(String(receipt.amount || '0'))
      const verifiedDate = new Date()

      // Case 1: An order was selected -> Check bill total! DO NOT ATTACH IF LESS!
      if (orderId) {
        try {
          const targetOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
              orderItems: { include: { menuItem: true } },
              table: true,
              waiter: { select: { fullName: true } }
            }
          })

          const orderTotal = targetOrder?.orderItems?.reduce((acc, i) => acc + (i.menuItem?.price || 0) * i.quantity, 0) || 0
          const orderUnderpaid = Boolean(orderTotal > 0 && !isNaN(parsedAmount) && parsedAmount < orderTotal - 0.5)

          if (orderUnderpaid) {
            const shortAmt = orderTotal - parsedAmount
            // 🚨 DO NOT ATTACH THE RECEIPT TO THE ORDER!
            return NextResponse.json({
              success: false,
              underpaid: true,
              orderTotal,
              shortAmount: shortAmt,
              error: `AMOUNT TOO LOW: Scanned amount (${parsedAmount.toFixed(2)} ETB) is less than the order bill (${orderTotal.toFixed(2)} ETB). Receipt was NOT attached!`,
              receipt: {
                ...receipt,
                success: false,
                isUnderpaid: true,
                errorMessage: `AMOUNT TOO LOW: Scanned amount (${parsedAmount.toFixed(2)} ETB) is less than the bill of ${orderTotal.toFixed(2)} ETB. Short by ${shortAmt.toFixed(2)} ETB! Receipt was NOT attached. Customer must pay full amount.`,
              },
              amountMatches: false,
              amountDifference: parsedAmount - orderTotal,
              linkedOrder: null,
            }, { status: 400 })
          }

          // Full payment or tip -> safely link to order
          await prisma.order.update({
            where: { id: orderId },
            data: {
              verifiedRef: cleanRef,
              verifiedProvider: receipt.provider || provider || 'AUTO',
              verifiedAmount: isNaN(parsedAmount) ? null : parsedAmount,
              verifiedPayer: receipt.payerName || null,
              verifiedReceiver: receipt.receiverName || null,
              verifiedAt: verifiedDate,
              pendingSync: true,
            }
          })

          linkedOrder = {
            id: targetOrder?.id || orderId,
            tableNumber: targetOrder?.table?.number || '?',
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
            tableNumber: targetOrder?.table?.number,
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
