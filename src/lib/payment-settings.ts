import fs from 'fs'
import path from 'path'

export interface PaymentVerificationSettings {
  telebirrReceiverPhone: string
  cbeReceiverAccount: string
  merchantName?: string
  lastUpdated?: string
}

const SETTINGS_FILE = path.join(process.cwd(), 'prisma', 'payment-settings.json')

export function getPaymentSettings(): PaymentVerificationSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        telebirrReceiverPhone: parsed.telebirrReceiverPhone || '',
        cbeReceiverAccount: parsed.cbeReceiverAccount || process.env.DEFAULT_CBE_ACCOUNT || '',
        merchantName: parsed.merchantName || 'Kogna Coffee',
        lastUpdated: parsed.lastUpdated,
      }
    }
  } catch (err) {
    console.warn('[PaymentSettings] Error reading settings file:', err)
  }

  return {
    telebirrReceiverPhone: '',
    cbeReceiverAccount: process.env.DEFAULT_CBE_ACCOUNT || '',
    merchantName: 'Kogna Coffee',
  }
}

export function savePaymentSettings(settings: Partial<PaymentVerificationSettings>): PaymentVerificationSettings {
  const current = getPaymentSettings()
  const updated: PaymentVerificationSettings = {
    ...current,
    ...settings,
    lastUpdated: new Date().toISOString(),
  }

  try {
    const dir = path.dirname(SETTINGS_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8')
  } catch (err) {
    console.error('[PaymentSettings] Failed to save settings file:', err)
    throw err
  }

  return updated
}
