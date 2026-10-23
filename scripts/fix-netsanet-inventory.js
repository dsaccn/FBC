/**
 * fix-netsanet-inventory.js
 * Retroactively applies the inventory deductions for all orders placed by Netsanet
 * that were silently undone by the pullFromCloud() sync-loop bug.
 *
 * Run from project root:  node scripts/fix-netsanet-inventory.js
 */

const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')

const prisma = new PrismaClient()
const NETSANET_ID = 'cmvcaux3300046a9163bs7361'

// ── Neon push helpers ──────────────────────────────────────────────────────────

let _pool = null
function getPool() {
  if (!_pool) {
    const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
    if (!url) { console.warn('No NEON_DATABASE_URL — skipping Neon push'); return null }
    _pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
  }
  return _pool
}

async function pushMenuItemStockToCloud(id, stockQuantity, barQuantity) {
  try {
    const pg = getPool(); if (!pg) return
    await pg.query(
      `UPDATE "MenuItem" SET "stockQuantity" = $1, "barQuantity" = $2 WHERE id = $3`,
      [stockQuantity, barQuantity, id]
    )
  } catch (e) { console.warn('  [Neon push menuItem]', e.message) }
}

async function pushIngredientStockToCloud(id, quantity, barQuantity) {
  try {
    const pg = getPool(); if (!pg) return
    await pg.query(
      `UPDATE "Ingredient" SET quantity = $1, "barQuantity" = $2 WHERE id = $3`,
      [quantity, barQuantity, id]
    )
  } catch (e) { console.warn('  [Neon push ingredient]', e.message) }
}

// ── Main deduction logic (mirrors src/lib/stock.ts) ───────────────────────────

async function applyDeductions(items) {
  if (!items || items.length === 0) return

  // Aggregate quantities
  const qtyMap = new Map()
  for (const item of items) {
    if (!item.menuItemId) continue
    const q = Number(item.quantity || 0)
    if (q > 0) qtyMap.set(item.menuItemId, (qtyMap.get(item.menuItemId) || 0) + q)
  }

  const menuItemIds = Array.from(qtyMap.keys())
  if (menuItemIds.length === 0) return

  const fullMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: true, parentItem: true },
  })
  const fullItemMap = new Map(fullMenuItems.map(fi => [fi.id, fi]))

  // 1. Deduct MenuItem stock
  const modifiedMenuItemIds = new Set()
  await Promise.all(
    Array.from(qtyMap.entries()).map(async ([menuItemId, totalQty]) => {
      const fullItem = fullItemMap.get(menuItemId)
      if (!fullItem) { console.warn('  ⚠ MenuItem not found:', menuItemId); return }

      const isDrink = fullItem.category?.type === 'DRINK'
      console.log(`  Deducting ${totalQty}x "${fullItem.name}" (${isDrink ? 'DRINK' : 'FOOD'})`)

      if (isDrink) {
        if (fullItem.parentItemId && fullItem.parentItem) {
          const deductQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          const parent = fullItem.parentItem
          const newBarQty = Math.max(0, (parent.barQuantity ?? 0) - deductQty)
          await prisma.menuItem.update({ where: { id: fullItem.parentItemId }, data: { barQuantity: newBarQty } })
          modifiedMenuItemIds.add(fullItem.parentItemId)
          console.log(`    → parent "${parent.name}" bar: ${parent.barQuantity} → ${newBarQty}`)
        } else {
          if (fullItem.barQuantity >= totalQty) {
            await prisma.menuItem.update({ where: { id: fullItem.id }, data: { barQuantity: { decrement: totalQty } } })
            console.log(`    → bar: ${fullItem.barQuantity} → ${fullItem.barQuantity - totalQty}`)
          } else {
            const remaining = totalQty - fullItem.barQuantity
            const newStore = Math.max(0, fullItem.stockQuantity - remaining)
            await prisma.menuItem.update({ where: { id: fullItem.id }, data: { barQuantity: 0, stockQuantity: newStore } })
            console.log(`    → bar: ${fullItem.barQuantity} → 0, store: ${fullItem.stockQuantity} → ${newStore}`)
          }
          modifiedMenuItemIds.add(fullItem.id)
        }
      } else {
        if (fullItem.parentItemId && fullItem.parentItem) {
          const deductQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          const parent = fullItem.parentItem
          const newStock = Math.max(0, (parent.stockQuantity ?? 0) - deductQty)
          await prisma.menuItem.update({ where: { id: fullItem.parentItemId }, data: { stockQuantity: newStock } })
          modifiedMenuItemIds.add(fullItem.parentItemId)
          console.log(`    → parent store: ${parent.stockQuantity} → ${newStock}`)
        } else {
          if (fullItem.barQuantity > 0) {
            if (fullItem.barQuantity >= totalQty) {
              await prisma.menuItem.update({ where: { id: fullItem.id }, data: { barQuantity: { decrement: totalQty } } })
              console.log(`    → bar: ${fullItem.barQuantity} → ${fullItem.barQuantity - totalQty}`)
            } else {
              const remaining = totalQty - fullItem.barQuantity
              const newStore = Math.max(0, fullItem.stockQuantity - remaining)
              await prisma.menuItem.update({ where: { id: fullItem.id }, data: { barQuantity: 0, stockQuantity: newStore } })
              console.log(`    → bar: ${fullItem.barQuantity} → 0, store: ${fullItem.stockQuantity} → ${newStore}`)
            }
          } else {
            const newStore = Math.max(0, fullItem.stockQuantity - totalQty)
            await prisma.menuItem.update({ where: { id: fullItem.id }, data: { stockQuantity: newStore } })
            console.log(`    → store: ${fullItem.stockQuantity} → ${newStore}`)
          }
          modifiedMenuItemIds.add(fullItem.id)
        }
      }
    })
  )

  // Push MenuItem stock to Neon
  if (modifiedMenuItemIds.size > 0) {
    const updated = await prisma.menuItem.findMany({
      where: { id: { in: Array.from(modifiedMenuItemIds) } },
      select: { id: true, name: true, stockQuantity: true, barQuantity: true },
    })
    for (const item of updated) {
      await pushMenuItemStockToCloud(item.id, item.stockQuantity, item.barQuantity)
      console.log(`  ✓ Pushed "${item.name}" to Neon: stock=${item.stockQuantity}, bar=${item.barQuantity}`)
    }
  }

  // 2. Deduct ingredient stock via recipes
  const recipes = await prisma.recipe.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: true },
  })
  if (recipes.length === 0) { console.log('  (no recipe ingredients to deduct)'); return }

  const deductions = new Map()
  for (const recipe of recipes) {
    const orderedItem = items.find(i => i.menuItemId === recipe.menuItemId)
    if (!orderedItem) continue
    const needed = recipe.quantity * orderedItem.quantity
    const entry = deductions.get(recipe.ingredientId)
    if (entry) { entry.needed += needed }
    else {
      deductions.set(recipe.ingredientId, {
        name: recipe.ingredient.name,
        currentStore: Number(recipe.ingredient.quantity || 0),
        currentBar: Number(recipe.ingredient.barQuantity || 0),
        needed,
      })
    }
  }

  await Promise.all(
    Array.from(deductions.entries()).map(async ([ingredientId, { name, currentStore, currentBar, needed }]) => {
      const deductFromBar = Math.min(currentBar, needed)
      const remainingNeeded = needed - deductFromBar
      const newBar = Math.max(0, currentBar - deductFromBar)
      const newStore = Math.max(0, currentStore - remainingNeeded)
      await prisma.ingredient.update({ where: { id: ingredientId }, data: { barQuantity: newBar, quantity: newStore } })
      console.log(`  Ingredient "${name}": bar ${currentBar}→${newBar}, store ${currentStore}→${newStore}`)
      await pushIngredientStockToCloud(ingredientId, newStore, newBar)
      console.log(`  ✓ Pushed ingredient "${name}" to Neon`)
    })
  )
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Netsanet Inventory Repair ===\n')

  const orders = await prisma.order.findMany({
    where: { waiterId: NETSANET_ID, status: { in: ['OPEN', 'PAID'] } },
    include: {
      orderItems: {
        where: { cancellation: null },
        select: { menuItemId: true, quantity: true },
      },
    },
  })

  console.log(`Found ${orders.length} orders to process\n`)

  // Flatten all items across all orders
  const allItems = []
  for (const order of orders) {
    for (const item of order.orderItems) {
      allItems.push({ menuItemId: item.menuItemId, quantity: item.quantity })
    }
  }

  console.log(`Total item lines (before aggregation): ${allItems.length}\n`)
  console.log('Applying deductions...\n')

  await applyDeductions(allItems)

  console.log('\n✅ Done. Inventory updated in local SQLite and pushed to Neon.')

  if (_pool) await _pool.end().catch(() => {})
}

main().catch(e => {
  console.error('Script error:', e.message)
  process.exit(1)
}).finally(() => prisma.$disconnect())
