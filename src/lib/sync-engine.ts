/**
 * sync-engine.ts — v3 (bidirectional)
 *
 * PUSH: local SQLite (pendingSync=true) → Neon
 * PULL: Neon OPEN orders not present locally → local SQLite
 *
 * Design:
 *  - getPool() creates one shared pg.Pool, reused across requests.
 *  - isSyncing guard serialises concurrent sync runs.
 *  - pullFromCloud() uses record ID presence to decide what to insert:
 *      • Order exists locally + pendingSync=true  → local wins, skip
 *      • Order exists locally + pendingSync=false → sync status from cloud
 *      • Order not in local at all               → it's cloud-native, insert it
 *  - On Vercel every function is a no-op (Vercel writes directly to Neon).
 */

import { prisma } from '@/lib/prisma'
import { Pool as PgPool, types as pgTypes } from 'pg'
import fs from 'fs'
import path from 'path'
import { broadcastVerificationEvent } from '@/lib/scanner-events'

const TOMBSTONES_FILE = process.env.VERCEL
  ? path.join('/tmp', '.deleted_users.json')
  : path.join(process.cwd(), '.deleted_users.json')

interface DeletedUserEntry {
  id?: string
  username?: string
  deletedAt: string
}

function getDeletedUsers(): DeletedUserEntry[] {
  try {
    if (fs.existsSync(TOMBSTONES_FILE)) {
      const data = fs.readFileSync(TOMBSTONES_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.warn('[SyncEngine] Error reading deleted users tombstone file:', err)
  }
  return []
}

export function recordDeletedUser(id?: string | null, username?: string | null): void {
  const safeId = (id && typeof id === 'string' && id.trim()) ? id.trim() : ''
  const safeUsername = (username && typeof username === 'string' && username.trim()) ? username.trim() : ''
  if (!safeId && !safeUsername) return

  try {
    const list = getDeletedUsers()
    if (!list.some(e => (safeId && e.id === safeId) || (safeUsername && e.username === safeUsername))) {
      list.push({ id: safeId || undefined, username: safeUsername || undefined, deletedAt: new Date().toISOString() })
      fs.writeFileSync(TOMBSTONES_FILE, JSON.stringify(list, null, 2), 'utf8')
    }
  } catch (err) {
    console.warn('[SyncEngine] Error recording deleted user tombstone:', err)
  }
}

export function isUserDeleted(id?: string | null, username?: string | null, createdAt?: Date | string | null): boolean {
  const safeId = (id && typeof id === 'string' && id.trim()) ? id.trim() : ''
  const safeUsername = (username && typeof username === 'string' && username.trim()) ? username.trim().toLowerCase() : ''
  if (!safeId && !safeUsername) return false

  // Protected system accounts can NEVER be deleted!
  if (safeUsername === 'master' || safeUsername === 'admin' || safeUsername === 'admin10' || safeUsername === 'master_console') {
    return false
  }

  const list = getDeletedUsers()
  return list.some(e => {
    // If the tombstone was created BEFORE this user was created, this is a fresh user!
    if (createdAt && e.deletedAt) {
      const createdTime = new Date(createdAt).getTime()
      const deletedTime = new Date(e.deletedAt).getTime()
      if (createdTime > deletedTime) return false
    }
    if (safeId && e.id && e.id === safeId) return true
    if (safeUsername && e.username && e.username.toLowerCase() === safeUsername) return true
    return false
  })
}

export async function clearDeletedUser(id?: string | null, username?: string | null): Promise<void> {
  const safeId = (id && typeof id === 'string' && id.trim()) ? id.trim() : ''
  const safeUsername = (username && typeof username === 'string' && username.trim()) ? username.trim() : ''
  if (!safeId && !safeUsername) return

  try {
    const list = getDeletedUsers()
    const updated = list.filter(e => {
      if (safeId && e.id === safeId) return false
      if (safeUsername && e.username && e.username.toLowerCase() === safeUsername.toLowerCase()) return false
      return true
    })
    fs.writeFileSync(TOMBSTONES_FILE, JSON.stringify(updated, null, 2), 'utf8')
  } catch (err) {
    console.warn('[SyncEngine] Error clearing deleted user tombstone:', err)
  }

  // Also remove matching tombstone from Neon's DeletedUser table
  try {
    await deleteFromCloud(
      `DELETE FROM "DeletedUser" WHERE LOWER(username) = LOWER($1) OR (id IS NOT NULL AND id = $2)`,
      [safeUsername || '__none__', safeId || '__none__']
    )
  } catch {
    // ignore
  }
}


// Crucial: In PostgreSQL, createdAt/updatedAt are 'timestamp without time zone' (OID 1114).
// By default, node-postgres parses OID 1114 into local machine time, which offsets
// timestamps by +03:00 on Windows/Addis Ababa and corrupts sync between local & cloud.
// We force pg to treat all timestamps from Postgres strictly as UTC.
pgTypes.setTypeParser(1114, (str: string) => {
  return str.includes('Z') || str.includes('+') ? new Date(str) : new Date(str.replace(' ', 'T') + 'Z')
})
pgTypes.setTypeParser(1184, (str: string) => new Date(str))

export const toUtcIso = (d: any): string | null => {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean
  synced: { orders: number; orderItems: number; payments: number; cancellations: number; inventoryLogs: number; tables?: number; staffMembers?: number; staffMenuItems?: number; staffIngredients?: number; staffRecipes?: number; staffMeals?: number; staffMealItems?: number }
  pulled: { orders: number; orderItems: number }
  errors: string[]
  lastSyncedAt: Date | null
}

// ─── Shared pool (created lazily, reused across requests) ─────────────────────

let _pool: PgPool | null = null

function getPool(): PgPool {
  if (!_pool || (_pool as any).ending || (_pool as any).ended) {
    _pool = null
    const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    if (!url) throw new Error('Neither NEON_DATABASE_URL nor DATABASE_URL is set in environment')
    _pool = new PgPool({
      connectionString: url,
      max: 3,
      // 15 s — give Neon plenty of time to wake up from cold start
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: false },
    })
    _pool.on('error', (err) => {
      console.warn('[SyncEngine] Pool error (offline?):', err.message)
      // Destroy the pool so the next sync attempt creates a fresh one
      _pool = null
    })
  }
  return _pool
}

/** Destroy the pool so the next call to getPool() creates a fresh connection.
 *  Called when a sync fails due to network error so we don't reuse a dead pool. */
function resetPool() {
  if (_pool) {
    const old = _pool
    _pool = null
    old.end().catch(() => {})
  }
}

/**
 * Run arbitrary DELETE/UPDATE SQL against Neon immediately.
 * Silently swallows errors (offline, pool not ready, etc.) — the sync engine's
 * push-diff will finish the job on the next successful sync.
 */
export async function deleteFromCloud(sql: string, params: unknown[]): Promise<void> {
  try {
    if (process.env.VERCEL) {
      await (prisma as any).$executeRawUnsafe(sql, ...params).catch(() => {})
      return
    }
    const pg = getPool()
    await pg.query(sql, params)
  } catch (err: any) {
    console.warn('[SyncEngine] deleteFromCloud error:', err?.message)
    // Offline or pool error — sync engine will reconcile on next push
  }
}

/**
 * Push staff user creation/update directly to Neon immediately.
 */
export async function pushUserToCloud(u: {
  id: string
  username: string
  passwordHash?: string
  fullName: string
  role: string
  phone?: string | null
  active: boolean
  createdAt?: Date
}): Promise<void> {
  // Ensure user is removed from deletion tombstones locally and in cloud
  await clearDeletedUser(u.id, u.username)

  if (process.env.VERCEL) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM "DeletedUser" WHERE LOWER(username) = LOWER($1) OR (id IS NOT NULL AND id = $2)`,
        u.username,
        u.id
      ).catch(() => {})
    } catch {}
    return
  }

  try {
    const pg = getPool()
    if (u.username) {
      await pg.query(
        `DELETE FROM "DeletedUser" WHERE LOWER(username) = LOWER($1) OR (id IS NOT NULL AND id = $2)`,
        [u.username, u.id]
      ).catch(() => {})
    }

    if (u.passwordHash) {
      await pg.query(
        `INSERT INTO "User" (id, username, "passwordHash", "fullName", role, phone, active, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO UPDATE SET
           id             = EXCLUDED.id,
           "passwordHash" = EXCLUDED."passwordHash",
           "fullName"     = EXCLUDED."fullName",
           role           = EXCLUDED.role,
           phone          = EXCLUDED.phone,
           active         = EXCLUDED.active`,
        [u.id, u.username, u.passwordHash, u.fullName, u.role, u.phone ?? null, u.active, u.createdAt ?? new Date()]
      )
    } else {
      await pg.query(
        `UPDATE "User" SET
           username   = $1,
           "fullName" = $2,
           role       = $3,
           phone      = $4,
           active     = $5
         WHERE id = $6 OR username = $1`,
        [u.username, u.fullName, u.role, u.phone ?? null, u.active, u.id]
      )
    }
  } catch (err: any) {
    console.warn('[SyncEngine] pushUserToCloud error:', err?.message)
  }
}

/**
 * Permanently delete a staff user and cascading relationships from Cloud (Neon)
 * matching both by ID and by username.
 */
export async function deleteUserFromCloud(id: string, username?: string): Promise<void> {
  // 1. Immediately record tombstone locally
  recordDeletedUser(id, username)

  try {
    const pg = getPool()
    const uname = username || null
    if (uname) {
      await pg.query(
        `INSERT INTO "DeletedUser" (id, username, "deletedAt")
         VALUES ($1, $2, NOW())
         ON CONFLICT (username) DO UPDATE SET "deletedAt" = NOW()`,
        [id, uname]
      ).catch((err: any) => console.warn('[SyncEngine] Error inserting DeletedUser tombstone:', err?.message))
    }

    // Purge user and cascading relationships from Neon (runs on both local POS and Vercel)
    await pg.query(`DELETE FROM "ShiftLog" WHERE "userId" = $1 OR ($2::text IS NOT NULL AND "userId" IN (SELECT id FROM "User" WHERE username = $2))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "Cancellation" WHERE "managerId" = $1 OR ($2::text IS NOT NULL AND "managerId" IN (SELECT id FROM "User" WHERE username = $2))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "Payment" WHERE "cashierId" = $1 OR ($2::text IS NOT NULL AND "cashierId" IN (SELECT id FROM "User" WHERE username = $2))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "Cancellation" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1 OR ($2::text IS NOT NULL AND "waiterId" IN (SELECT id FROM "User" WHERE username = $2))))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1 OR ($2::text IS NOT NULL AND "waiterId" IN (SELECT id FROM "User" WHERE username = $2)))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1 OR ($2::text IS NOT NULL AND "waiterId" IN (SELECT id FROM "User" WHERE username = $2)))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "Order" WHERE "waiterId" = $1 OR ($2::text IS NOT NULL AND "waiterId" IN (SELECT id FROM "User" WHERE username = $2))`, [id, uname]).catch(() => {})
    await pg.query(`DELETE FROM "User" WHERE id = $1 OR ($2::text IS NOT NULL AND username = $2)`, [id, uname]).catch(() => {})
  } catch (err: any) {
    console.warn('[SyncEngine] deleteUserFromCloud error:', err?.message)
    resetPool()
  }
}

/**
 * Push an ingredient upsert directly to Neon immediately.
 */
export async function pushIngredientToCloud(i: {
  id: string
  name: string
  unit: string
  quantity: number
  barQuantity?: number
  costPerUnit?: number
  minThreshold: number
  createdAt: Date
}): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    await pg.query(
      `INSERT INTO "Ingredient" (id, name, unit, quantity, "barQuantity", "costPerUnit", "minThreshold", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name           = EXCLUDED.name,
         unit           = EXCLUDED.unit,
         quantity       = EXCLUDED.quantity,
         "barQuantity"  = EXCLUDED."barQuantity",
         "costPerUnit"  = EXCLUDED."costPerUnit",
         "minThreshold" = EXCLUDED."minThreshold"`,
      [i.id, i.name, i.unit, i.quantity, i.barQuantity ?? 0, i.costPerUnit ?? 0, i.minThreshold, i.createdAt]
    )
  } catch (err: any) {
    console.warn('[SyncEngine] pushIngredientToCloud error (offline?):', err?.message)
  }
}

/**
 * Push ingredient stock update directly to Neon immediately.
 */
export async function pushIngredientStockToCloud(id: string, quantity: number, barQuantity?: number): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    if (barQuantity !== undefined) {
      await pg.query(
        `UPDATE "Ingredient" SET quantity = $1, "barQuantity" = $2 WHERE id = $3`,
        [quantity, barQuantity, id]
      )
    } else {
      await pg.query(
        `UPDATE "Ingredient" SET quantity = $1 WHERE id = $2`,
        [quantity, id]
      )
    }
  } catch (err: any) {
    console.warn('[SyncEngine] pushIngredientStockToCloud error (offline?):', err?.message)
  }
}

/**
 * Push menu item stock update directly to Neon immediately.
 */
export async function pushMenuItemStockToCloud(id: string, stockQuantity: number, barQuantity?: number): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    if (barQuantity !== undefined) {
      await pg.query(
        `UPDATE "MenuItem" SET "stockQuantity" = $1, "barQuantity" = $2 WHERE id = $3`,
        [stockQuantity, barQuantity, id]
      )
    } else {
      await pg.query(
        `UPDATE "MenuItem" SET "stockQuantity" = $1 WHERE id = $2`,
        [stockQuantity, id]
      )
    }
  } catch (err: any) {
    console.warn('[SyncEngine] pushMenuItemStockToCloud error (offline?):', err?.message)
  }
}

/**
 * Push a menu item upsert directly to Neon immediately.
 */
export async function pushMenuItemToCloud(item: {
  id: string
  categoryId?: string | null
  name: string
  description?: string | null
  price: number
  available: boolean
  stockQuantity: number
  barQuantity: number
  costPrice: number
  lowStockThreshold: number
  parentItemId?: string | null
  unitMultiplier: number
  createdAt: Date
  recipes?: { ingredientId: string; quantity: number }[]
}): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    await pg.query(
      `INSERT INTO "MenuItem" (id, "categoryId", name, description, price, available,
         "stockQuantity", "barQuantity", "costPrice", "lowStockThreshold",
         "parentItemId", "unitMultiplier", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         "categoryId"       = EXCLUDED."categoryId",
         name               = EXCLUDED.name,
         description        = EXCLUDED.description,
         price              = EXCLUDED.price,
         available          = EXCLUDED.available,
         "stockQuantity"    = EXCLUDED."stockQuantity",
         "barQuantity"      = EXCLUDED."barQuantity",
         "costPrice"        = EXCLUDED."costPrice",
         "lowStockThreshold"= EXCLUDED."lowStockThreshold",
         "unitMultiplier"   = EXCLUDED."unitMultiplier"`,
      [item.id, item.categoryId ?? null, item.name, item.description ?? null, item.price,
       item.available, item.stockQuantity, item.barQuantity, item.costPrice,
       item.lowStockThreshold, item.parentItemId ?? null, item.unitMultiplier, item.createdAt]
    )

    if (item.recipes && Array.isArray(item.recipes)) {
      await pg.query(`DELETE FROM "Recipe" WHERE "menuItemId" = $1`, [item.id]).catch(() => {})
      for (const r of item.recipes) {
        if (r && r.ingredientId) {
          const recipeId = `${item.id}_${r.ingredientId}`
          await pg.query(
            `INSERT INTO "Recipe" (id, "menuItemId", "ingredientId", quantity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity`,
            [recipeId, item.id, r.ingredientId, Number(r.quantity) || 0]
          ).catch(() => {})
        }
      }
    }
  } catch (err: any) {
    console.warn('[SyncEngine] pushMenuItemToCloud error (offline?):', err?.message)
  }
}

/**
 * Push a category upsert directly to Neon immediately.
 */
export async function pushCategoryToCloud(cat: {
  id: string
  name: string
  type: string
  createdAt: Date
}): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    await pg.query(
      `INSERT INTO "Category" (id, name, type, "createdAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type`,
      [cat.id, cat.name, cat.type, cat.createdAt]
    )
  } catch (err: any) {
    console.warn('[SyncEngine] pushCategoryToCloud error (offline?):', err?.message)
  }
}

/**
 * Push a recipe line upsert directly to Neon immediately.
 */
export async function pushRecipeToCloud(r: {
  id: string
  menuItemId: string
  ingredientId: string
  quantity: number
}): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    await pg.query(
      `INSERT INTO "Recipe" (id, "menuItemId", "ingredientId", quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("menuItemId", "ingredientId") DO UPDATE SET
         quantity = EXCLUDED.quantity`,
      [r.id, r.menuItemId, r.ingredientId, Number(r.quantity) || 0]
    )
  } catch (err: any) {
    console.warn('[SyncEngine] pushRecipeToCloud error (offline?):', err?.message)
  }
}

// ─── Sync state ───────────────────────────────────────────────────────────────

let isSyncing = false

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Count how many local records are waiting to be pushed.
 * Fast — only touches local SQLite, no network call.
 */
export async function getPendingSyncCount(): Promise<number> {
  if (process.env.VERCEL) return 0
  const [orders, orderItems, payments, cancellations, inventoryLogs, tables, staffMembers, staffMenuItems, staffIngredients, staffRecipes, staffMeals, staffMealItems] = await Promise.all([
    prisma.order.count({ where: { pendingSync: true } }),
    prisma.orderItem.count({ where: { pendingSync: true } }),
    prisma.payment.count({ where: { pendingSync: true } }),
    prisma.cancellation.count({ where: { pendingSync: true } }),
    prisma.inventoryLog.count({ where: { pendingSync: true } }),
    prisma.table.count({ where: { pendingSync: true } }),
    prisma.staffMember.count({ where: { pendingSync: true } }),
    prisma.staffMenuItem.count({ where: { pendingSync: true } }),
    prisma.staffIngredient.count({ where: { pendingSync: true } }),
    prisma.staffRecipe.count({ where: { pendingSync: true } }),
    prisma.staffMeal.count({ where: { pendingSync: true } }),
    prisma.staffMealItem.count({ where: { pendingSync: true } }),
  ])
  return orders + orderItems + payments + cancellations + inventoryLogs + tables + staffMembers + staffMenuItems + staffIngredients + staffRecipes + staffMeals + staffMealItems
}

/**
 * Fire-and-forget bidirectional sync — call from API routes after writes.
 * Does not block the response. Skips if already syncing.
 */
export function backgroundSync(): void {
  if (process.env.VERCEL) return
  if (isSyncing) return
  syncBothDirections().catch((e) => console.warn('[BackgroundSync]', String(e)))
}

let _backgroundPullTimer: NodeJS.Timeout | null = null
let _fullSyncTimer: NodeJS.Timeout | null = null

/**
 * Fast-path pull: only syncs verification fields and status on currently-OPEN orders.
 * Runs every 5s — single batch query to Neon, very lightweight, won't block the event loop.
 */
export async function pullOrderVerification(): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()

    const localOpen = await prisma.order.findMany({
      where: { status: 'OPEN' },
      select: { id: true, verifiedRef: true, verifiedAmount: true, verifiedProvider: true, tableId: true },
    })
    if (localOpen.length === 0) return

    const ids = localOpen.map(o => o.id)
    const { rows } = await pg.query(
      `SELECT id, "tableId", status, "verifiedRef", "verifiedProvider", "verifiedAmount",
              "verifiedPayer", "verifiedReceiver", "verifiedAt"
       FROM "Order" WHERE id = ANY($1)`,
      [ids]
    )

    for (const co of rows) {
      const local = localOpen.find(o => o.id === co.id)
      if (!local) continue

      const cloudRef = co.verifiedRef ? String(co.verifiedRef).trim().toUpperCase() : null
      const localRef = local.verifiedRef ? String(local.verifiedRef).trim().toUpperCase() : null
      const cloudAmt = co.verifiedAmount != null ? Number(co.verifiedAmount) : null
      const localAmt = local.verifiedAmount != null ? Number(local.verifiedAmount) : null

      const verificationChanged = cloudRef !== localRef || cloudAmt !== localAmt || co.verifiedProvider !== local.verifiedProvider

      if (verificationChanged && cloudRef) {
        await prisma.order.update({
          where: { id: co.id },
          data: {
            verifiedRef: cloudRef,
            verifiedProvider: co.verifiedProvider ?? null,
            verifiedAmount: cloudAmt,
            verifiedPayer: co.verifiedPayer ?? null,
            verifiedReceiver: co.verifiedReceiver ?? null,
            verifiedAt: co.verifiedAt ? new Date(co.verifiedAt) : null,
          },
        })

        if (cloudRef !== localRef) {
          const table = await prisma.table.findUnique({ where: { id: co.tableId }, select: { number: true } })
          broadcastVerificationEvent({
            type: 'ORDER_VERIFIED',
            orderId: co.id,
            tableNumber: table?.number,
            reference: cloudRef,
            provider: co.verifiedProvider || 'AUTO',
            amount: cloudAmt ?? undefined,
            payerName: co.verifiedPayer || undefined,
            receiverName: co.verifiedReceiver || undefined,
            timestamp: co.verifiedAt ? new Date(co.verifiedAt).toISOString() : new Date().toISOString(),
          })
        }
      }

      // If cloud closed the order (PAID/CANCELLED), apply it locally
      if ((co.status === 'PAID' || co.status === 'CANCELLED')) {
        await prisma.order.update({
          where: { id: co.id },
          data: { status: co.status, pendingSync: false },
        }).catch(() => {})
        await prisma.table.update({
          where: { id: co.tableId },
          data: { status: 'FREE' },
        }).catch(() => {})
      }
    }
  } catch (e: any) {
    console.warn('[pullOrderVerification]', e?.message)
    if (e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT' || e?.code === 'ENOTFOUND') resetPool()
  }
}

/**
 * Autonomous background pull loop for local POS server.
 *
 * Two-speed design to prevent event-loop starvation:
 *  - Fast timer (every 5s): only syncs OPEN-order verification & status (lightweight, single batch query)
 *  - Slow timer (every 5min): full bidirectional sync of all metadata + orders
 */
export function startBackgroundPullLoop(intervalMs = 5000): void {
  if (process.env.VERCEL) return
  if (_backgroundPullTimer) return

  // Fast loop — only order verification, non-blocking
  _backgroundPullTimer = setInterval(async () => {
    try {
      await pullOrderVerification()
    } catch (e) {
      console.warn('[BackgroundPullLoop]', String(e))
    }
  }, intervalMs)
  if (typeof _backgroundPullTimer.unref === 'function') _backgroundPullTimer.unref()

  // Slow loop — full sync every 5 minutes (won't run until 5min after startup)
  if (!_fullSyncTimer) {
    _fullSyncTimer = setInterval(async () => {
      try {
        if (!isSyncing) await syncBothDirections()
      } catch (e) {
        console.warn('[BackgroundFullSync]', String(e))
      }
    }, 5 * 60 * 1000)
    if (typeof _fullSyncTimer.unref === 'function') _fullSyncTimer.unref()
  }
}

// Auto-start background pull loop on local server so payments and orders sync continuously
if (typeof process !== 'undefined' && !process.env.VERCEL) {
  startBackgroundPullLoop(5000)
}

/**
 * Pull cloud-native orders (created on Vercel) into local SQLite.
 *
 * Rules:
 *  - If order exists locally with pendingSync=true → local is being modified, SKIP
 *  - If order exists locally with pendingSync=false → already synced, update status only
 *  - If order does NOT exist locally → it's cloud-native, INSERT it
 */
export async function pullFromCloud(): Promise<{ pulled: { orders: number; orderItems: number }; errors: string[] }> {
  if (process.env.VERCEL) {
    return { pulled: { orders: 0, orderItems: 0 }, errors: [] }
  }

  const errors: string[] = []
  const pulled = { orders: 0, orderItems: 0 }

  try {
    const pg = getPool()

    // ── Pull static metadata (User, Category, Ingredient, MenuItem, Recipe, Table) ──
    // 0. Users / Staff
    try {
      const { rows: cloudUsers } = await pg.query(
        `SELECT id, username, "passwordHash", "fullName", role, phone, active, "createdAt" FROM "User"`
      )

      // 0a. Check cloud tombstones (e.g. users deleted on Vercel online)
      const cloudDeletedUsernames = new Set<string>()
      const cloudDeletedIds = new Set<string>()
      try {
        const { rows: cloudDeleted } = await pg.query(
          `SELECT id, username, "deletedAt" FROM "DeletedUser"`
        )
        for (const d of cloudDeleted) {
          const dTime = d.deletedAt ? new Date(d.deletedAt).getTime() : 0

          // Check if this user exists in cloudUsers and was created AFTER tombstone
          const matchingCloudU = cloudUsers.find(
            cu => (d.id && cu.id === d.id) || (d.username && cu.username.toLowerCase() === d.username.toLowerCase())
          )
          if (matchingCloudU) {
            const cloudCreatedTime = matchingCloudU.createdAt ? new Date(matchingCloudU.createdAt).getTime() : 0
            if (cloudCreatedTime > dTime) {
              await clearDeletedUser(d.id, d.username)
              continue
            }
          }

          const conditions: Array<{ id?: string; username?: string }> = []
          if (d.id && typeof d.id === 'string' && d.id.trim()) {
            conditions.push({ id: d.id.trim() })
          }
          if (d.username && typeof d.username === 'string' && d.username.trim()) {
            conditions.push({ username: d.username.trim() })
          }
          if (conditions.length === 0) continue

          const localU = await prisma.user.findFirst({
            where: { OR: conditions }
          }).catch(() => null)

          // If local user exists and was created AFTER the tombstone, this is a fresh user!
          if (localU) {
            const userCreated = localU.createdAt ? new Date(localU.createdAt).getTime() : 0
            if (userCreated > dTime) {
              await clearDeletedUser(d.id, d.username)
              continue
            }
          }

          if (d.username) cloudDeletedUsernames.add(d.username.toLowerCase())
          if (d.id) cloudDeletedIds.add(d.id)
          recordDeletedUser(d.id, d.username)

          if (localU && localU.username !== 'master' && localU.username !== 'admin' && localU.username !== 'admin10') {
            await prisma.shiftLog.deleteMany({ where: { userId: localU.id } }).catch(() => {})
            await prisma.cancellation.deleteMany({ where: { managerId: localU.id } }).catch(() => {})
            await prisma.payment.deleteMany({ where: { cashierId: localU.id } }).catch(() => {})
            const luOrders = await prisma.order.findMany({ where: { waiterId: localU.id }, select: { id: true } }).catch(() => [])
            if (luOrders.length > 0) {
              const oIds = luOrders.map(o => o.id)
              await prisma.cancellation.deleteMany({ where: { orderItem: { orderId: { in: oIds } } } }).catch(() => {})
              await prisma.orderItem.deleteMany({ where: { orderId: { in: oIds } } }).catch(() => {})
              await prisma.payment.deleteMany({ where: { orderId: { in: oIds } } }).catch(() => {})
              await prisma.order.deleteMany({ where: { id: { in: oIds } } }).catch(() => {})
            }
            await prisma.user.delete({ where: { id: localU.id } }).catch(() => {})
          }
        }
      } catch (delErr: any) {
        console.warn('[SyncEngine] Error querying DeletedUser tombstones:', delErr?.message)
      }

      for (const u of cloudUsers) {
        // If this user is marked as deleted (and created before tombstone), skip pulling them
        if (isUserDeleted(u.id, u.username, u.createdAt)) {
          continue
        }

        // First, check by ID to avoid unique constraint collisions
        const localUserById = await prisma.user.findUnique({ where: { id: u.id } })
        if (localUserById) {
          await prisma.user.update({
            where: { id: u.id },
            data: {
              username: u.username,
              passwordHash: u.passwordHash,
              fullName: u.fullName,
              role: u.role,
              phone: u.phone,
              active: Boolean(u.active),
              createdAt: new Date(u.createdAt),
            },
          }).catch(() => {})
          continue
        }

        // Second, check by username
        const localUserByUsername = await prisma.user.findUnique({ where: { username: u.username } })
        if (localUserByUsername) {
          await prisma.user.update({
            where: { username: u.username },
            data: {
              passwordHash: u.passwordHash,
              fullName: u.fullName,
              role: u.role,
              phone: u.phone,
              active: Boolean(u.active),
              createdAt: new Date(u.createdAt),
            },
          }).catch(() => {})
          continue
        }

        // Neither exists: insert new cloud user
        await prisma.user.create({
          data: {
            id: u.id,
            username: u.username,
            passwordHash: u.passwordHash,
            fullName: u.fullName,
            role: u.role,
            phone: u.phone,
            active: Boolean(u.active),
            createdAt: new Date(u.createdAt),
          },
        }).catch(() => {})
      }

      // Reconcile users: push missing local users to cloud, or remove if marked deleted in tombstones
      const cloudUsernames = new Set(cloudUsers.map(c => c.username))
      const cloudIds = new Set(cloudUsers.map(c => c.id))
      const localUsers = await prisma.user.findMany()
      for (const lu of localUsers) {
        if (!cloudUsernames.has(lu.username) && !cloudIds.has(lu.id)) {
          const isDeleted = isUserDeleted(lu.id, lu.username, lu.createdAt) || (lu.id && cloudDeletedIds.has(lu.id))
          if (isDeleted) {
            recordDeletedUser(lu.id, lu.username)
            if (lu.username !== 'master' && lu.username !== 'admin' && lu.username !== 'admin10') {
              // User was explicitly marked for deletion in tombstones! Clean up locally.
              await prisma.shiftLog.deleteMany({ where: { userId: lu.id } }).catch(() => {})
              await prisma.cancellation.deleteMany({ where: { managerId: lu.id } }).catch(() => {})
              await prisma.payment.deleteMany({ where: { cashierId: lu.id } }).catch(() => {})
              const luOrders = await prisma.order.findMany({ where: { waiterId: lu.id }, select: { id: true } }).catch(() => [])
              if (luOrders.length > 0) {
                const oIds = luOrders.map(o => o.id)
                await prisma.cancellation.deleteMany({ where: { orderItem: { orderId: { in: oIds } } } }).catch(() => {})
                await prisma.orderItem.deleteMany({ where: { orderId: { in: oIds } } }).catch(() => {})
                await prisma.payment.deleteMany({ where: { orderId: { in: oIds } } }).catch(() => {})
                await prisma.order.deleteMany({ where: { id: { in: oIds } } }).catch(() => {})
              }
              await prisma.user.delete({ where: { id: lu.id } }).catch(() => {})
            }
          } else {
            // User was newly created locally! Push them to Cloud Neon so they stay synced.
            await pushUserToCloud({
              id: lu.id,
              username: lu.username,
              passwordHash: lu.passwordHash,
              fullName: lu.fullName,
              role: lu.role,
              phone: lu.phone,
              active: lu.active,
              createdAt: lu.createdAt,
            }).catch(() => {})
          }
        }
      }
    } catch (userErr) {
      console.warn('[Pull users warning]', String(userErr))
      errors.push(`Users sync warning: ${String(userErr)}`)
    }

    // 0b. Abebe Master Console Credentials
    try {
      const { rows: cloudCreds } = await pg.query(
        `SELECT id, username, "passwordHash", "createdAt", "updatedAt" FROM "AbebeCredential" LIMIT 1`
      )
      if (cloudCreds.length > 0) {
        const c = cloudCreds[0]
        await prisma.$executeRawUnsafe(
          `INSERT INTO "AbebeCredential" (id, username, "passwordHash", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             "passwordHash" = EXCLUDED."passwordHash",
             "updatedAt" = EXCLUDED."updatedAt"`,
          c.id, c.username, c.passwordHash, c.createdAt, c.updatedAt
        ).catch(() => {})
      }
    } catch (credErr) {
      // Non-critical if table is not yet initialized
    }

    // 0c. System Settings (Payment Verification Accounts, etc.)
    try {
      const { rows: cloudSettings } = await pg.query(
        `SELECT "key", "value", "updatedAt" FROM "SystemSetting"`
      )
      for (const s of cloudSettings) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
           VALUES ($1, $2, $3)
           ON CONFLICT ("key") DO UPDATE SET
             "value" = EXCLUDED."value",
             "updatedAt" = EXCLUDED."updatedAt"`,
          s.key, s.value, s.updatedAt
        ).catch(() => {})
      }
    } catch (setErr) {
      // Non-critical if table not yet initialized
    }

    // 1. Categories
    try {
      const { rows: cloudCats } = await pg.query(
        `SELECT id, name, type, "createdAt" FROM "Category"`
      )

      for (const c of cloudCats) {
        await prisma.category.upsert({
          where: { id: c.id },
          update: { name: c.name, type: c.type, createdAt: new Date(c.createdAt) },
          create: { id: c.id, name: c.name, type: c.type, createdAt: new Date(c.createdAt) },
        })
      }

      // Delete local categories that were deleted on cloud
      const cloudCatIds = new Set(cloudCats.map(c => c.id))
      const localCats = await prisma.category.findMany({ select: { id: true } })
      for (const lc of localCats) {
        if (!cloudCatIds.has(lc.id)) {
          await prisma.menuItem.updateMany({ where: { categoryId: lc.id }, data: { categoryId: null } })
          await prisma.category.delete({ where: { id: lc.id } }).catch(() => {})
        }
      }
    } catch (catErr) {
      console.warn('[Pull categories warning]', String(catErr))
      errors.push(`Categories sync warning: ${String(catErr)}`)
    }

    // 2. Ingredients
    try {
      const { rows: cloudIngs } = await pg.query(
        `SELECT id, name, unit, quantity, "barQuantity", "costPerUnit", "minThreshold", "createdAt" FROM "Ingredient"`
      )

      for (const i of cloudIngs) {
        const local = await prisma.ingredient.findUnique({ where: { id: i.id } })
        if (!local) {
          // Brand new ingredient from cloud: insert into local SQLite
          try {
            await prisma.ingredient.create({
              data: {
                id: i.id,
                name: i.name,
                unit: i.unit,
                quantity: Number(i.quantity),
                barQuantity: Number(i.barQuantity || 0),
                costPerUnit: Number(i.costPerUnit || 0),
                minThreshold: Number(i.minThreshold),
                createdAt: new Date(i.createdAt),
              },
            })
          } catch {
            await prisma.ingredient.create({
              data: {
                id: i.id,
                name: i.name,
                unit: i.unit,
                quantity: Number(i.quantity),
                barQuantity: Number(i.barQuantity || 0),
                minThreshold: Number(i.minThreshold),
                createdAt: new Date(i.createdAt),
              },
            })
          }
        } else {
          // Existing ingredient: sync details from cloud including inventory quantity and barQuantity
          try {
            await prisma.ingredient.update({
              where: { id: i.id },
              data: {
                name: i.name,
                unit: i.unit,
                quantity: Number(i.quantity),
                barQuantity: Number(i.barQuantity || 0),
                costPerUnit: Number(i.costPerUnit || 0),
                minThreshold: Number(i.minThreshold),
              },
            })
          } catch {
            await prisma.ingredient.update({
              where: { id: i.id },
              data: {
                name: i.name,
                unit: i.unit,
                quantity: Number(i.quantity),
                barQuantity: Number(i.barQuantity || 0),
                minThreshold: Number(i.minThreshold),
              },
            })
          }
        }
      }

      // Delete local ingredients that were deleted on cloud
      const cloudIngIds = new Set(cloudIngs.map(i => i.id))
      const localIngs = await prisma.ingredient.findMany({ select: { id: true } })
      for (const li of localIngs) {
        if (!cloudIngIds.has(li.id)) {
          await prisma.recipe.deleteMany({ where: { ingredientId: li.id } })
          await prisma.ingredient.delete({ where: { id: li.id } }).catch(() => {})
        }
      }
    } catch (ingErr) {
      console.warn('[Pull ingredients warning]', String(ingErr))
      errors.push(`Ingredients sync warning: ${String(ingErr)}`)
    }

    // 3. MenuItems
    try {
      const { rows: cloudItems } = await pg.query(
        `SELECT id, "categoryId", name, description, price, available, "stockQuantity", "barQuantity", "costPrice", "lowStockThreshold", "parentItemId", "unitMultiplier", "createdAt" FROM "MenuItem"`
      )

      // First pass: upsert with parentItemId = null to avoid self-referential foreign key constraint issues
      for (const item of cloudItems) {
        const local = await prisma.menuItem.findUnique({ where: { id: item.id } })
        if (!local) {
          // Brand new product from cloud: insert into local SQLite
          await prisma.menuItem.create({
            data: {
              id: item.id,
              categoryId: item.categoryId,
              name: item.name,
              description: item.description,
              price: Number(item.price),
              available: Boolean(item.available),
              stockQuantity: Number(item.stockQuantity),
              barQuantity: Number(item.barQuantity),
              costPrice: Number(item.costPrice),
              lowStockThreshold: Number(item.lowStockThreshold),
              parentItemId: null,
              unitMultiplier: Number(item.unitMultiplier),
              createdAt: new Date(item.createdAt),
            },
          })
        } else {
          // Existing product: sync pricing, category, store & bar stock from cloud
          await prisma.menuItem.update({
            where: { id: item.id },
            data: {
              categoryId: item.categoryId,
              name: item.name,
              description: item.description,
              price: Number(item.price),
              available: Boolean(item.available),
              stockQuantity: Number(item.stockQuantity),
              barQuantity: Number(item.barQuantity),
              costPrice: Number(item.costPrice),
              lowStockThreshold: Number(item.lowStockThreshold),
              unitMultiplier: Number(item.unitMultiplier),
            },
          })
        }
      }

      // Second pass: update parentItemId links
      for (const item of cloudItems) {
        if (item.parentItemId) {
          await prisma.menuItem.update({
            where: { id: item.id },
            data: { parentItemId: item.parentItemId },
          })
        }
      }

      // Delete local menu items that were deleted on cloud
      const cloudItemIds = new Set(cloudItems.map(item => item.id))
      const localMenuItems = await prisma.menuItem.findMany({ select: { id: true } })
      for (const lm of localMenuItems) {
        if (!cloudItemIds.has(lm.id)) {
          await prisma.menuItem.updateMany({ where: { parentItemId: lm.id }, data: { parentItemId: null } })
          const localOIs = await prisma.orderItem.findMany({ where: { menuItemId: lm.id }, select: { id: true } })
          const localOIIds = localOIs.map(oi => oi.id)
          if (localOIIds.length > 0) {
            await prisma.cancellation.deleteMany({ where: { orderItemId: { in: localOIIds } } }).catch(() => {})
            await prisma.orderItem.deleteMany({ where: { id: { in: localOIIds } } }).catch(() => {})
          }
          await prisma.recipe.deleteMany({ where: { menuItemId: lm.id } }).catch(() => {})
          await prisma.menuItem.delete({ where: { id: lm.id } }).catch(() => {})
        }
      }
    } catch (menuErr) {
      console.warn('[Pull menu warning]', String(menuErr))
      errors.push(`Menu sync warning: ${String(menuErr)}`)
    }

      // 4. Recipes
      try {
        const { rows: cloudRecipes } = await pg.query(
          `SELECT id, "menuItemId", "ingredientId", quantity FROM "Recipe"`
        )

        for (const r of cloudRecipes) {
          const existing = await prisma.recipe.findUnique({
            where: { menuItemId_ingredientId: { menuItemId: r.menuItemId, ingredientId: r.ingredientId } }
          })
          if (existing) {
            await prisma.recipe.update({
              where: { id: existing.id },
              data: { quantity: Number(r.quantity) },
            })
          } else {
            await prisma.recipe.create({
              data: {
                id: r.id,
                menuItemId: r.menuItemId,
                ingredientId: r.ingredientId,
                quantity: Number(r.quantity),
              },
            }).catch(() => {})
          }
        }

        // Delete local recipes that were deleted on cloud
        const cloudRecipeKeys = new Set(cloudRecipes.map(r => `${r.menuItemId}_${r.ingredientId}`))
        const localRecipes = await prisma.recipe.findMany()
        for (const lr of localRecipes) {
          const key = `${lr.menuItemId}_${lr.ingredientId}`
          if (!cloudRecipeKeys.has(key)) {
            await prisma.recipe.delete({ where: { id: lr.id } }).catch(() => {})
          }
        }
      } catch (recipeErr) {
        console.warn('[Pull recipes warning]', String(recipeErr))
      }


      // 5. Tables & Staff
      try {
        const { rows: cloudTables } = await pg.query(
        `SELECT id, number, status, "mergedWithId", "mergeGroupId", "mergeGroupLabel", "createdAt" FROM "Table"`
      )

      for (const t of cloudTables) {
        const localT = await prisma.table.findUnique({ where: { id: t.id } })
        if (localT?.pendingSync) continue // local edit not yet pushed — don't overwrite
        await prisma.table.upsert({
          where: { id: t.id },
          update: {
            number: t.number,
            status: t.status,
            mergedWithId: t.mergedWithId,
            mergeGroupId: t.mergeGroupId,
            mergeGroupLabel: t.mergeGroupLabel,
            createdAt: new Date(t.createdAt),
            pendingSync: false,
          },
          create: {
            id: t.id,
            number: t.number,
            status: t.status,
            mergedWithId: t.mergedWithId,
            mergeGroupId: t.mergeGroupId,
            mergeGroupLabel: t.mergeGroupLabel,
            createdAt: new Date(t.createdAt),
            pendingSync: false,
          },
        })
      }

      // Delete local tables that were deleted on cloud (and not pending push)
      const cloudTableIds = new Set(cloudTables.map(t => t.id))
      const localTables = await prisma.table.findMany({ select: { id: true, pendingSync: true } })
      for (const t of localTables) {
        if (t.id === '__archived_orders_table__') continue
        if (!t.pendingSync && !cloudTableIds.has(t.id)) {
          // Reassign any local orders to archived table so foreign key constraint does not fail
          await prisma.order.updateMany({
            where: { tableId: t.id },
            data: { tableId: '__archived_orders_table__' },
          }).catch(() => {})
          await prisma.table.updateMany({
            where: { mergedWithId: t.id },
            data: { mergedWithId: null },
          }).catch(() => {})
          await prisma.table.delete({ where: { id: t.id } }).catch(() => {})
        }
      }

      // 6. StaffMembers
      const { rows: cloudStaffMembers } = await pg.query(
        `SELECT id, name, role, shift, active, "createdAt" FROM "StaffMember"`
      )

      for (const sm of cloudStaffMembers) {
        // Don't clobber a local row that has unpushed edits.
        const localSm = await prisma.staffMember.findUnique({ where: { id: sm.id } })
        if (localSm?.pendingSync) continue
        await prisma.staffMember.upsert({
          where: { id: sm.id },
          update: {
            name: sm.name,
            role: sm.role,
            shift: sm.shift,
            active: Boolean(sm.active),
            createdAt: new Date(sm.createdAt),
            pendingSync: false,
          },
          create: {
            id: sm.id,
            name: sm.name,
            role: sm.role,
            shift: sm.shift,
            active: Boolean(sm.active),
            createdAt: new Date(sm.createdAt),
            pendingSync: false,
          },
        })
      }
      const cloudStaffMemberIds = new Set(cloudStaffMembers.map(sm => sm.id))
      const localStaffMembers = await prisma.staffMember.findMany({ select: { id: true, pendingSync: true } })
      for (const sm of localStaffMembers) {
        if (!sm.pendingSync && !cloudStaffMemberIds.has(sm.id)) {
          await prisma.staffMember.delete({ where: { id: sm.id } }).catch(() => {})
        }
      }

      // 7. StaffMenuItems
      const { rows: cloudStaffMenuItems } = await pg.query(
        `SELECT id, name, "mealType", "linkedMenuItemId", "createdAt" FROM "StaffMenuItem"`
      )

      for (const smi of cloudStaffMenuItems) {
        const localSmi = await prisma.staffMenuItem.findUnique({ where: { id: smi.id } })
        if (localSmi?.pendingSync) continue
        await prisma.staffMenuItem.upsert({
          where: { id: smi.id },
          update: {
            name: smi.name,
            mealType: smi.mealType,
            linkedMenuItemId: smi.linkedMenuItemId,
            createdAt: new Date(smi.createdAt),
            pendingSync: false,
          },
          create: {
            id: smi.id,
            name: smi.name,
            mealType: smi.mealType,
            linkedMenuItemId: smi.linkedMenuItemId,
            createdAt: new Date(smi.createdAt),
            pendingSync: false,
          },
        })
      }
      const cloudStaffMenuItemIds = new Set(cloudStaffMenuItems.map(smi => smi.id))
      const localStaffMenuItems = await prisma.staffMenuItem.findMany({ select: { id: true, pendingSync: true } })
      for (const smi of localStaffMenuItems) {
        if (!smi.pendingSync && !cloudStaffMenuItemIds.has(smi.id)) {
          await prisma.staffMealItem.deleteMany({ where: { staffMenuItemId: smi.id } })
          await prisma.staffRecipe.deleteMany({ where: { staffMenuItemId: smi.id } })
          await prisma.staffMenuItem.delete({ where: { id: smi.id } }).catch(() => {})
        }
      }

      // 8. StaffIngredients (staff-kitchen raw inventory)
      const { rows: cloudStaffIngredients } = await pg.query(
        `SELECT id, name, unit, quantity, "minThreshold", "createdAt" FROM "StaffIngredient"`
      )

      for (const si of cloudStaffIngredients) {
        const localSi = await prisma.staffIngredient.findUnique({ where: { id: si.id } })
        if (localSi?.pendingSync) continue
        await prisma.staffIngredient.upsert({
          where: { id: si.id },
          update: {
            name: si.name,
            unit: si.unit,
            quantity: Number(si.quantity),
            minThreshold: Number(si.minThreshold),
            createdAt: new Date(si.createdAt),
            pendingSync: false,
          },
          create: {
            id: si.id,
            name: si.name,
            unit: si.unit,
            quantity: Number(si.quantity),
            minThreshold: Number(si.minThreshold),
            createdAt: new Date(si.createdAt),
            pendingSync: false,
          },
        })
      }
      const cloudStaffIngredientIds = new Set(cloudStaffIngredients.map(si => si.id))
      const localStaffIngredients = await prisma.staffIngredient.findMany({ select: { id: true, pendingSync: true } })
      for (const si of localStaffIngredients) {
        if (!si.pendingSync && !cloudStaffIngredientIds.has(si.id)) {
          await prisma.staffRecipe.deleteMany({ where: { staffIngredientId: si.id } })
          await prisma.staffIngredient.delete({ where: { id: si.id } }).catch(() => {})
        }
      }

      // 9. StaffRecipes (food → ingredient consumption map)
      const { rows: cloudStaffRecipes } = await pg.query(
        `SELECT id, "staffMenuItemId", "staffIngredientId", quantity FROM "StaffRecipe"`
      )

      for (const sr of cloudStaffRecipes) {
        const localSr = await prisma.staffRecipe.findUnique({ where: { id: sr.id } })
        if (localSr?.pendingSync) continue
        await prisma.staffRecipe.upsert({
          where: { id: sr.id },
          update: {
            staffMenuItemId: sr.staffMenuItemId,
            staffIngredientId: sr.staffIngredientId,
            quantity: Number(sr.quantity),
            pendingSync: false,
          },
          create: {
            id: sr.id,
            staffMenuItemId: sr.staffMenuItemId,
            staffIngredientId: sr.staffIngredientId,
            quantity: Number(sr.quantity),
            pendingSync: false,
          },
        })
      }
      const cloudStaffRecipeIds = new Set(cloudStaffRecipes.map(sr => sr.id))
      const localStaffRecipes = await prisma.staffRecipe.findMany({ select: { id: true, pendingSync: true } })
      for (const sr of localStaffRecipes) {
        if (!sr.pendingSync && !cloudStaffRecipeIds.has(sr.id)) {
          await prisma.staffRecipe.delete({ where: { id: sr.id } }).catch(() => {})
        }
      }

      // 10. StaffMeals
      const { rows: cloudStaffMeals } = await pg.query(
        `SELECT id, "staffMemberId", "mealType", "servedAt", "createdAt" FROM "StaffMeal"`
      )

      for (const sm of cloudStaffMeals) {
        const localSm = await prisma.staffMeal.findUnique({ where: { id: sm.id } })
        if (localSm?.pendingSync) continue
        await prisma.staffMeal.upsert({
          where: { id: sm.id },
          update: {
            staffMemberId: sm.staffMemberId,
            mealType: sm.mealType,
            servedAt: new Date(sm.servedAt),
            createdAt: new Date(sm.createdAt),
            pendingSync: false,
          },
          create: {
            id: sm.id,
            staffMemberId: sm.staffMemberId,
            mealType: sm.mealType,
            servedAt: new Date(sm.servedAt),
            createdAt: new Date(sm.createdAt),
            pendingSync: false,
          },
        })
      }

      // 11. StaffMealItems
      const { rows: cloudStaffMealItems } = await pg.query(
        `SELECT id, "staffMealId", "staffMenuItemId", quantity FROM "StaffMealItem"`
      )

      for (const smi of cloudStaffMealItems) {
        const localSmi = await prisma.staffMealItem.findUnique({ where: { id: smi.id } })
        if (localSmi?.pendingSync) continue
        await prisma.staffMealItem.upsert({
          where: { id: smi.id },
          update: {
            staffMealId: smi.staffMealId,
            staffMenuItemId: smi.staffMenuItemId,
            quantity: Number(smi.quantity),
            pendingSync: false,
          },
          create: {
            id: smi.id,
            staffMealId: smi.staffMealId,
            staffMenuItemId: smi.staffMenuItemId,
            quantity: Number(smi.quantity),
            pendingSync: false,
          },
        })
      }

      // Delete local StaffMeals that were deleted on cloud
      const cloudStaffMealIds = new Set(cloudStaffMeals.map(sm => sm.id))
      const localStaffMeals = await prisma.staffMeal.findMany({ select: { id: true, pendingSync: true } })
      for (const lsm of localStaffMeals) {
        if (!lsm.pendingSync && !cloudStaffMealIds.has(lsm.id)) {
          await prisma.staffMealItem.deleteMany({ where: { staffMealId: lsm.id } }).catch(() => {})
          await prisma.staffMeal.delete({ where: { id: lsm.id } }).catch(() => {})
        }
      }

      // Delete local StaffMealItems that were deleted on cloud
      const cloudStaffMealItemIds = new Set(cloudStaffMealItems.map(smi => smi.id))
      const localStaffMealItems = await prisma.staffMealItem.findMany({ select: { id: true, pendingSync: true } })
      for (const lsmi of localStaffMealItems) {
        if (!lsmi.pendingSync && !cloudStaffMealItemIds.has(lsmi.id)) {
          await prisma.staffMealItem.delete({ where: { id: lsmi.id } }).catch(() => {})
        }
      }
    } catch (e) {
      console.warn('[Pull static warning]', String(e))
      errors.push(`Static sync warning: ${String(e)}`)
    }

    // ── Orders & Transactions Deletion Reconciliation ─────────────────────────
    try {
      const { rows: allCloudOrders } = await pg.query(`SELECT id FROM "Order"`)
      const cloudOrderIds = new Set(allCloudOrders.map(o => o.id))

      const localSyncedOrders = await prisma.order.findMany({
        where: { pendingSync: false },
        select: { id: true, tableId: true }
      })

      const deletedOrderIds: string[] = []
      const affectedTableIds = new Set<string>()

      for (const lo of localSyncedOrders) {
        if (!cloudOrderIds.has(lo.id)) {
          deletedOrderIds.push(lo.id)
          affectedTableIds.add(lo.tableId)
        }
      }

      if (deletedOrderIds.length > 0) {
        const orderItemsToDelete = await prisma.orderItem.findMany({
          where: { orderId: { in: deletedOrderIds } },
          select: { id: true }
        })
        const orderItemIdsToDelete = orderItemsToDelete.map(oi => oi.id)

        if (orderItemIdsToDelete.length > 0) {
          await prisma.cancellation.deleteMany({
            where: { orderItemId: { in: orderItemIdsToDelete } }
          }).catch(() => {})
        }

        await prisma.payment.deleteMany({
          where: { orderId: { in: deletedOrderIds } }
        }).catch(() => {})

        await prisma.orderItem.deleteMany({
          where: { orderId: { in: deletedOrderIds } }
        }).catch(() => {})

        await prisma.order.deleteMany({
          where: { id: { in: deletedOrderIds } }
        }).catch(() => {})

        for (const tableId of affectedTableIds) {
          if (tableId.startsWith('tbl_static_')) continue
          const remainingOpen = await prisma.order.count({
            where: { tableId, status: 'OPEN' }
          })
          if (remainingOpen === 0) {
            await prisma.table.update({
              where: { id: tableId },
              data: { status: 'FREE', mergedWithId: null }
            }).catch(() => {})
          }
        }
      }

      // Reconcile standalone deleted Payments
      const { rows: allCloudPayments } = await pg.query(`SELECT id FROM "Payment"`)
      const cloudPaymentIds = new Set(allCloudPayments.map(p => p.id))
      const localSyncedPayments = await prisma.payment.findMany({
        where: { pendingSync: false },
        select: { id: true }
      })
      for (const lp of localSyncedPayments) {
        if (!cloudPaymentIds.has(lp.id)) {
          await prisma.payment.delete({ where: { id: lp.id } }).catch(() => {})
        }
      }

      // Reconcile standalone deleted OrderItems
      const { rows: allCloudOrderItems } = await pg.query(`SELECT id FROM "OrderItem"`)
      const cloudOrderItemIds = new Set(allCloudOrderItems.map(oi => oi.id))
      const localSyncedOrderItems = await prisma.orderItem.findMany({
        where: { pendingSync: false },
        select: { id: true }
      })
      for (const loi of localSyncedOrderItems) {
        if (!cloudOrderItemIds.has(loi.id)) {
          await prisma.cancellation.deleteMany({ where: { orderItemId: loi.id } }).catch(() => {})
          await prisma.orderItem.delete({ where: { id: loi.id } }).catch(() => {})
        }
      }
    } catch (orderReconcileErr) {
      console.warn('[Pull order reconciliation warning]', String(orderReconcileErr))
      errors.push(`Order reconciliation warning: ${String(orderReconcileErr)}`)
    }

    // Fetch local OPEN orders to check if they were updated/paid on cloud
    const localOpenOrders = await prisma.order.findMany({
      where: { status: 'OPEN' },
      select: { id: true }
    })
    const localOpenOrderIds = localOpenOrders.map(o => o.id)
    if (localOpenOrderIds.length === 0) {
      localOpenOrderIds.push('__dummy_non_existent_id__')
    }

    // Fetch from Neon:
    // - All OPEN orders (created on other devices)
    // - Any orders currently OPEN locally (to check if they became PAID/CANCELLED)
    // - Any orders updated in the last 60 days (to catch orders and reports data)
    const { rows: cloudOrders } = await pg.query(
      `SELECT id, "tableId", "waiterId", status, "createdAt", "updatedAt",
              "verifiedRef", "verifiedProvider", "verifiedAmount", "verifiedPayer", "verifiedReceiver", "verifiedAt"
       FROM "Order"
       WHERE status = 'OPEN'
          OR id = ANY($1)
          OR "updatedAt" > NOW() - INTERVAL '60 days'
       ORDER BY "createdAt" DESC`,
      [localOpenOrderIds]
    )

    for (const co of cloudOrders) {
      try {
        const localOrder = await prisma.order.findUnique({ where: { id: co.id } })

        if (!localOrder) {
          // Cloud-native order — check that the waiter exists locally before inserting
          const waiterExists = await prisma.user.findUnique({ where: { id: co.waiterId } })
          if (!waiterExists) {
            // Waiter account doesn't exist locally yet; skip gracefully
            console.warn(`[Pull] Order ${co.id} skipped — waiter ${co.waiterId} not in local DB`)
            continue
          }

          // Insert the order with verification fields
          await prisma.order.create({
            data: {
              id: co.id,
              tableId: co.tableId,
              waiterId: co.waiterId,
              status: co.status,
              createdAt: new Date(co.createdAt),
              updatedAt: new Date(co.updatedAt),
              verifiedRef: co.verifiedRef ?? null,
              verifiedProvider: co.verifiedProvider ?? null,
              verifiedAmount: co.verifiedAmount != null ? Number(co.verifiedAmount) : null,
              verifiedPayer: co.verifiedPayer ?? null,
              verifiedReceiver: co.verifiedReceiver ?? null,
              verifiedAt: co.verifiedAt ? new Date(co.verifiedAt) : null,
              pendingSync: false, // already exists on cloud
            },
          })

          // If attached payment exists on cloud order, broadcast immediately
          if (co.verifiedRef) {
            const table = await prisma.table.findUnique({ where: { id: co.tableId }, select: { number: true } })
            broadcastVerificationEvent({
              type: 'ORDER_VERIFIED',
              orderId: co.id,
              tableNumber: table?.number,
              reference: co.verifiedRef,
              provider: co.verifiedProvider || 'AUTO',
              amount: co.verifiedAmount != null ? Number(co.verifiedAmount) : undefined,
              payerName: co.verifiedPayer || undefined,
              receiverName: co.verifiedReceiver || undefined,
              timestamp: co.verifiedAt ? new Date(co.verifiedAt).toISOString() : new Date().toISOString(),
            })
          }

          // Pull order items for this order
          const { rows: cloudItems } = await pg.query(
            `SELECT id, "orderId", "menuItemId", quantity, notes, status, "printedAt", "createdAt"
             FROM "OrderItem" WHERE "orderId" = $1`,
            [co.id]
          )

          for (const ci of cloudItems) {
            try {
              const localItem = await prisma.orderItem.findUnique({ where: { id: ci.id } })
              if (!localItem) {
                // Verify menuItem exists locally
                const menuItemExists = await prisma.menuItem.findUnique({ where: { id: ci.menuItemId } })
                if (!menuItemExists) {
                  console.warn(`[Pull] OrderItem ${ci.id} skipped — menuItem ${ci.menuItemId} not found locally`)
                  continue
                }
                await prisma.orderItem.create({
                  data: {
                    id: ci.id,
                    orderId: ci.orderId,
                    menuItemId: ci.menuItemId,
                    quantity: ci.quantity,
                    notes: ci.notes ?? null,
                    status: ci.status,
                    printedAt: ci.printedAt ? new Date(ci.printedAt) : null,
                    createdAt: new Date(ci.createdAt),
                    pendingSync: false,
                  },
                })
                pulled.orderItems++
              }
            } catch (e) {
              errors.push(`Pull OrderItem ${ci.id}: ${String(e)}`)
            }
          }

          // Pull payment for this order if it is paid on cloud
          if (co.status === 'PAID') {
            const localPayment = await prisma.payment.findUnique({ where: { orderId: co.id } })
            if (!localPayment) {
              const { rows: cloudPayments } = await pg.query(
                `SELECT id, "orderId", "cashierId", amount, method, discount, "discountType", "isComplimentary", notes, "createdAt"
                 FROM "Payment" WHERE "orderId" = $1 LIMIT 1`,
                [co.id]
              )
              if (cloudPayments.length > 0) {
                const cp = cloudPayments[0]
                const cashierExists = await prisma.user.findUnique({ where: { id: cp.cashierId } })
                if (cashierExists) {
                  await prisma.payment.create({
                    data: {
                      id: cp.id,
                      orderId: cp.orderId,
                      cashierId: cp.cashierId,
                      amount: Number(cp.amount),
                      method: cp.method,
                      discount: Number(cp.discount),
                      discountType: cp.discountType,
                      isComplimentary: Boolean(cp.isComplimentary),
                      notes: cp.notes ?? null,
                      createdAt: new Date(cp.createdAt),
                      pendingSync: false,
                    }
                  })
                }
              }
            }
          }

          // Mark table status locally
          const tableStatus = co.status === 'OPEN' ? 'OCCUPIED' : 'FREE'
          await prisma.table.update({
            where: { id: co.tableId },
            data: { status: tableStatus },
          }).catch(() => {
            console.warn(`[Pull] Table ${co.tableId} not found locally, skipping status update`)
          })

          pulled.orders++
        } else {
          // ── Synchronize phone payment attachment from cloud to offline PC ──────
          const cloudRef = co.verifiedRef ? String(co.verifiedRef).trim().toUpperCase() : null
          const localRef = localOrder.verifiedRef ? String(localOrder.verifiedRef).trim().toUpperCase() : null
          const cloudAmount = co.verifiedAmount != null ? Number(co.verifiedAmount) : null
          const localAmount = localOrder.verifiedAmount != null ? Number(localOrder.verifiedAmount) : null
          const cloudProvider = co.verifiedProvider ?? null

          const verificationChanged =
            cloudRef !== localRef ||
            cloudAmount !== localAmount ||
            cloudProvider !== localOrder.verifiedProvider

          if (verificationChanged && (cloudRef || !localOrder.pendingSync)) {
            await prisma.order.update({
              where: { id: co.id },
              data: {
                verifiedRef: cloudRef,
                verifiedProvider: cloudProvider,
                verifiedAmount: cloudAmount,
                verifiedPayer: co.verifiedPayer ?? null,
                verifiedReceiver: co.verifiedReceiver ?? null,
                verifiedAt: co.verifiedAt ? new Date(co.verifiedAt) : null,
              },
            })

            // Broadcast real-time SSE event to local cashier screen in 0ms!
            if (cloudRef && cloudRef !== localRef) {
              const table = await prisma.table.findUnique({ where: { id: co.tableId }, select: { number: true } })
              broadcastVerificationEvent({
                type: 'ORDER_VERIFIED',
                orderId: co.id,
                tableNumber: table?.number,
                reference: cloudRef,
                provider: cloudProvider || 'AUTO',
                amount: cloudAmount ?? undefined,
                payerName: co.verifiedPayer || undefined,
                receiverName: co.verifiedReceiver || undefined,
                timestamp: co.verifiedAt ? new Date(co.verifiedAt).toISOString() : new Date().toISOString(),
              })
            } else if (!cloudRef && localRef) {
              broadcastVerificationEvent({
                type: 'ORDER_CLEARED',
                orderId: co.id,
                timestamp: new Date().toISOString(),
              })
            }
          }

          // If cloud has closed the order (PAID or CANCELLED), cloud terminal status ALWAYS wins!
          const cloudTerminal = co.status === 'PAID' || co.status === 'CANCELLED'
          const localTerminal = localOrder.status === 'PAID' || localOrder.status === 'CANCELLED'

          if (cloudTerminal && localOrder.status !== co.status) {
            await prisma.order.update({
              where: { id: co.id },
              data: { status: co.status, pendingSync: false, updatedAt: new Date(co.updatedAt) },
            })
            // If cloud closed the order, free the table locally
            const tableStatus = co.status === 'OPEN' ? 'OCCUPIED' : 'FREE'
            await prisma.table.update({
              where: { id: co.tableId },
              data: { status: tableStatus, pendingSync: false },
            }).catch(() => {})
          } else if (!localOrder.pendingSync && !localTerminal && localOrder.status !== co.status) {
            await prisma.order.update({
              where: { id: co.id },
              data: { status: co.status, updatedAt: new Date(co.updatedAt) },
            })
            // If cloud closed the order, free the table locally
            const tableStatus = co.status === 'OPEN' ? 'OCCUPIED' : 'FREE'
            await prisma.table.update({
              where: { id: co.tableId },
              data: { status: tableStatus },
            }).catch(() => {})
          }

          // Pull payment for this order if it is paid on cloud but missing locally
          if (co.status === 'PAID') {
            const localPayment = await prisma.payment.findUnique({ where: { orderId: co.id } })
            if (!localPayment) {
              const { rows: cloudPayments } = await pg.query(
                `SELECT id, "orderId", "cashierId", amount, method, discount, "discountType", "isComplimentary", notes, "createdAt"
                 FROM "Payment" WHERE "orderId" = $1 LIMIT 1`,
                [co.id]
              )
              if (cloudPayments.length > 0) {
                const cp = cloudPayments[0]
                const cashierExists = await prisma.user.findUnique({ where: { id: cp.cashierId } })
                if (cashierExists) {
                  await prisma.payment.create({
                    data: {
                      id: cp.id,
                      orderId: cp.orderId,
                      cashierId: cp.cashierId,
                      amount: Number(cp.amount),
                      method: cp.method,
                      discount: Number(cp.discount),
                      discountType: cp.discountType,
                      isComplimentary: Boolean(cp.isComplimentary),
                      notes: cp.notes ?? null,
                      createdAt: new Date(cp.createdAt),
                      pendingSync: false,
                    }
                  })
                }
              }
            }
          }

          // Pull and update any order items for this order
          const { rows: cloudItems } = await pg.query(
            `SELECT id, "orderId", "menuItemId", quantity, notes, status, "printedAt", "createdAt"
             FROM "OrderItem" WHERE "orderId" = $1`,
            [co.id]
          )

          for (const ci of cloudItems) {
            try {
              const localItem = await prisma.orderItem.findUnique({ where: { id: ci.id } })
              if (!localItem) {
                const menuItemExists = await prisma.menuItem.findUnique({ where: { id: ci.menuItemId } })
                if (!menuItemExists) continue
                await prisma.orderItem.create({
                  data: {
                    id: ci.id,
                    orderId: ci.orderId,
                    menuItemId: ci.menuItemId,
                    quantity: ci.quantity,
                    notes: ci.notes ?? null,
                    status: ci.status,
                    printedAt: ci.printedAt ? new Date(ci.printedAt) : null,
                    createdAt: new Date(ci.createdAt),
                    pendingSync: false,
                  },
                })
                pulled.orderItems++
              } else if (!localItem.pendingSync) {
                if (
                  localItem.status !== ci.status ||
                  localItem.quantity !== ci.quantity ||
                  localItem.notes !== ci.notes ||
                  (ci.printedAt && (!localItem.printedAt || new Date(localItem.printedAt).getTime() !== new Date(ci.printedAt).getTime()))
                ) {
                  await prisma.orderItem.update({
                    where: { id: ci.id },
                    data: {
                      status: ci.status,
                      quantity: ci.quantity,
                      notes: ci.notes ?? null,
                      printedAt: ci.printedAt ? new Date(ci.printedAt) : null,
                    }
                  })
                }
              }
            } catch (e) {
              errors.push(`Pull OrderItem ${ci.id} update: ${String(e)}`)
            }
          }
        }
      } catch (e) {
        errors.push(`Pull Order ${co.id}: ${String(e)}`)
      }
    }

    // ── Floor Table Status Self-Healing ───────────────────────────────────────
    try {
      const activeTables = await prisma.table.findMany({
        where: {
          id: { notIn: ['tbl_static_delivery', 'tbl_static_takeaway', '__archived_orders_table__'] }
        },
        select: { id: true, status: true, pendingSync: true, mergedWithId: true, mergeGroupId: true }
      })
      for (const t of activeTables) {
        if (t.pendingSync) continue

        // If this table is merged with another (child table), its status mirrors the host
        if (t.mergedWithId) {
          const hostOpenCount = await prisma.order.count({
            where: { tableId: t.mergedWithId, status: 'OPEN' }
          })
          const targetStatus = hostOpenCount > 0 ? 'OCCUPIED' : 'FREE'
          if (t.status !== targetStatus) {
            await prisma.table.update({
              where: { id: t.id },
              data: { status: targetStatus }
            }).catch(() => {})
          }
          continue
        }

        // Host table or standalone table: check orders on itself and on any merged children
        const relatedTableIds = [t.id]
        if (t.mergeGroupId) {
          const groupTables = await prisma.table.findMany({
            where: { mergeGroupId: t.mergeGroupId },
            select: { id: true }
          })
          groupTables.forEach(gt => { if (!relatedTableIds.includes(gt.id)) relatedTableIds.push(gt.id) })
        } else {
          const childTables = await prisma.table.findMany({
            where: { mergedWithId: t.id },
            select: { id: true }
          })
          childTables.forEach(ct => { if (!relatedTableIds.includes(ct.id)) relatedTableIds.push(ct.id) })
        }

        const openCount = await prisma.order.count({
          where: { tableId: { in: relatedTableIds }, status: 'OPEN' }
        })
        const correctStatus = openCount > 0 ? 'OCCUPIED' : 'FREE'
        if (t.status !== correctStatus) {
          await prisma.table.update({
            where: { id: t.id },
            data: { status: correctStatus }
          }).catch(() => {})
        }
      }
    } catch (healErr) {
      console.warn('[Floor table heal warning]', String(healErr))
    }

    // ── Pull Cancellations from Cloud ──────────────────────────────────────────
    try {
      const { rows: cloudCancellations } = await pg.query(
        `SELECT id, "orderItemId", "managerId", reason, "createdAt" FROM "Cancellation"`
      )
      for (const cc of cloudCancellations) {
        const localC = await prisma.cancellation.findUnique({ where: { id: cc.id } })
        if (localC?.pendingSync) continue
        const orderItemExists = await prisma.orderItem.findUnique({ where: { id: cc.orderItemId } })
        const managerExists = await prisma.user.findUnique({ where: { id: cc.managerId } })
        if (orderItemExists && managerExists) {
          await prisma.cancellation.upsert({
            where: { id: cc.id },
            update: {
              orderItemId: cc.orderItemId,
              managerId: cc.managerId,
              reason: cc.reason,
              createdAt: new Date(cc.createdAt),
              pendingSync: false,
            },
            create: {
              id: cc.id,
              orderItemId: cc.orderItemId,
              managerId: cc.managerId,
              reason: cc.reason,
              createdAt: new Date(cc.createdAt),
              pendingSync: false,
            },
          })
        }
      }

      // Delete local Cancellations that were deleted on cloud
      const cloudCancellationIds = new Set(cloudCancellations.map(cc => cc.id))
      const localSyncedCancellations = await prisma.cancellation.findMany({
        where: { pendingSync: false },
        select: { id: true }
      })
      for (const lc of localSyncedCancellations) {
        if (!cloudCancellationIds.has(lc.id)) {
          await prisma.cancellation.delete({ where: { id: lc.id } }).catch(() => {})
        }
      }
    } catch (e) {
      console.warn('[Pull cancellations warning]', String(e))
      errors.push(`Pull cancellations warning: ${String(e)}`)
    }

    // ── Pull InventoryLogs from Cloud ──────────────────────────────────────────
    try {
      const { rows: cloudInventoryLogs } = await pg.query(
        `SELECT id, "itemName", type, action, quantity, "prevQty", "newQty", "userName", "createdAt"
         FROM "InventoryLog" ORDER BY "createdAt" DESC LIMIT 1000`
      )
      for (const log of cloudInventoryLogs) {
        const localLog = await prisma.inventoryLog.findUnique({ where: { id: log.id } })
        if (localLog?.pendingSync) continue
        await prisma.inventoryLog.upsert({
          where: { id: log.id },
          update: {
            itemName: log.itemName,
            type: log.type,
            action: log.action,
            quantity: Number(log.quantity),
            prevQty: Number(log.prevQty),
            newQty: Number(log.newQty),
            userName: log.userName,
            createdAt: new Date(log.createdAt),
            pendingSync: false,
          },
          create: {
            id: log.id,
            itemName: log.itemName,
            type: log.type,
            action: log.action,
            quantity: Number(log.quantity),
            prevQty: Number(log.prevQty),
            newQty: Number(log.newQty),
            userName: log.userName,
            createdAt: new Date(log.createdAt),
            pendingSync: false,
          },
        })
      }

      // Delete local InventoryLogs that were deleted on cloud
      const { rows: allCloudInvLogs } = await pg.query(`SELECT id, "itemName", action FROM "InventoryLog"`)
      const cloudInvLogIds = new Set(allCloudInvLogs.map(l => l.id))
      const localSyncedInvLogs = await prisma.inventoryLog.findMany({
        where: { pendingSync: false },
        select: { id: true, itemName: true, action: true }
      })
      for (const ll of localSyncedInvLogs) {
        if (!cloudInvLogIds.has(ll.id)) {
          await prisma.inventoryLog.delete({ where: { id: ll.id } }).catch(() => {})
          if (ll.action && typeof ll.action === 'string' && ll.action.startsWith('WASTE')) {
            await prisma.wasteLog.deleteMany({ where: { itemName: ll.itemName } }).catch(() => {})
          }
        }
      }
    } catch (e) {
      console.warn('[Pull inventory logs warning]', String(e))
      errors.push(`Pull inventory logs warning: ${String(e)}`)
    }

    // ── WasteLogs ─────────────────────────────────────────────────────────────
    try {
      const { rows: cloudWaste } = await pg.query(
        `SELECT id, "itemName", "itemType", "itemId", location, quantity, unit, "costPerUnit", "totalCost", reason, notes, "loggedBy", "createdAt" FROM "WasteLog"`
      )
      for (const w of cloudWaste) {
        await prisma.wasteLog.upsert({
          where: { id: w.id },
          update: {
            itemName: w.itemName,
            itemType: w.itemType,
            itemId: w.itemId,
            location: w.location,
            quantity: Number(w.quantity),
            unit: w.unit,
            costPerUnit: Number(w.costPerUnit || 0),
            totalCost: Number(w.totalCost || 0),
            reason: w.reason,
            notes: w.notes,
            loggedBy: w.loggedBy,
            createdAt: new Date(w.createdAt),
            pendingSync: false,
          },
          create: {
            id: w.id,
            itemName: w.itemName,
            itemType: w.itemType,
            itemId: w.itemId,
            location: w.location,
            quantity: Number(w.quantity),
            unit: w.unit,
            costPerUnit: Number(w.costPerUnit || 0),
            totalCost: Number(w.totalCost || 0),
            reason: w.reason,
            notes: w.notes,
            loggedBy: w.loggedBy,
            createdAt: new Date(w.createdAt),
            pendingSync: false,
          },
        })
      }

      // Delete local WasteLogs that were deleted on cloud
      const cloudWasteIds = new Set(cloudWaste.map(w => w.id))
      const localSyncedWasteLogs = await prisma.wasteLog.findMany({
        where: { pendingSync: false },
        select: { id: true, itemName: true }
      })
      for (const lw of localSyncedWasteLogs) {
        if (!cloudWasteIds.has(lw.id)) {
          await prisma.wasteLog.delete({ where: { id: lw.id } }).catch(() => {})
          if (lw.itemName) {
            await prisma.inventoryLog.deleteMany({
              where: { itemName: lw.itemName, action: { startsWith: 'WASTE' } }
            }).catch(() => {})
          }
        }
      }
    } catch (e) {
      console.warn('[Pull waste logs warning]', String(e))
    }

    return { pulled, errors }
  } catch (e) {
    // Network/connection failed — reset pool so next attempt starts fresh
    resetPool()
    return {
      pulled,
      errors: [`Fatal pull error (offline?): ${String(e)}`],
    }
  }
}

/**
 * Push all pending local records to Neon.
 * Safe to call concurrently — isSyncing guard serialises runs.
 */
export async function syncToCloud(): Promise<SyncResult> {
  if (process.env.VERCEL) {
    return {
      success: true,
      synced: { orders: 0, orderItems: 0, payments: 0, cancellations: 0, inventoryLogs: 0, tables: 0, staffMembers: 0, staffMenuItems: 0, staffIngredients: 0, staffRecipes: 0, staffMeals: 0, staffMealItems: 0 },
      pulled: { orders: 0, orderItems: 0 },
      errors: [],
      lastSyncedAt: new Date(),
    }
  }

  if (isSyncing) {
    return {
      success: false,
      synced: { orders: 0, orderItems: 0, payments: 0, cancellations: 0, inventoryLogs: 0, tables: 0, staffMembers: 0, staffMenuItems: 0, staffIngredients: 0, staffRecipes: 0, staffMeals: 0, staffMealItems: 0 },
      pulled: { orders: 0, orderItems: 0 },
      errors: ['Sync already in progress'],
      lastSyncedAt: null,
    }
  }

  isSyncing = true
  const errors: string[] = []
  const synced = { orders: 0, orderItems: 0, payments: 0, cancellations: 0, inventoryLogs: 0, tables: 0, staffMembers: 0, staffMenuItems: 0, staffIngredients: 0, staffRecipes: 0, staffMeals: 0, staffMealItems: 0 }

  try {
    // ── Pull cloud-native records first ───────────────────────────────────────
    // Pull runs before we grab the push pool. If pull hits a timeout it calls
    // resetPool() — we must call getPool() AFTER pull completes so the push
    // phase always gets a fresh, live connection.
    const pullResult = await pullFromCloud()
    errors.push(...pullResult.errors)

    // Get (or re-create) the pool AFTER pull so we never use a terminated pool.
    // If pull indicated a fatal network error, skip push entirely — the network
    // is down and any pg.query call will just generate more noise in the logs.
    const isFatalPull = pullResult.errors.some(e => e.startsWith('Fatal pull error'))
    if (isFatalPull) {
      return {
        success: false,
        synced,
        pulled: pullResult.pulled,
        errors: pullResult.errors,
        lastSyncedAt: null,
      }
    }

    const pg = getPool()
    // ── Users (must push BEFORE Orders/Cancellations so FK targets exist) ─────
    const allLocalUsers = await prisma.user.findMany()
    for (const u of allLocalUsers) {
      // System accounts are always preserved; check tombstones with createdAt for standard staff
      if (isUserDeleted(u.id, u.username, u.createdAt)) {
        continue
      }
      try {
        await pg.query(
          `INSERT INTO "User" (id, username, "passwordHash", "fullName", role, phone, active, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (username) DO UPDATE SET
             id             = EXCLUDED.id,
             "passwordHash" = EXCLUDED."passwordHash",
             "fullName"     = EXCLUDED."fullName",
             role           = EXCLUDED.role,
             phone          = EXCLUDED.phone,
             active         = EXCLUDED.active`,
          [u.id, u.username, u.passwordHash, u.fullName, u.role, u.phone, u.active, u.createdAt]
        )
      } catch (e: any) {
        errors.push(`User ${u.username}: ${String(e?.message || e)}`)
      }
    }
    // Note: Catalog items (Categories, Ingredients, MenuItems, Recipes) are synced from
    // cloud via pullFromCloud(), and local mutations are pushed explicitly via their API routes.
    // They are intentionally not blind-inserted here on every tick to prevent resurrecting cloud deletions.

    // ── Tables (must push BEFORE Orders so foreign keys exist in cloud) ──────
    const allLocalTables = await prisma.table.findMany()
    for (const t of allLocalTables) {
      try {
        await pg.query(
          `INSERT INTO "Table" (id, number, status, "mergedWithId", "mergeGroupId", "mergeGroupLabel", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             number           = EXCLUDED.number,
             status           = EXCLUDED.status,
             "mergedWithId"   = EXCLUDED."mergedWithId",
             "mergeGroupId"   = EXCLUDED."mergeGroupId",
             "mergeGroupLabel" = EXCLUDED."mergeGroupLabel"`,
          [t.id, t.number, t.status, t.mergedWithId, t.mergeGroupId, t.mergeGroupLabel, toUtcIso(t.createdAt)]
        )
        if (t.pendingSync) {
          await prisma.table.update({
            where: { id: t.id },
            data: { pendingSync: false },
          })
          synced.tables = (synced.tables ?? 0) + 1
        }
      } catch (e) {
        errors.push(`Table ${t.id}: ${String(e)}`)
      }
    }

    // ── Orders ────────────────────────────────────────────────────────────────
    const pendingOrders = await prisma.order.findMany({ where: { pendingSync: true } })
    for (const o of pendingOrders) {
      try {
        // Ensure the order's table exists on cloud before inserting the order
        const orderTable = await prisma.table.findUnique({ where: { id: o.tableId } })
        if (orderTable) {
          await pg.query(
            `INSERT INTO "Table" (id, number, status, "mergedWithId", "mergeGroupId", "mergeGroupLabel", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [orderTable.id, orderTable.number, orderTable.status, orderTable.mergedWithId, orderTable.mergeGroupId, orderTable.mergeGroupLabel, toUtcIso(orderTable.createdAt)]
          )
        } else {
          // If table was deleted locally, create placeholder table in cloud so FK doesn't fail
          await pg.query(
            `INSERT INTO "Table" (id, number, status, "createdAt")
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [o.tableId, 'Archived', 'FREE']
          )
        }
        await pg.query(
          `INSERT INTO "Order" (id, "tableId", "waiterId", status, "createdAt", "updatedAt",
                                "verifiedRef", "verifiedProvider", "verifiedAmount", "verifiedPayer", "verifiedReceiver", "verifiedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             status             = EXCLUDED.status,
             "updatedAt"        = EXCLUDED."updatedAt",
             "verifiedRef"      = COALESCE(EXCLUDED."verifiedRef", "Order"."verifiedRef"),
             "verifiedProvider" = COALESCE(EXCLUDED."verifiedProvider", "Order"."verifiedProvider"),
             "verifiedAmount"   = COALESCE(EXCLUDED."verifiedAmount", "Order"."verifiedAmount"),
             "verifiedPayer"    = COALESCE(EXCLUDED."verifiedPayer", "Order"."verifiedPayer"),
             "verifiedReceiver" = COALESCE(EXCLUDED."verifiedReceiver", "Order"."verifiedReceiver"),
             "verifiedAt"       = COALESCE(EXCLUDED."verifiedAt", "Order"."verifiedAt")`,
          [
            o.id,
            o.tableId,
            o.waiterId,
            o.status,
            toUtcIso(o.createdAt),
            toUtcIso(o.updatedAt),
            o.verifiedRef ?? null,
            o.verifiedProvider ?? null,
            o.verifiedAmount ?? null,
            o.verifiedPayer ?? null,
            o.verifiedReceiver ?? null,
            toUtcIso(o.verifiedAt),
          ]
        )
        const tableStatus = o.status === 'OPEN' ? 'OCCUPIED' : 'FREE'
        await pg.query('UPDATE "Table" SET status = $1 WHERE id = $2', [tableStatus, o.tableId])

        await prisma.order.update({
          where: { id: o.id },
          data: { pendingSync: false, syncedAt: new Date() },
        })
        synced.orders++
      } catch (e) {
        errors.push(`Order ${o.id}: ${String(e)}`)
      }
    }

    // ── OrderItems ────────────────────────────────────────────────────────────
    const pendingItems = await prisma.orderItem.findMany({
      where: { pendingSync: true },
      include: { order: { select: { pendingSync: true } } },
    })
    for (const oi of pendingItems) {
      // Skip if the parent Order hasn't been synced yet — the cloud FK would fail
      if (oi.order?.pendingSync) {
        errors.push(`OrderItem ${oi.id}: skipped — parent order not yet synced`)
        continue
      }
      try {
        await pg.query(
          `INSERT INTO "OrderItem" (id, "orderId", "menuItemId", quantity, notes, status, "printedAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             status      = EXCLUDED.status,
             quantity    = EXCLUDED.quantity,
             notes       = EXCLUDED.notes,
             "printedAt" = EXCLUDED."printedAt"`,
          [oi.id, oi.orderId, oi.menuItemId, oi.quantity, oi.notes, oi.status, toUtcIso(oi.printedAt), toUtcIso(oi.createdAt)]
        )
        await prisma.orderItem.update({
          where: { id: oi.id },
          data: { pendingSync: false },
        })
        synced.orderItems++
      } catch (e) {
        errors.push(`OrderItem ${oi.id}: ${String(e)}`)
      }
    }

    // ── Payments ──────────────────────────────────────────────────────────────
    const pendingPayments = await prisma.payment.findMany({
      where: { pendingSync: true },
      include: { order: true },
    })
    for (const pay of pendingPayments) {
      try {
        await pg.query(
          `INSERT INTO "Payment" (id, "orderId", "cashierId", amount, method, discount, "discountType", "isComplimentary", notes, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ("orderId") DO UPDATE SET
             amount   = EXCLUDED.amount,
             method   = EXCLUDED.method,
             discount = EXCLUDED.discount,
             notes    = EXCLUDED.notes`,
          [
            pay.id, pay.orderId, pay.cashierId,
            pay.amount, pay.method, pay.discount,
            pay.discountType, pay.isComplimentary, pay.notes, toUtcIso(pay.createdAt),
          ]
        )
        if (pay.order) {
          await pg.query('UPDATE "Table" SET status = $1 WHERE id = $2', ['FREE', pay.order.tableId])
        }
        await prisma.payment.update({
          where: { id: pay.id },
          data: { pendingSync: false },
        })
        synced.payments++
      } catch (e) {
        errors.push(`Payment ${pay.id}: ${String(e)}`)
      }
    }

    // ── Cancellations ─────────────────────────────────────────────────────────
    const pendingCancellations = await prisma.cancellation.findMany({
      where: { pendingSync: true },
      include: {
        manager: true,
        orderItem: { select: { pendingSync: true } },
      },
    })
    for (const c of pendingCancellations) {
      // Skip if the referenced OrderItem hasn't been synced yet
      if (c.orderItem?.pendingSync) {
        errors.push(`Cancellation ${c.id}: skipped — orderItem not yet synced`)
        continue
      }
      try {
        // Ensure the manager User exists on Neon before inserting the Cancellation
        if (c.manager) {
          await pg.query(
            `INSERT INTO "User" (id, username, "passwordHash", "fullName", role, phone, active, "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               "fullName" = EXCLUDED."fullName",
               role       = EXCLUDED.role`,
            [c.manager.id, c.manager.username, c.manager.passwordHash, c.manager.fullName,
             c.manager.role, c.manager.phone, c.manager.active, toUtcIso(c.manager.createdAt)]
          )
        }
        await pg.query(
          `INSERT INTO "Cancellation" (id, "orderItemId", "managerId", reason, "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("orderItemId") DO UPDATE SET reason = EXCLUDED.reason`,
          [c.id, c.orderItemId, c.managerId, c.reason, toUtcIso(c.createdAt)]
        )
        await prisma.cancellation.update({
          where: { id: c.id },
          data: { pendingSync: false },
        })
        synced.cancellations++
      } catch (e) {
        errors.push(`Cancellation ${c.id}: ${String(e)}`)
      }
    }

    // ── InventoryLogs ─────────────────────────────────────────────────────────
    const pendingLogs = await prisma.inventoryLog.findMany({ where: { pendingSync: true } })
    for (const log of pendingLogs) {
      try {
        await pg.query(
          `INSERT INTO "InventoryLog" (id, "itemName", type, action, quantity, "prevQty", "newQty", "userName", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [log.id, log.itemName, log.type, log.action, log.quantity, log.prevQty, log.newQty, log.userName, toUtcIso(log.createdAt)]
        )
        await prisma.inventoryLog.update({
          where: { id: log.id },
          data: { pendingSync: false },
        })
        synced.inventoryLogs++
      } catch (e) {
        errors.push(`InventoryLog ${log.id}: ${String(e)}`)
      }
    }

    // ── WasteLogs ─────────────────────────────────────────────────────────────
    const pendingWasteLogs = await prisma.wasteLog.findMany({ where: { pendingSync: true } })
    for (const wl of pendingWasteLogs) {
      try {
        await pg.query(
          `INSERT INTO "WasteLog" (id, "itemName", "itemType", "itemId", location, quantity, unit, "costPerUnit", "totalCost", reason, notes, "loggedBy", "createdAt", "pendingSync")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             "itemName" = EXCLUDED."itemName",
             "itemType" = EXCLUDED."itemType",
             location = EXCLUDED.location,
             quantity = EXCLUDED.quantity,
             unit = EXCLUDED.unit,
             "costPerUnit" = EXCLUDED."costPerUnit",
             "totalCost" = EXCLUDED."totalCost",
             reason = EXCLUDED.reason,
             notes = EXCLUDED.notes,
             "loggedBy" = EXCLUDED."loggedBy"`,
          [wl.id, wl.itemName, wl.itemType, wl.itemId, wl.location, wl.quantity, wl.unit, wl.costPerUnit, wl.totalCost, wl.reason, wl.notes, wl.loggedBy, toUtcIso(wl.createdAt), false]
        )
        await prisma.wasteLog.update({
          where: { id: wl.id },
          data: { pendingSync: false },
        })
      } catch (e) {
        errors.push(`WasteLog ${wl.id}: ${String(e)}`)
      }
    }


    // ── StaffMembers ──────────────────────────────────────────────────────────
    // Must push before StaffMeals so the cloud FK target exists.
    const pendingStaffMembers = await prisma.staffMember.findMany({ where: { pendingSync: true } })
    for (const sm of pendingStaffMembers) {
      try {
        await pg.query(
          `INSERT INTO "StaffMember" (id, name, role, shift, active, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             name   = EXCLUDED.name,
             role   = EXCLUDED.role,
             shift  = EXCLUDED.shift,
             active = EXCLUDED.active`,
          [sm.id, sm.name, sm.role, sm.shift, sm.active, toUtcIso(sm.createdAt)]
        )
        await prisma.staffMember.update({
          where: { id: sm.id },
          data: { pendingSync: false }
        })
        synced.staffMembers++
      } catch (e) {
        errors.push(`StaffMember ${sm.id}: ${String(e)}`)
      }
    }

    // ── StaffMenuItems ────────────────────────────────────────────────────────
    const pendingStaffMenuItems = await prisma.staffMenuItem.findMany({ where: { pendingSync: true } })
    for (const smi of pendingStaffMenuItems) {
      try {
        await pg.query(
          `INSERT INTO "StaffMenuItem" (id, name, "mealType", "linkedMenuItemId", "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             name               = EXCLUDED.name,
             "mealType"         = EXCLUDED."mealType",
             "linkedMenuItemId" = EXCLUDED."linkedMenuItemId"`,
          [smi.id, smi.name, smi.mealType, smi.linkedMenuItemId, toUtcIso(smi.createdAt)]
        )
        await prisma.staffMenuItem.update({
          where: { id: smi.id },
          data: { pendingSync: false }
        })
        synced.staffMenuItems++
      } catch (e) {
        errors.push(`StaffMenuItem ${smi.id}: ${String(e)}`)
      }
    }

    // ── StaffIngredients ──────────────────────────────────────────────────────
    const pendingStaffIngredients = await prisma.staffIngredient.findMany({ where: { pendingSync: true } })
    for (const si of pendingStaffIngredients) {
      try {
        await pg.query(
          `INSERT INTO "StaffIngredient" (id, name, unit, quantity, "minThreshold", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             name           = EXCLUDED.name,
             unit           = EXCLUDED.unit,
             quantity       = EXCLUDED.quantity,
             "minThreshold" = EXCLUDED."minThreshold"`,
          [si.id, si.name, si.unit, si.quantity, si.minThreshold, toUtcIso(si.createdAt)]
        )
        await prisma.staffIngredient.update({
          where: { id: si.id },
          data: { pendingSync: false }
        })
        synced.staffIngredients++
      } catch (e) {
        errors.push(`StaffIngredient ${si.id}: ${String(e)}`)
      }
    }

    // ── StaffRecipes ──────────────────────────────────────────────────────────
    // Push after StaffMenuItem + StaffIngredient so both cloud FK targets exist.
    const pendingStaffRecipes = await prisma.staffRecipe.findMany({ where: { pendingSync: true } })
    for (const sr of pendingStaffRecipes) {
      try {
        await pg.query(
          `INSERT INTO "StaffRecipe" (id, "staffMenuItemId", "staffIngredientId", quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             quantity = EXCLUDED.quantity`,
          [sr.id, sr.staffMenuItemId, sr.staffIngredientId, sr.quantity]
        )
        await prisma.staffRecipe.update({
          where: { id: sr.id },
          data: { pendingSync: false }
        })
        synced.staffRecipes++
      } catch (e) {
        errors.push(`StaffRecipe ${sr.id}: ${String(e)}`)
      }
    }

    // ── StaffMeals ────────────────────────────────────────────────────────────
    const pendingStaffMeals = await prisma.staffMeal.findMany({ where: { pendingSync: true } })
    for (const sm of pendingStaffMeals) {
      try {
        await pg.query(
          `INSERT INTO "StaffMeal" (id, "staffMemberId", "mealType", "servedAt", "createdAt", "pendingSync")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             "mealType" = EXCLUDED."mealType",
             "servedAt" = EXCLUDED."servedAt",
             "pendingSync" = EXCLUDED."pendingSync"`,
          [sm.id, sm.staffMemberId, sm.mealType, toUtcIso(sm.servedAt), toUtcIso(sm.createdAt), false]
        )
        await prisma.staffMeal.update({
          where: { id: sm.id },
          data: { pendingSync: false }
        })
        synced.staffMeals++
      } catch (e) {
        errors.push(`StaffMeal ${sm.id}: ${String(e)}`)
      }
    }

    // ── StaffMealItems ────────────────────────────────────────────────────────
    const pendingStaffMealItems = await prisma.staffMealItem.findMany({ where: { pendingSync: true } })
    for (const smi of pendingStaffMealItems) {
      try {
        await pg.query(
          `INSERT INTO "StaffMealItem" (id, "staffMealId", "staffMenuItemId", quantity, "pendingSync")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             quantity = EXCLUDED.quantity,
             "pendingSync" = EXCLUDED."pendingSync"`,
          [smi.id, smi.staffMealId, smi.staffMenuItemId, smi.quantity, false]
        )
        await prisma.staffMealItem.update({
          where: { id: smi.id },
          data: { pendingSync: false }
        })
        synced.staffMealItems++
      } catch (e) {
        errors.push(`StaffMealItem ${smi.id}: ${String(e)}`)
      }
    }

    return {
      success: errors.length === 0,
      synced,
      pulled: pullResult.pulled,
      errors,
      lastSyncedAt: new Date(),
    }
  } catch (e) {
    // Network/connection failed — reset pool so next attempt starts fresh
    resetPool()
    return {
      success: false,
      synced,
      pulled: { orders: 0, orderItems: 0 },
      errors: [`Fatal sync error (offline?): ${String(e)}`],
      lastSyncedAt: null,
    }
  } finally {
    isSyncing = false
  }
}

/**
 * Runs pull then push in sequence.
 * Alias kept for clarity when called from the /api/sync POST handler.
 */
export const syncBothDirections = syncToCloud
