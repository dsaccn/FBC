import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

const MERGED_ORDER_ID = 'cmvkwf3ai000apxhxzunrct4h'
const DELIVERY_TABLE_ID = 'tbl_static_delivery'

// One-time recovery endpoint — moves delivery items back from merged Table 10 order
// GET /api/system/recover-delivery
export async function GET() {
  try {
    const merged = await prisma.order.findUnique({
      where: { id: MERGED_ORDER_ID },
      include: {
        orderItems: {
          where: { status: { not: 'CANCELLED' } },
          include: { menuItem: { select: { name: true, price: true } } }
        }
      }
    })

    if (!merged) {
      return NextResponse.json({ message: 'Merged order not found — may already be recovered. Refresh Orders page.' })
    }

    const deliveryItems = merged.orderItems.filter(i => i.notes && i.notes.includes('👤'))

    if (deliveryItems.length === 0) {
      return NextResponse.json({ message: 'No delivery items found on this order — already recovered.' })
    }

    // Group items by embedded #HHMM-xxx order key
    const groups = new Map<string, typeof deliveryItems>()
    for (const item of deliveryItems) {
      const match = item.notes?.match(/#(\d{4}-\d{3})/)
      const key = match ? match[1] : 'ungrouped'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }

    const restored: { name: string; items: number; total: number }[] = []

    for (const [, items] of groups) {
      const newOrder = await prisma.order.create({
        data: {
          tableId: DELIVERY_TABLE_ID,
          waiterId: merged.waiterId,
          status: 'OPEN',
          pendingSync: true,
        }
      })

      for (const item of items) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { orderId: newOrder.id, pendingSync: true }
        })
      }

      const total = items.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
      const nameMatch = items[0].notes?.match(/👤\s*([^|\\]]+)/)
      restored.push({ name: nameMatch?.[1]?.trim() ?? 'unknown', items: items.length, total })
    }

    // Clear merge group flags
    await prisma.table.updateMany({
      where: { OR: [{ id: DELIVERY_TABLE_ID }, { number: '10' }] },
      data: { mergeGroupId: null, mergeGroupLabel: null, mergedWithId: null }
    })

    // Delete empty shell delivery orders left over from the merge
    await prisma.order.deleteMany({
      where: { tableId: DELIVERY_TABLE_ID, status: 'OPEN', orderItems: { none: {} } }
    })

    backgroundSync()

    return NextResponse.json({
      success: true,
      message: `Restored ${restored.length} delivery orders. Refresh the Orders page.`,
      restored
    })
  } catch (err) {
    console.error('[recover-delivery]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
