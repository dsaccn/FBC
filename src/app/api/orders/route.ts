import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

// Helper: deduct ingredient stock for a list of ordered items (batched, not N+1)
async function deductIngredients(items: { menuItemId: string; quantity: number }[]) {
  if (items.length === 0) return
  const menuItemIds = items.map((i) => i.menuItemId)

  // Single query to fetch all relevant recipes
  const recipes = await prisma.recipe.findMany({
    where: { menuItemId: { in: menuItemIds } },
    include: { ingredient: true },
  })

  // Aggregate deductions per ingredient
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

  // Apply all updates in parallel
  await Promise.all(
    Array.from(deductions.entries()).map(([ingredientId, { current, needed }]) =>
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { quantity: Math.max(0, current - needed) },
      })
    )
  )
}


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateWhere: Record<string, Date> = {}
    if (from) {
      const d = new Date(from + 'T00:00:00')
      dateWhere.gte = isNaN(d.getTime()) ? new Date(from) : d
    }
    if (to) {
      const d = new Date(to + 'T23:59:59.999')
      dateWhere.lte = isNaN(d.getTime()) ? new Date(to) : d
    }

    const whereClause: any = {}
    if (tableId) whereClause.tableId = tableId

    if (status === 'OPEN') {
      whereClause.status = 'OPEN'
    } else if (status === 'PAID' || status === 'CANCELLED') {
      whereClause.status = status
      if (from || to) whereClause.createdAt = dateWhere
    } else {
      if (from || to) {
        whereClause.OR = [
          { status: 'OPEN' },
          { createdAt: dateWhere }
        ]
      }
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: {
          include: { menuItem: { include: { category: true } }, cancellation: true },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(orders)
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { tableId, waiterId: clientWaiterId, items } = await req.json()

    if (!tableId || !clientWaiterId || !items?.length) {
      return NextResponse.json({ error: 'Missing tableId, waiterId, or items' }, { status: 400 })
    }

    // Resolve the waiter from local DB — the client sends session.id (from JWT),
    // but if a sync replaced the local user record the JWT id may be stale.
    // We look up by id first, then fall back to session username, so we always
    // get the canonical local id before creating the order.
    let waiter = await prisma.user.findUnique({ where: { id: clientWaiterId } })

    if (!waiter) {
      // JWT id is stale — look up by username from the session cookie
      const { getSession } = await import('@/lib/session')
      const session = await getSession()
      if (session?.username) {
        waiter = await prisma.user.findUnique({ where: { username: session.username } })
      }
    }

    if (!waiter) {
      return NextResponse.json(
        { error: 'Your login session is outdated. Please log out and log in again.' },
        { status: 401 }
      )
    }

    const waiterId = waiter.id   // always use the authoritative local id

    // Create order with items — mark both order + items as pendingSync so
    // they are pushed to Neon on the next background sync cycle.
    const order = await prisma.order.create({
      data: {
        tableId,
        waiterId,
        pendingSync: true,
        orderItems: {
          create: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes || null,
            pendingSync: true,
          })),
        },
      },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true } },
        orderItems: { include: { menuItem: { include: { category: true } } } },
      },
    })

    // Update table status to OCCUPIED
    await prisma.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } })

    // Deduct drink bottle stock from Bar (respects unit linking) — batched
    const drinkItems = order.orderItems.filter((item) => item.menuItem.category?.type === 'DRINK')
    if (drinkItems.length > 0) {
      const drinkMenuItemIds = drinkItems.map((item) => item.menuItemId)
      const fullDrinkItems = await prisma.menuItem.findMany({
        where: { id: { in: drinkMenuItemIds } },
        include: { parentItem: true },
      })
      const fullDrinkMap = new Map(fullDrinkItems.map((fi) => [fi.id, fi]))

      await Promise.all(
        drinkItems.map((item) => {
          const fullItem = fullDrinkMap.get(item.menuItemId)
          if (!fullItem) return Promise.resolve()

          if (fullItem.parentItemId && fullItem.parentItem) {
            // Linked item (e.g. Jambo): deduct from parent's bar stock using multiplier
            const deductQty = Math.round(item.quantity * fullItem.unitMultiplier * 100) / 100
            const parentCurrent = fullItem.parentItem as any
            const newBarQty = Math.max(0, (parentCurrent.barQuantity ?? 0) - deductQty)
            return prisma.menuItem.update({
              where: { id: fullItem.parentItemId },
              data: { barQuantity: newBarQty },
            })
          } else {
            // Normal item: deduct from its own bar stock. If bar empty, deduct from store.
            if (fullItem.barQuantity >= item.quantity) {
              return prisma.menuItem.update({
                where: { id: item.menuItemId },
                data: { barQuantity: { decrement: item.quantity } },
              })
            } else {
              const remaining = item.quantity - fullItem.barQuantity
              return prisma.menuItem.update({
                where: { id: item.menuItemId },
                data: { barQuantity: 0, stockQuantity: { decrement: remaining } },
              })
            }
          }
        })
      )
    }

    // Deduct ingredient stock based on recipes
    await deductIngredients(items)

    // Kick off a background sync to Neon immediately (non-blocking)
    backgroundSync()

    return NextResponse.json(order)
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
