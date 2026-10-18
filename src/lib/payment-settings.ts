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
let cachedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes in-memory cache
let tableEnsured = false

/**
 * Ensure SystemSetting table exists in the active database (SQLite or PostgreSQL)
 */
export async function ensureSystemSettingTable(): Promise<void> {
  if (tableEnsured) return
  tableEnsured = true

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

  // If running in local SQLite environment with remote Neon configured, ensure Neon also has the table lazily in background
  const neonUrl = process.env.NEON_DATABASE_URL
  if (!process.env.VERCEL && neonUrl) {
    import('pg').then(({ Pool }) => {
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 })
      pool.query(`
        CREATE TABLE IF NOT EXISTS "SystemSetting" (
          "key" TEXT PRIMARY KEY NOT NULL,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(() => {}).finally(() => pool.end().catch(() => {}))
    }).catch(() => {})
  }
}

/**
 * Get current Payment Verification Settings (Telebirr receiver, CBE receiver account)
 * Uses high-speed in-memory cache (<0.1ms) and local SQLite (<1ms), avoiding multi-second remote roundtrips.
 */
export async function getPaymentSettings(forceRefresh = false): Promise<PaymentVerificationSettings> {
  // 0. High-speed in-memory cache hit
  if (!forceRefresh && cachedSettings && (Date.now() - cachedAt < CACHE_TTL_MS)) {
    return cachedSettings
  }

  try {
    // 1. Try reading from active Database (Local SQLite or Vercel Postgres) - ultra-fast (<1ms)
    try {
      const rows = await prisma.$queryRawUnsafe<{ key: string; value: string }[]>(
        `SELECT "key", "value" FROM "SystemSetting" WHERE "key" = '${SETTINGS_KEY}' LIMIT 1`
      )

      if (rows && rows.length > 0 && rows[0]?.value) {
        const parsed = JSON.parse(rows[0].value)
        cachedSettings = {
          telebirrReceiverPhone: parsed.telebirrReceiverPhone || '',
          cbeReceiverAccount: parsed.cbeReceiverAccount || process.env.DEFAULT_CBE_ACCOUNT || '',
          merchantName: parsed.merchantName || 'Kogna Coffee',
          lastUpdated: parsed.lastUpdated,
        }
        cachedAt = Date.now()
        return cachedSettings
      }
    } catch {
      // Table might not exist yet on fresh install
      await ensureSystemSettingTable()
    }

    // 2. Fast fallback: check legacy JSON file if exists (<1ms)
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
        cachedAt = Date.now()
        return cachedSettings
      } catch (fileErr) {
        console.warn('[PaymentSettings] Error reading settings file:', fileErr)
      }
    }

    // 3. Last fallback if running locally with remote Neon configured and database was empty
    const neonUrl = process.env.NEON_DATABASE_URL
    if (!process.env.VERCEL && neonUrl) {
      try {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 })
        const cloudRes = await pool.query(
          `SELECT "key", "value" FROM "SystemSetting" WHERE "key" = $1 LIMIT 1`,
          [SETTINGS_KEY]
        )
        await pool.end().catch(() => {})
        if (cloudRes.rows.length > 0 && cloudRes.rows[0]?.value) {
          const parsed = JSON.parse(cloudRes.rows[0].value)
          await prisma.$executeRaw`
            INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
            VALUES (${SETTINGS_KEY}, ${cloudRes.rows[0].value}, CURRENT_TIMESTAMP)
            ON CONFLICT ("key") DO UPDATE SET "value" = ${cloudRes.rows[0].value}, "updatedAt" = CURRENT_TIMESTAMP
          `.catch(() => {})

          cachedSettings = {
            telebirrReceiverPhone: parsed.telebirrReceiverPhone || '',
            cbeReceiverAccount: parsed.cbeReceiverAccount || process.env.DEFAULT_CBE_ACCOUNT || '',
            merchantName: parsed.merchantName || 'Kogna Coffee',
            lastUpdated: parsed.lastUpdated,
          }
          cachedAt = Date.now()
          return cachedSettings
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[PaymentSettings] Error querying settings:', err)
  }

  // 4. Fallback to cached settings or environment defaults
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

  // 2. If running locally with remote Neon configured, sync to Neon in background (non-blocking)
  const neonUrl = process.env.NEON_DATABASE_URL
  if (!process.env.VERCEL && neonUrl) {
    import('pg').then(({ Pool }) => {
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 })
      pool.query(
        `INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;`,
        [SETTINGS_KEY, val]
      ).catch((neonErr: any) => {
        console.warn('[PaymentSettings] Remote Neon sync warning:', neonErr?.message)
      }).finally(() => pool.end().catch(() => {}))
    }).catch(() => {})
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
  cachedAt = Date.now()
  return updated
}
