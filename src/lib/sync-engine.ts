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
import { Pool as PgPool } from 'pg'

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
  if (!_pool) {
    const url = process.env.NEON_DATABASE_URL
    if (!url) throw new Error('NEON_DATABASE_URL is not set in .env')
    _pool = new PgPool({
      connectionString: url,
      max: 3,
      // 3 s — fail-fast when offline so the app never hangs waiting for Neon
      connectionTimeoutMillis: 3000,
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
    _pool.end().catch(() => {})
    _pool = null
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
      const userIds = cloudUsers.map(u => u.id)

      try {
        await prisma.user.deleteMany({
          where: { id: { notIn: userIds } }
        })
      } catch (e) {
        console.warn('[Pull static] User delete warning:', String(e))
      }

      for (const u of cloudUsers) {
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
      const catIds = cloudCats.map(c => c.id)
      
      try {
        await prisma.category.deleteMany({
          where: { id: { notIn: catIds } }
        })
      } catch (e) {
        console.warn('[Pull static] Category delete warning:', String(e))
      }

      for (const c of cloudCats) {
        await prisma.category.upsert({
          where: { id: c.id },
          update: { name: c.name, type: c.type, createdAt: new Date(c.createdAt) },
          create: { id: c.id, name: c.name, type: c.type, createdAt: new Date(c.createdAt) },
        })
      }

      // 2. Ingredients
      const { rows: cloudIngs } = await pg.query(
        `SELECT id, name, unit, quantity, "minThreshold", "createdAt" FROM "Ingredient"`
      )
      const ingIds = cloudIngs.map(i => i.id)

      try {
        await prisma.ingredient.deleteMany({
          where: { id: { notIn: ingIds } }
        })
      } catch (e) {
        console.warn('[Pull static] Ingredient delete warning:', String(e))
      }

      for (const i of cloudIngs) {
        await prisma.ingredient.upsert({
          where: { id: i.id },
          update: { 
            name: i.name, 
            unit: i.unit, 
            quantity: Number(i.quantity), 
            minThreshold: Number(i.minThreshold), 
            createdAt: new Date(i.createdAt) 
          },
          create: { 
            id: i.id, 
            name: i.name, 
            unit: i.unit, 
            quantity: Number(i.quantity), 
            minThreshold: Number(i.minThreshold), 
            createdAt: new Date(i.createdAt) 
          },
        })
      }

      // 3. MenuItems
      const { rows: cloudItems } = await pg.query(
        `SELECT id, "categoryId", name, description, price, available, "stockQuantity", "barQuantity", "costPrice", "lowStockThreshold", "parentItemId", "unitMultiplier", "createdAt" FROM "MenuItem"`
      )
      const itemIds = cloudItems.map(item => item.id)

      try {
        await prisma.menuItem.deleteMany({
          where: { id: { notIn: itemIds } }
        })
      } catch (e) {
        console.warn('[Pull static] MenuItem delete warning:', String(e))
      }

      // First pass: upsert with parentItemId = null to avoid self-referential foreign key constraint issues
      for (const item of cloudItems) {
        await prisma.menuItem.upsert({
          where: { id: item.id },
          update: {
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
          create: {
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

      // 4. Recipes
      const { rows: cloudRecipes } = await pg.query(
        `SELECT id, "menuItemId", "ingredientId", quantity FROM "Recipe"`
      )
      const recipeIds = cloudRecipes.map(r => r.id)

      try {
        await prisma.recipe.deleteMany({
          where: { id: { notIn: recipeIds } }
        })
      } catch (e) {
        console.warn('[Pull static] Recipe delete warning:', String(e))
      }

      for (const r of cloudRecipes) {
        await prisma.recipe.upsert({
          where: { id: r.id },
          update: {
            menuItemId: r.menuItemId,
            ingredientId: r.ingredientId,
            quantity: Number(r.quantity),
          },
          create: {
            id: r.id,
            menuItemId: r.menuItemId,
            ingredientId: r.ingredientId,
            quantity: Number(r.quantity),
          },
        })
      }

      // 5. Tables
      const { rows: cloudTables } = await pg.query(
        `SELECT id, number, status, "mergedWithId", "createdAt" FROM "Table"`
      )
      const tableIds = cloudTables.map(t => t.id)

      try {
        await prisma.table.deleteMany({
          where: { id: { notIn: tableIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] Table delete warning:', String(e))
      }

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

      
      // 6. StaffMembers
      const { rows: cloudStaffMembers } = await pg.query(
        `SELECT id, name, role, shift, active, "createdAt" FROM "StaffMember"`
      )
      const staffMemberIds = cloudStaffMembers.map(sm => sm.id)

      try {
        // Only delete rows that have already been synced to the cloud and are now
        // absent there. Locally-created rows (pendingSync: true) are preserved so a
        // pull never wipes staff data the user just added but hasn't pushed yet.
        await prisma.staffMember.deleteMany({
          where: { id: { notIn: staffMemberIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffMember delete warning:', String(e))
      }

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

      // 7. StaffMenuItems
      const { rows: cloudStaffMenuItems } = await pg.query(
        `SELECT id, name, "mealType", "linkedMenuItemId", "createdAt" FROM "StaffMenuItem"`
      )
      const staffMenuItemIds = cloudStaffMenuItems.map(smi => smi.id)

      try {
        // Preserve locally-created items (pendingSync: true); only prune rows that
        // were previously synced and have since been deleted on the cloud.
        await prisma.staffMenuItem.deleteMany({
          where: { id: { notIn: staffMenuItemIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffMenuItem delete warning:', String(e))
      }

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

      // 8. StaffIngredients (staff-kitchen raw inventory)
      const { rows: cloudStaffIngredients } = await pg.query(
        `SELECT id, name, unit, quantity, "minThreshold", "createdAt" FROM "StaffIngredient"`
      )
      const staffIngredientIds = cloudStaffIngredients.map(si => si.id)

      try {
        // Preserve locally-created/edited rows (pendingSync: true).
        await prisma.staffIngredient.deleteMany({
          where: { id: { notIn: staffIngredientIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffIngredient delete warning:', String(e))
      }

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

      // 9. StaffRecipes (food → ingredient consumption map)
      const { rows: cloudStaffRecipes } = await pg.query(
        `SELECT id, "staffMenuItemId", "staffIngredientId", quantity FROM "StaffRecipe"`
      )
      const staffRecipeIds = cloudStaffRecipes.map(sr => sr.id)

      try {
        await prisma.staffRecipe.deleteMany({
          where: { id: { notIn: staffRecipeIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffRecipe delete warning:', String(e))
      }

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

      // 10. StaffMeals
      const { rows: cloudStaffMeals } = await pg.query(
        `SELECT id, "staffMemberId", "mealType", "servedAt", "createdAt" FROM "StaffMeal"`
      )
      const staffMealIds = cloudStaffMeals.map(sm => sm.id)

      try {
        await prisma.staffMeal.deleteMany({
          where: { id: { notIn: staffMealIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffMeal delete warning:', String(e))
      }

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
      const staffMealItemIds = cloudStaffMealItems.map(smi => smi.id)

      try {
        await prisma.staffMealItem.deleteMany({
          where: { id: { notIn: staffMealItemIds }, pendingSync: false }
        })
      } catch (e) {
        console.warn('[Pull static] StaffMealItem delete warning:', String(e))
      }

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
    } catch (e) {
      console.warn('[Pull static warning]', String(e))
      errors.push(`Static sync warning: ${String(e)}`)
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
    // - Any orders updated in the last 7 days (to catch orders closed while offline)
    const { rows: cloudOrders } = await pg.query(
      `SELECT id, "tableId", "waiterId", status, "createdAt", "updatedAt"
       FROM "Order"
       WHERE status = 'OPEN'
          OR id = ANY($1)
          OR "updatedAt" > NOW() - INTERVAL '7 days'
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
    const pg = getPool()

    // ── Pull cloud-native records first ───────────────────────────────────────
    // (runs inside the isSyncing lock so we don't double-connect)
    const pullResult = await pullFromCloud()
    errors.push(...pullResult.errors)

    // ── Orders ────────────────────────────────────────────────────────────────
    const pendingOrders = await prisma.order.findMany({ where: { pendingSync: true } })
    for (const o of pendingOrders) {
      try {
        await pg.query(
          `INSERT INTO "Order" (id, "tableId", "waiterId", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             status      = EXCLUDED.status,
             "updatedAt" = EXCLUDED."updatedAt"`,
          [o.id, o.tableId, o.waiterId, o.status, o.createdAt, o.updatedAt]
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
    const pendingItems = await prisma.orderItem.findMany({ where: { pendingSync: true } })
    for (const oi of pendingItems) {
      try {
        await pg.query(
          `INSERT INTO "OrderItem" (id, "orderId", "menuItemId", quantity, notes, status, "printedAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             status      = EXCLUDED.status,
             quantity    = EXCLUDED.quantity,
             notes       = EXCLUDED.notes,
             "printedAt" = EXCLUDED."printedAt"`,
          [oi.id, oi.orderId, oi.menuItemId, oi.quantity, oi.notes, oi.status, oi.printedAt, oi.createdAt]
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
            pay.discountType, pay.isComplimentary, pay.notes, pay.createdAt,
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
    const pendingCancellations = await prisma.cancellation.findMany({ where: { pendingSync: true } })
    for (const c of pendingCancellations) {
      try {
        await pg.query(
          `INSERT INTO "Cancellation" (id, "orderItemId", "managerId", reason, "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("orderItemId") DO UPDATE SET reason = EXCLUDED.reason`,
          [c.id, c.orderItemId, c.managerId, c.reason, c.createdAt]
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
          [log.id, log.itemName, log.type, log.action, log.quantity, log.prevQty, log.newQty, log.userName, log.createdAt]
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

    // ── Tables ────────────────────────────────────────────────────────────────
    // Push new/renamed tables so they appear on every terminal.
    const pendingTables = await prisma.table.findMany({ where: { pendingSync: true } })
    for (const t of pendingTables) {
      try {
        await pg.query(
          `INSERT INTO "Table" (id, number, status, "mergedWithId", "createdAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             number           = EXCLUDED.number,
             "mergedWithId"   = EXCLUDED."mergedWithId"`,
          [t.id, t.number, t.status, t.mergedWithId, t.createdAt]
        )
        await prisma.table.update({
          where: { id: t.id },
          data: { pendingSync: false },
        })
        synced.tables = (synced.tables ?? 0) + 1
      } catch (e) {
        errors.push(`Table ${t.id}: ${String(e)}`)
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
          [sm.id, sm.name, sm.role, sm.shift, sm.active, sm.createdAt]
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
          [smi.id, smi.name, smi.mealType, smi.linkedMenuItemId, smi.createdAt]
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
          [si.id, si.name, si.unit, si.quantity, si.minThreshold, si.createdAt]
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
          [sm.id, sm.staffMemberId, sm.mealType, sm.servedAt, sm.createdAt, false]
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
