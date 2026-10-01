import { NextResponse } from 'next/server'
import { verifyEthioReceipt } from '@/lib/ethio-receipt-verifier'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { referenceOrUrl, provider, accountDigits, expectedAmount } = body

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

    return NextResponse.json({
      receipt,
      amountMatches,
      amountDifference,
    })
  } catch (err: any) {
    console.error('[POST /api/verify-receipt]', err)
    return NextResponse.json(
      { error: err.message || 'Receipt verification failed' },
      { status: 500 }
    )
  }
}
