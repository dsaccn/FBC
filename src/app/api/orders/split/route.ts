import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

// POST /api/orders/split
// Splits one OPEN order into N separate orders (one per person/group).
// Each split order is created directly — bypassing the "append to existing" logic
// in POST /api/orders — so each gets its own ID for independent payment tracking.
// The original order is cancelled once the split orders are created.
//
// Body: {
//   originalOrderId: string,
//   splits: Array<{ label: string, items: Array<{ menuItemId: string, quantity: number, notes?: string }> }>
// }
export async function POST(req: Request) {
  try {
    const { originalOrderId, splits } = await req.json()

    if (!originalOrderId || !Array.isArray(splits) || splits.length < 2) {
      return NextResponse.json({ error: 'Need originalOrderId and at least 2 splits' }, { status: 400 })
    }

    const original = await prisma.order.findUnique({
      where: { id: originalOrderId },
      include: { table: true, waiter: { select: { id: true, fullName: true } } },
    })

    if (!original) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (original.status !== 'OPEN') return NextResponse.json({ error: 'Order is not open' }, { status: 400 })

    const isOfflineLocal = !process.env.VERCEL
    const newOrders: { id: string; label: string; total: number }[] = []

    for (const split of splits) {
      if (!split.items?.length) continue

      const created = await prisma.order.create({
        data: {
          tableId: original.tableId,
          waiterId: original.waiterId,
          pendingSync: isOfflineLocal,
          orderItems: {
            create: split.items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              notes: item.notes || null,
              pendingSync: isOfflineLocal,
            })),
          },
        },
        include: {
          orderItems: { include: { menuItem: { select: { price: true } } } },
        },
      })

      const total = created.orderItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
      newOrders.push({ id: created.id, label: split.label, total })
    }

    if (newOrders.length === 0) {
      return NextResponse.json({ error: 'No items in any split' }, { status: 400 })
    }

    // Cancel all items and the original order
    await prisma.orderItem.updateMany({
      where: { orderId: originalOrderId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    })
    await prisma.order.update({
      where: { id: originalOrderId },
      data: { status: 'CANCELLED', pendingSync: isOfflineLocal },
    })

    backgroundSync()

    return NextResponse.json({ orders: newOrders })
  } catch (err) {
    console.error('[POST /api/orders/split]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
