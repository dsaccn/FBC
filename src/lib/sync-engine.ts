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
  if (!_pool || (_pool as any).ending) {
    const url = process.env.NEON_DATABASE_URL
    if (!url) throw new Error('NEON_DATABASE_URL is not set in .env')
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
  if (process.env.VERCEL) return // Vercel writes directly to Neon, no extra step needed
  try {
    const pg = getPool()
    await pg.query(sql, params)
  } catch {
    // Offline or pool error — sync engine will reconcile on next push
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
  costPerUnit?: number
  minThreshold: number
  createdAt: Date
}): Promise<void> {
  if (process.env.VERCEL) return
  try {
    const pg = getPool()
    await pg.query(
      `INSERT INTO "Ingredient" (id, name, unit, quantity, "costPerUnit", "minThreshold", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name           = EXCLUDED.name,
         unit           = EXCLUDED.unit,
         quantity       = EXCLUDED.quantity,
         "costPerUnit"  = EXCLUDED."costPerUnit",
         "minThreshold" = EXCLUDED."minThreshold"`,
      [i.id, i.name, i.unit, i.quantity, i.costPerUnit ?? 0, i.minThreshold, i.createdAt]
    )
  } catch (err: any) {
    console.warn('[SyncEngine] pushIngredientToCloud error (offline?):', err?.message)
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
    try {
      // 0. Users / Staff
      const { rows: cloudUsers } = await pg.query(
        `SELECT id, username, "passwordHash", "fullName", role, phone, active, "createdAt" FROM "User"`
      )

      for (const u of cloudUsers) {
        // Match existing users by username. The `update` branch intentionally
        // does NOT change `id` — this preserves local ids embedded in active
        // JWT session tokens. Only brand-new cloud-created staff get the cloud id.
        await prisma.user.upsert({
          where: { username: u.username },
          update: {
            passwordHash: u.passwordHash,
            fullName: u.fullName,
            role: u.role,
            phone: u.phone,
            active: Boolean(u.active),
            createdAt: new Date(u.createdAt),
          },
          create: {
            id: u.id,
            username: u.username,
            passwordHash: u.passwordHash,
            fullName: u.fullName,
            role: u.role,
            phone: u.phone,
            active: Boolean(u.active),
            createdAt: new Date(u.createdAt),
          },
        })
      }

      // 1. Categories
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

      // 2. Ingredients
      const { rows: cloudIngs } = await pg.query(
        `SELECT id, name, unit, quantity, "costPerUnit", "minThreshold", "createdAt" FROM "Ingredient"`
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
                minThreshold: Number(i.minThreshold),
                createdAt: new Date(i.createdAt),
              },
            })
          }
        } else {
          // Existing ingredient: sync details from cloud including inventory quantity
          try {
            await prisma.ingredient.update({
              where: { id: i.id },
              data: {
                name: i.name,
                unit: i.unit,
                quantity: Number(i.quantity),
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

      // 3. MenuItems
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


      // 5. Tables
      const { rows: cloudTables } = await pg.query(
        `SELECT id, number, status, "mergedWithId", "createdAt" FROM "Table"`
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
            createdAt: new Date(t.createdAt),
            pendingSync: false,
          },
          create: {
            id: t.id,
            number: t.number,
            status: t.status,
            mergedWithId: t.mergedWithId,
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
      `SELECT id, "tableId", "waiterId", status, "createdAt", "updatedAt"
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

          // Insert the order
          await prisma.order.create({
            data: {
              id: co.id,
              tableId: co.tableId,
              waiterId: co.waiterId,
              status: co.status,
              createdAt: new Date(co.createdAt),
              updatedAt: new Date(co.updatedAt),
              pendingSync: false, // already exists on cloud
            },
          })

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
        } else if (!localOrder.pendingSync) {
          // Record exists and is clean — sync status from cloud only if it's more terminal.
          const terminalLocally = localOrder.status === 'PAID' || localOrder.status === 'CANCELLED'
          if (!terminalLocally && localOrder.status !== co.status) {
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
        select: { id: true, status: true, pendingSync: true }
      })
      for (const t of activeTables) {
        if (t.pendingSync) continue
        const openCount = await prisma.order.count({
          where: { tableId: t.id, status: 'OPEN' }
        })
        const correctStatus = openCount > 0 ? 'OCCUPIED' : 'FREE'
        if (t.status !== correctStatus) {
          await prisma.table.update({
            where: { id: t.id },
            data: { status: correctStatus, mergedWithId: openCount > 0 ? undefined : null }
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
      const { rows: allCloudInvLogs } = await pg.query(`SELECT id FROM "InventoryLog"`)
      const cloudInvLogIds = new Set(allCloudInvLogs.map(l => l.id))
      const localSyncedInvLogs = await prisma.inventoryLog.findMany({
        where: { pendingSync: false },
        select: { id: true }
      })
      for (const ll of localSyncedInvLogs) {
        if (!cloudInvLogIds.has(ll.id)) {
          await prisma.inventoryLog.delete({ where: { id: ll.id } }).catch(() => {})
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
        select: { id: true }
      })
      for (const lw of localSyncedWasteLogs) {
        if (!cloudWasteIds.has(lw.id)) {
          await prisma.wasteLog.delete({ where: { id: lw.id } }).catch(() => {})
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
      try {
        // Try to insert/update by primary key (id)
        await pg.query(
          `INSERT INTO "User" (id, username, "passwordHash", "fullName", role, phone, active, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             "fullName"     = EXCLUDED."fullName",
             role           = EXCLUDED.role,
             phone          = EXCLUDED.phone,
             active         = EXCLUDED.active`,
          [u.id, u.username, u.passwordHash, u.fullName, u.role, u.phone, u.active, u.createdAt]
        )
      } catch (e: any) {
        // If the INSERT failed due to a username uniqueness conflict (same username,
        // different id — can happen when cloud was seeded independently), update by username.
        if (e.code === '23505' && e.constraint?.includes('username')) {
          try {
            await pg.query(
              `UPDATE "User" SET id=$1, "passwordHash"=$3, "fullName"=$4, role=$5, phone=$6, active=$7
               WHERE username=$2`,
              [u.id, u.username, u.passwordHash, u.fullName, u.role, u.phone, u.active]
            )
          } catch (e2) {
            errors.push(`User ${u.id} (username fallback): ${String(e2)}`)
          }
        } else {
          errors.push(`User ${u.id}: ${String(e)}`)
        }
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
          `INSERT INTO "Table" (id, number, status, "mergedWithId", "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             number           = EXCLUDED.number,
             "mergedWithId"   = EXCLUDED."mergedWithId"`,
          [t.id, t.number, t.status, t.mergedWithId, toUtcIso(t.createdAt)]
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
            `INSERT INTO "Table" (id, number, status, "mergedWithId", "createdAt")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [orderTable.id, orderTable.number, orderTable.status, orderTable.mergedWithId, toUtcIso(orderTable.createdAt)]
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
          `INSERT INTO "Order" (id, "tableId", "waiterId", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             status      = EXCLUDED.status,
             "updatedAt" = EXCLUDED."updatedAt"`,
          [o.id, o.tableId, o.waiterId, o.status, toUtcIso(o.createdAt), toUtcIso(o.updatedAt)]
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
