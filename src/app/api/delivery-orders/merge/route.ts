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

/** Extract the customer name from the first item note that has a [👤Name] tag */
function extractNameFromItems(items: { notes: string | null }[]): string {
  for (const item of items) {
    if (!item.notes) continue
    const metaMatch = item.notes.match(/\[(.*?)\]/)
    if (!metaMatch) continue
    for (const part of metaMatch[1].split('|').map(s => s.trim())) {
      if (part.startsWith('👤')) return part.replace('👤', '').trim()
    }
  }
  return ''
}

/**
 * Rewrite the [👤Name | ...] tag in the first item note that has one.
 * Returns the item id that was updated, or null if none found.
 */
async function setCombinedName(primaryOrderId: string, combinedName: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId: primaryOrderId },
    orderBy: { createdAt: 'asc' },
  })
  for (const item of items) {
    if (!item.notes) continue
    if (!/\[.*👤/.test(item.notes)) continue
    const newNotes = item.notes.replace(/(👤)[^|^\]]+/, `$1${combinedName} `)
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { notes: newNotes, pendingSync: true },
    })
    return item.id
  }
  return null
}

/**
 * POST /api/delivery-orders/merge
 * Moves all items from secondary orders into the primary order,
 * combines customer names (e.g. "JJ + QQ"), cancels secondary orders.
 * Body: { primaryOrderId: string, mergeOrderIds: string[] }
 */
export async function POST(req: Request) {
  try {
    const { primaryOrderId, mergeOrderIds } = await req.json()

    if (!primaryOrderId || !Array.isArray(mergeOrderIds) || mergeOrderIds.length === 0) {
      return NextResponse.json({ error: 'primaryOrderId and mergeOrderIds[] are required' }, { status: 400 })
    }

    // Load all orders with items
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
      return NextResponse.json({
        error: `Orders must be OPEN to merge. Not open: ${notOpen.map(o => o.id).join(', ')}`,
      }, { status: 400 })
    }

    // Collect all customer names before moving items
    const primaryOrder = orders.find(o => o.id === primaryOrderId)!
    const primaryName = extractNameFromItems(primaryOrder.orderItems)
    const secondaryNames = mergeOrderIds.map(id => {
      const o = orders.find(x => x.id === id)!
      return extractNameFromItems(o.orderItems)
    }).filter(Boolean)

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
      await prisma.order.update({
        where: { id: mergeId },
        data: { status: 'CANCELLED', pendingSync: true },
      })
    }

    // Rewrite the name tag to show all names: "JJ + QQ"
    const allNames = [primaryName, ...secondaryNames].filter(Boolean)
    if (allNames.length > 1) {
      await setCombinedName(primaryOrderId, allNames.join(' + '))
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
