import { prisma } from '@/lib/prisma'

export interface OrderStockItem {
  menuItemId: string
  quantity: number
}

/**
 * Deducts inventory stock when an order is created or items are added.
 * - DRINK items: deducted from Bar (barQuantity). If bar empty/insufficient, remaining from Store (stockQuantity).
 *   Linked drink items (e.g. Jambo): deducted from parent item's barQuantity.
 * - FOOD / OTHER items: deducted directly from Store (stockQuantity).
 *   Linked food items: deducted from parent item's stockQuantity.
 * - RECIPES: any raw ingredients configured in Recipe are deducted from Ingredient stock.
 */
export async function deductOrderStock(items: OrderStockItem[]) {
  if (!items || items.length === 0) return

  // Aggregate quantities by menuItemId to prevent duplicate concurrent updates on the same row
  const qtyMap = new Map<string, number>()
  for (const item of items) {
    if (!item.menuItemId) continue
    const q = Number(item.quantity || 0)
    if (q > 0) {
      qtyMap.set(item.menuItemId, (qtyMap.get(item.menuItemId) || 0) + q)
    }
  }

  const menuItemIds = Array.from(qtyMap.keys())
  if (menuItemIds.length === 0) return

  const fullMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: true, parentItem: true },
  })
  const fullItemMap = new Map(fullMenuItems.map((fi) => [fi.id, fi]))

  // 1. Deduct MenuItem stock
  await Promise.all(
    Array.from(qtyMap.entries()).map(async ([menuItemId, totalQty]) => {
      const fullItem = fullItemMap.get(menuItemId)
      if (!fullItem) return

      const isDrink = fullItem.category?.type === 'DRINK'

      if (isDrink) {
        // --- DRINK ITEMS ---
        if (fullItem.parentItemId && fullItem.parentItem) {
          // Linked drink (e.g. Jambo): deduct from parent's bar stock using unitMultiplier
          const deductQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          const parentCurrent = fullItem.parentItem as any
          const newBarQty = Math.max(0, (parentCurrent.barQuantity ?? 0) - deductQty)
          await prisma.menuItem.update({
            where: { id: fullItem.parentItemId },
            data: { barQuantity: newBarQty },
          })
        } else {
          // Normal drink: deduct from bar stock. If bar empty/insufficient, deduct remaining from store.
          if (fullItem.barQuantity >= totalQty) {
            await prisma.menuItem.update({
              where: { id: fullItem.id },
              data: { barQuantity: { decrement: totalQty } },
            })
          } else {
            const remaining = totalQty - fullItem.barQuantity
            const newStore = Math.max(0, fullItem.stockQuantity - remaining)
            await prisma.menuItem.update({
              where: { id: fullItem.id },
              data: { barQuantity: 0, stockQuantity: newStore },
            })
          }
        }
      } else {
        // --- FOOD & OTHER ITEMS ---
        // Stored in Store (stockQuantity)
        if (fullItem.parentItemId && fullItem.parentItem) {
          // Linked food item: deduct from parent's store stock using unitMultiplier
          const deductQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          const parentCurrent = fullItem.parentItem as any
          const newStock = Math.max(0, (parentCurrent.stockQuantity ?? 0) - deductQty)
          await prisma.menuItem.update({
            where: { id: fullItem.parentItemId },
            data: { stockQuantity: newStock },
          })
        } else {
          // Normal food item: deduct directly from store stock
          if (fullItem.stockQuantity >= totalQty) {
            await prisma.menuItem.update({
              where: { id: fullItem.id },
              data: { stockQuantity: { decrement: totalQty } },
            })
          } else {
            await prisma.menuItem.update({
              where: { id: fullItem.id },
              data: { stockQuantity: 0 },
            })
          }
        }
      }
    })
  )

  // 2. Deduct ingredient stock based on recipes (batched)
  await deductIngredients(items)
}

/**
 * Restores inventory stock when an order item is cancelled.
 */
export async function restoreOrderStock(items: OrderStockItem[]) {
  if (!items || items.length === 0) return

  const qtyMap = new Map<string, number>()
  for (const item of items) {
    if (!item.menuItemId) continue
    const q = Number(item.quantity || 0)
    if (q > 0) {
      qtyMap.set(item.menuItemId, (qtyMap.get(item.menuItemId) || 0) + q)
    }
  }

  const menuItemIds = Array.from(qtyMap.keys())
  if (menuItemIds.length === 0) return

  const fullMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: true, parentItem: true },
  })
  const fullItemMap = new Map(fullMenuItems.map((fi) => [fi.id, fi]))

  await Promise.all(
    Array.from(qtyMap.entries()).map(async ([menuItemId, totalQty]) => {
      const fullItem = fullItemMap.get(menuItemId)
      if (!fullItem) return

      const isDrink = fullItem.category?.type === 'DRINK'

      if (isDrink) {
        if (fullItem.parentItemId && fullItem.parentItem) {
          const restoreQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          await prisma.menuItem.update({
            where: { id: fullItem.parentItemId },
            data: { barQuantity: { increment: restoreQty } },
          })
        } else {
          await prisma.menuItem.update({
            where: { id: fullItem.id },
            data: { barQuantity: { increment: totalQty } },
          })
        }
      } else {
        if (fullItem.parentItemId && fullItem.parentItem) {
          const restoreQty = Math.round(totalQty * fullItem.unitMultiplier * 100) / 100
          await prisma.menuItem.update({
            where: { id: fullItem.parentItemId },
            data: { stockQuantity: { increment: restoreQty } },
          })
        } else {
          await prisma.menuItem.update({
            where: { id: fullItem.id },
            data: { stockQuantity: { increment: totalQty } },
          })
        }
      }
    })
  )

  // Restore ingredients if recipe exists
  await restoreIngredients(items)
}

async function deductIngredients(items: OrderStockItem[]) {
  if (!items || items.length === 0) return
  const menuItemIds = items.map((i) => i.menuItemId)

  const recipes = await prisma.recipe.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: true },
  })
  if (recipes.length === 0) return

  const deductions = new Map<string, { current: number; needed: number }>()
  for (const recipe of recipes) {
    const orderedItem = items.find((i) => i.menuItemId === recipe.menuItemId)
    if (!orderedItem) continue
    const needed = recipe.quantity * orderedItem.quantity
    const entry = deductions.get(recipe.ingredientId)
    if (entry) {
      entry.needed += needed
    } else {
      deductions.set(recipe.ingredientId, { current: recipe.ingredient.quantity, needed })
    }
  }

  await Promise.all(
    Array.from(deductions.entries()).map(([ingredientId, { current, needed }]) =>
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { quantity: Math.max(0, current - needed) },
      })
    )
  )
}

async function restoreIngredients(items: OrderStockItem[]) {
  if (!items || items.length === 0) return
  const menuItemIds = items.map((i) => i.menuItemId)

  const recipes = await prisma.recipe.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: true },
  })
  if (recipes.length === 0) return

  const restorations = new Map<string, number>()
  for (const recipe of recipes) {
    const cancelledItem = items.find((i) => i.menuItemId === recipe.menuItemId)
    if (!cancelledItem) continue
    const toRestore = recipe.quantity * cancelledItem.quantity
    restorations.set(recipe.ingredientId, (restorations.get(recipe.ingredientId) || 0) + toRestore)
  }

  await Promise.all(
    Array.from(restorations.entries()).map(([ingredientId, restoreQty]) =>
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { quantity: { increment: restoreQty } },
      })
    )
  )
}
