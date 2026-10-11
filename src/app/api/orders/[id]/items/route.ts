import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import { deductOrderStock } from '@/lib/stock'

// Mark items as printed
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { itemIds } = await req.json()
    await prisma.orderItem.updateMany({
      where: { id: { in: itemIds } },
      // Mark as pendingSync so print status is pushed to cloud on next sync (offline local only)
      data: { status: 'PRINTED', printedAt: new Date(), pendingSync: !process.env.VERCEL },
    })

    // Trigger background sync to Neon
    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/orders/[id]/items]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Add more items to an existing order
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { items } = await req.json()

    if (!items?.length) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const isOfflineLocal = !process.env.VERCEL

    // Create new order items — mark as pendingSync so they're pushed to Neon (offline local only)
    await prisma.orderItem.createMany({
      data: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
        orderId: id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes || null,
        pendingSync: isOfflineLocal,
      })),
    })

    // Re-flag the parent order as pendingSync so the sync engine re-pushes
    // its updated state (status, updatedAt) and discovers the new items.
    await prisma.order.update({
      where: { id },
      data: { pendingSync: isOfflineLocal },
    })
    // Deduct stock for food, drinks, and recipe ingredients
    await deductOrderStock(items)

    // Trigger background sync to Neon
    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/orders/[id]/items]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
