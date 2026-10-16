import { NextResponse } from 'next/server'
import { getPaymentSettings, savePaymentSettings } from '@/lib/payment-settings'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = getPaymentSettings()
    return NextResponse.json({ success: true, settings })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    // Allow ADMIN or MANAGER to configure receiver credentials
    if (session && session.role !== 'ADMIN' && session.role !== 'MANAGER') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin or Manager role required' }, { status: 403 })
    }

    const body = await req.json()
    const { telebirrReceiverPhone, cbeReceiverAccount, merchantName } = body

    const updated = savePaymentSettings({
      telebirrReceiverPhone: typeof telebirrReceiverPhone === 'string' ? telebirrReceiverPhone.trim() : undefined,
      cbeReceiverAccount: typeof cbeReceiverAccount === 'string' ? cbeReceiverAccount.trim() : undefined,
      merchantName: typeof merchantName === 'string' ? merchantName.trim() : undefined,
    })

    return NextResponse.json({ success: true, settings: updated, message: 'Payment verification settings saved successfully' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
