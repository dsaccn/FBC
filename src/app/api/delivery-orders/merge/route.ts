import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

const ORDER_INCLUDE = {
  table: true,
  waiter: { select: { id: true, fullName: true } },
  payment: true,
  orderItems: {
    include: { menuItem: { select: { id: true, name: true, price: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

/**
 * POST /api/delivery-orders/merge
 * Moves all items from secondary orders into the primary order,
 * cancels the secondary orders, returns the merged primary order.
 * Body: { primaryOrderId: string, mergeOrderIds: string[] }
 */
export async function POST(req: Request) {
  try {
    const { primaryOrderId, mergeOrderIds } = await req.json()

    if (!primaryOrderId || !Array.isArray(mergeOrderIds) || mergeOrderIds.length === 0) {
      return NextResponse.json({ error: 'primaryOrderId and mergeOrderIds[] are required' }, { status: 400 })
    }

    // Validate all orders exist and are OPEN
    const allIds = [primaryOrderId, ...mergeOrderIds]
    const orders = await prisma.order.findMany({
      where: { id: { in: allIds } },
      include: { orderItems: true },
    })

    if (orders.length !== allIds.length) {
      return NextResponse.json({ error: 'One or more orders not found' }, { status: 404 })
    }

    const notOpen = orders.filter(o => o.status !== 'OPEN')
    if (notOpen.length > 0) {
      return NextResponse.json({ error: `Orders must be OPEN to merge. These are not: ${notOpen.map(o => o.id).join(', ')}` }, { status: 400 })
    }

    // Move all items from secondary orders to the primary order
    for (const mergeId of mergeOrderIds) {
      const mergeOrder = orders.find(o => o.id === mergeId)!
      const itemIds = mergeOrder.orderItems.map(i => i.id)

      if (itemIds.length > 0) {
        await prisma.orderItem.updateMany({
          where: { id: { in: itemIds } },
          data: { orderId: primaryOrderId, pendingSync: true },
        })
      }

      // Cancel the now-empty secondary order
      await prisma.order.update({
        where: { id: mergeId },
        data: { status: 'CANCELLED', pendingSync: true },
      })
    }

    // Mark primary order as updated
    const merged = await prisma.order.update({
      where: { id: primaryOrderId },
      data: { pendingSync: true },
      include: ORDER_INCLUDE,
    })

    backgroundSync()

    return NextResponse.json({ success: true, order: merged })
  } catch (err: any) {
    console.error('[POST /api/delivery-orders/merge]', err)
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
