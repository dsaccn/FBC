import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, pushMenuItemStockToCloud } from '@/lib/sync-engine'

export async function POST(req: Request) {
  try {
    const { menuItemId, quantity } = await req.json()

    if (!menuItemId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid transfer details' }, { status: 400 })
    }

    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.stockQuantity < quantity) {
      return NextResponse.json({ error: 'Insufficient stock in store' }, { status: 400 })
    }

    // Deduct from store, add to bar
    const updated = await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        stockQuantity: { decrement: quantity },
        barQuantity: { increment: quantity },
      },
    })

    // Log the transfer
    const session = await getSession()
    await prisma.inventoryLog.create({
      data: {
        itemName: item.name,
        type: 'STORE',
        action: 'TRANSFER',
        quantity,
        prevQty: item.stockQuantity,
        newQty: item.stockQuantity - quantity,
        userName: session?.fullName ?? 'Unknown',
      },
    })

    await pushMenuItemStockToCloud(menuItemId, updated.stockQuantity, updated.barQuantity)
    backgroundSync()

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[POST /api/inventory/transfer]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
