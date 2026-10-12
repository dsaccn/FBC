import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export interface AbebeCredentialRecord {
  id: string
  username: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Ensure AbebeCredential table exists in local SQLite and remote Neon PostgreSQL
 */
export async function ensureAbebeCredentialTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AbebeCredential" (
        "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'master_root',
        "username" TEXT NOT NULL DEFAULT 'ROOT',
        "passwordHash" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  } catch (err) {
    console.warn('[SQLite ensureAbebeCredentialTable]', err)
  }

  const neonUrl = process.env.NEON_DATABASE_URL
  if (neonUrl) {
    try {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } })
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "AbebeCredential" (
          "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'master_root',
          "username" TEXT NOT NULL DEFAULT 'ROOT',
          "passwordHash" TEXT NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `).catch(() => {})
      await pool.end().catch(() => {})
    } catch (err) {
      console.warn('[Neon ensureAbebeCredentialTable]', err)
    }
  }
}

/**
 * Retrieve the active standalone Management Portal credentials
 */
export async function getAbebeCredential(): Promise<AbebeCredentialRecord | null> {
  await ensureAbebeCredentialTable()

  try {
    const rows = await prisma.$queryRawUnsafe<AbebeCredentialRecord[]>(
      `SELECT id, username, "passwordHash", "createdAt", "updatedAt" FROM "AbebeCredential" LIMIT 1`
    )
    if (rows && rows.length > 0) {
      return rows[0]
    }
  } catch (err) {
    console.error('[getAbebeCredential] Error:', err)
  }

  return null
}

/**
 * Verify management portal password with case tolerance
 */
export async function verifyAbebePassword(inputPassword: string, storedHash: string): Promise<boolean> {
  if (!inputPassword || !storedHash) return false

  let match = await bcrypt.compare(inputPassword, storedHash)
  if (!match) {
    if (await bcrypt.compare(inputPassword.toUpperCase(), storedHash)) {
      match = true
    } else if (await bcrypt.compare(inputPassword.toLowerCase(), storedHash)) {
      match = true
    }
  }
  return match
}

/**
 * Update standalone management credentials in both local SQLite and remote Neon PostgreSQL
 * NEVER modifies the POS User table!
 */
export async function updateAbebeCredential(newUsername: string, newPassword: string): Promise<AbebeCredentialRecord> {
  await ensureAbebeCredentialTable()

  const trimmedUsername = newUsername.trim()
  const newPasswordHash = await bcrypt.hash(newPassword, 10)
  const now = new Date()

  // 1. Update SQLite
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AbebeCredential" (id, username, "passwordHash", "createdAt", "updatedAt")
     VALUES ('master_root', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET username = excluded.username, "passwordHash" = excluded."passwordHash", "updatedAt" = CURRENT_TIMESTAMP`,
    trimmedUsername,
    newPasswordHash
  )

  // 2. Update remote Neon PostgreSQL if configured
  const neonUrl = process.env.NEON_DATABASE_URL
  if (neonUrl) {
    try {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } })
      await pool.query(
        `INSERT INTO "AbebeCredential" (id, username, "passwordHash", "createdAt", "updatedAt")
         VALUES ('master_root', $1, $2, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = NOW();`,
        [trimmedUsername, newPasswordHash]
      )
      await pool.end()
    } catch (err: any) {
      console.error('[Neon updateAbebeCredential error]', err.message)
    }
  }

  return {
    id: 'master_root',
    username: trimmedUsername,
    passwordHash: newPasswordHash,
    createdAt: now,
    updatedAt: now,
  }
}
