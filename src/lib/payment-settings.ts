import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'

export interface PaymentVerificationSettings {
  telebirrReceiverPhone: string
  cbeReceiverAccount: string
  merchantName?: string
  lastUpdated?: string
}

const SETTINGS_KEY = 'PAYMENT_VERIFICATION'
const SETTINGS_FILE = path.join(process.cwd(), 'prisma', 'payment-settings.json')

let cachedSettings: PaymentVerificationSettings | null = null

/**
 * Ensure SystemSetting table exists in the active database (SQLite or PostgreSQL)
 */
export async function ensureSystemSettingTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key" TEXT PRIMARY KEY NOT NULL,
        "value" TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
  } catch (err) {
    console.warn('[ensureSystemSettingTable]', err)
  }

  // If running in local SQLite environment with remote Neon configured, ensure Neon also has the table
  const neonUrl = process.env.NEON_DATABASE_URL
  if (!process.env.VERCEL && neonUrl) {
    try {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } })
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "SystemSetting" (
          "key" TEXT PRIMARY KEY NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(() => {})
      await pool.end().catch(() => {})
    } catch (err) {
      console.warn('[ensureSystemSettingTable Neon]', err)
    }
  }
}

/**
 * Get current Payment Verification Settings (Telebirr receiver, CBE receiver account)
 * Reads from Database first, with fallback to legacy JSON file or defaults.
 */
export async function getPaymentSettings(): Promise<PaymentVerificationSettings> {
  try {
    await ensureSystemSettingTable()

    // 1. Try reading from Database
    const rows = await prisma.$queryRawUnsafe<{ key: string; value: string }[]>(
      `SELECT "key", "value" FROM "SystemSetting" WHERE "key" = '${SETTINGS_KEY}' LIMIT 1`
    )

    if (rows && rows.length > 0 && rows[0]?.value) {
      try {
        const parsed = JSON.parse(rows[0].value)
        cachedSettings = {
          telebirrReceiverPhone: parsed.telebirrReceiverPhone || '',
          cbeReceiverAccount: parsed.cbeReceiverAccount || process.env.DEFAULT_CBE_ACCOUNT || '',
          merchantName: parsed.merchantName || 'Kogna Coffee',
          lastUpdated: parsed.lastUpdated,
        }
        return cachedSettings
      } catch (parseErr) {
        console.warn('[PaymentSettings] Error parsing DB settings JSON:', parseErr)
      }
    }

    // 2. Fallback: check legacy JSON file if exists
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
        const parsed = JSON.parse(raw)
        cachedSettings = {
          telebirrReceiverPhone: parsed.telebirrReceiverPhone || '',
          cbeReceiverAccount: parsed.cbeReceiverAccount || process.env.DEFAULT_CBE_ACCOUNT || '',
          merchantName: parsed.merchantName || 'Kogna Coffee',
          lastUpdated: parsed.lastUpdated,
        }
        return cachedSettings
      } catch (fileErr) {
        console.warn('[PaymentSettings] Error reading settings file:', fileErr)
      }
    }
  } catch (err) {
    console.warn('[PaymentSettings] Error querying settings:', err)
  }

  // 3. Fallback to cached settings or environment defaults
  if (cachedSettings) return cachedSettings

  return {
    telebirrReceiverPhone: '',
    cbeReceiverAccount: process.env.DEFAULT_CBE_ACCOUNT || '',
    merchantName: 'Kogna Coffee',
  }
}

/**
 * Synchronous accessor for cached settings (or defaults)
 */
export function getPaymentSettingsSync(): PaymentVerificationSettings {
  if (cachedSettings) return cachedSettings
  return {
    telebirrReceiverPhone: '',
    cbeReceiverAccount: process.env.DEFAULT_CBE_ACCOUNT || '',
    merchantName: 'Kogna Coffee',
  }
}

/**
 * Save updated Payment Verification Settings.
 * Persists directly to the Database (Neon Postgres on Vercel, SQLite locally),
 * syncs to Neon if on local POS with NEON_DATABASE_URL,
 * and safely writes to local file only in writable environments (ignoring EROFS).
 */
export async function savePaymentSettings(
  settings: Partial<PaymentVerificationSettings>
): Promise<PaymentVerificationSettings> {
  const current = await getPaymentSettings()
  const updated: PaymentVerificationSettings = {
    ...current,
    ...settings,
    lastUpdated: new Date().toISOString(),
  }

  const val = JSON.stringify(updated)

  // 1. Persist to active database (Neon PostgreSQL on Vercel, SQLite locally)
  try {
    await ensureSystemSettingTable()

    await prisma.$executeRaw`
      INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
      VALUES (${SETTINGS_KEY}, ${val}, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET "value" = ${val}, "updatedAt" = CURRENT_TIMESTAMP
    `
  } catch (dbErr) {
    console.error('[PaymentSettings] Failed to save settings to database:', dbErr)
    throw dbErr
  }

  // 2. If running locally with remote Neon configured, sync to Neon too
  const neonUrl = process.env.NEON_DATABASE_URL
  if (!process.env.VERCEL && neonUrl) {
    try {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } })
      await pool.query(
        `INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;`,
        [SETTINGS_KEY, val]
      )
      await pool.end().catch(() => {})
    } catch (neonErr: any) {
      console.warn('[PaymentSettings] Remote Neon sync warning:', neonErr?.message)
    }
  }

  // 3. Attempt local file update ONLY if not in a serverless read-only environment
  if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const dir = path.dirname(SETTINGS_FILE)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8')
    } catch (fsErr) {
      console.warn('[PaymentSettings] Local file sync skipped (read-only filesystem):', fsErr)
    }
  }

  cachedSettings = updated
  return updated
}
