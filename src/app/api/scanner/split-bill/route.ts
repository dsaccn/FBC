import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isScannerAuthorized } from '@/lib/scanner-auth'
import { backgroundSync } from '@/lib/sync-engine'

// POST /api/scanner/split-bill
// Evenly splits one OPEN order into `ways` separate orders so each person can pay independently.
// Items are distributed as evenly as possible (remainder items go to earlier splits).
// Body: { orderId: string, ways: number }   (ways: 2–8)
export async function POST(req: Request) {
  try {
    const authorized = await isScannerAuthorized(req)
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { orderId, ways } = await req.json()

    if (!orderId || !ways || ways < 2 || ways > 8) {
      return NextResponse.json({ error: 'orderId and ways (2–8) required' }, { status: 400 })
    }

    const original = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true,
        waiter: { select: { id: true } },
        orderItems: {
          where: { status: { not: 'CANCELLED' } },
          include: { menuItem: { select: { id: true, price: true } } },
        },
      },
    })

    if (!original) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (original.status !== 'OPEN') return NextResponse.json({ error: 'Order is not open' }, { status: 400 })
    if (original.orderItems.length === 0) return NextResponse.json({ error: 'Order has no items' }, { status: 400 })

    const isOfflineLocal = !process.env.VERCEL

    // Build per-split item lists: distribute each item's quantity as evenly as possible
    const splitItems: { menuItemId: string; quantity: number; notes: string | null }[][] =
      Array.from({ length: ways }, () => [])

    for (const item of original.orderItems) {
      const base = Math.floor(item.quantity / ways)
      const remainder = item.quantity % ways
      for (let i = 0; i < ways; i++) {
        const qty = base + (i < remainder ? 1 : 0)
        if (qty > 0) {
          splitItems[i].push({
            menuItemId: item.menuItemId,
            quantity: qty,
            notes: item.notes ?? null,
          })
        }
      }
    }

    const tableLabel = original.table?.number ?? '?'
    const newOrders: { id: string; label: string }[] = []

    for (let i = 0; i < ways; i++) {
      if (splitItems[i].length === 0) continue
      const created = await prisma.order.create({
        data: {
          tableId: original.tableId,
          waiterId: original.waiterId,
          pendingSync: isOfflineLocal,
          orderItems: { create: splitItems[i].map(it => ({ ...it, pendingSync: isOfflineLocal })) },
        },
      })
      newOrders.push({ id: created.id, label: `Table ${tableLabel} · ${i + 1}/${ways}` })
    }

    if (newOrders.length === 0) {
      return NextResponse.json({ error: 'No items could be distributed' }, { status: 400 })
    }

    // Cancel original order
    await prisma.orderItem.updateMany({
      where: { orderId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    })
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', pendingSync: isOfflineLocal },
    })

    backgroundSync()
    return NextResponse.json({ success: true, orders: newOrders })
  } catch (err) {
    console.error('[POST /api/scanner/split-bill]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
