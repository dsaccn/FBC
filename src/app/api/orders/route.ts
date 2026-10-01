import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

// Helper: deduct ingredient stock for a list of ordered items
async function deductIngredients(items: { menuItemId: string; quantity: number }[]) {
  for (const item of items) {
    const recipes = await prisma.recipe.findMany({
      where: { menuItemId: item.menuItemId },
      include: { ingredient: true },
    })
    for (const recipe of recipes) {
      const needed = recipe.quantity * item.quantity
      const newQty = Math.max(0, recipe.ingredient.quantity - needed)
      await prisma.ingredient.update({
        where: { id: recipe.ingredientId },
        data: { quantity: newQty },
      })
    }
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    const status = searchParams.get('status')

    const orders = await prisma.order.findMany({
      where: {
        ...(tableId && { tableId }),
        ...(status && { status }),
      },
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

    // Deduct drink bottle stock from Bar (respects unit linking)
    for (const item of order.orderItems) {
      if (item.menuItem.category?.type === 'DRINK') {
        const fullItem = await prisma.menuItem.findUnique({
          where: { id: item.menuItemId },
          include: { parentItem: true },
        })
        if (!fullItem) continue

        if (fullItem.parentItemId && fullItem.parentItem) {
          // Linked item (e.g. Jambo): deduct from parent's bar stock using multiplier
          const deductQty = Math.round(item.quantity * fullItem.unitMultiplier * 100) / 100
          const parentCurrent = fullItem.parentItem as any
          const newBarQty = Math.max(0, (parentCurrent.barQuantity ?? 0) - deductQty)
          await prisma.menuItem.update({
            where: { id: fullItem.parentItemId },
            data: { barQuantity: newBarQty },
          })
        } else {
          // Normal item: deduct from its own bar stock. If bar empty, deduct from store.
          if (fullItem.barQuantity >= item.quantity) {
            await prisma.menuItem.update({
              where: { id: item.menuItemId },
              data: { barQuantity: { decrement: item.quantity } },
            })
          } else {
            // Bar is empty or insufficient — deduct from store stock directly
            const remaining = item.quantity - fullItem.barQuantity
            await prisma.menuItem.update({
              where: { id: item.menuItemId },
              data: {
                barQuantity: 0,
                stockQuantity: { decrement: remaining },
              },
            })
          }
        }
      }
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
