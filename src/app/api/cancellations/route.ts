import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import { restoreOrderStock } from '@/lib/stock'

// Cancel an order item (requires manager approval)
export async function POST(req: Request) {
  const { orderItemId, managerId, reason, cancelQuantity } = await req.json()
  const isOfflineLocal = !process.env.VERCEL

  // Verify Manager / Admin Authorization
  const { getSession } = await import('@/lib/session')
  const session = await getSession()

  const targetManagerId = (session?.role === 'ADMIN' || session?.role === 'MANAGER') ? session.id : managerId
  if (!targetManagerId) {
    return NextResponse.json({ error: 'Manager authorization is required to cancel items' }, { status: 403 })
  }

  const managerUser = await prisma.user.findFirst({
    where: {
      id: targetManagerId,
      active: true,
      role: { in: ['ADMIN', 'MANAGER'] },
    },
  })

  if (!managerUser) {
    return NextResponse.json({ error: 'Unauthorized: Cancellation requires an active manager or administrator account' }, { status: 403 })
  }

  const authorizedManagerId = managerUser.id

  const orderItem = await prisma.orderItem.findUnique({ where: { id: orderItemId } })
  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  let cancelledItemId = orderItemId


  const qtyToCancel = cancelQuantity && cancelQuantity > 0 ? Number(cancelQuantity) : orderItem.quantity

  if (qtyToCancel < orderItem.quantity) {
    // Partial cancellation: reduce original quantity, create a new cancelled item
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { quantity: orderItem.quantity - qtyToCancel },
    })
    const newCancelledItem = await prisma.orderItem.create({
      data: {
        orderId: orderItem.orderId,
        menuItemId: orderItem.menuItemId,
        quantity: qtyToCancel,
        notes: orderItem.notes,
        status: 'CANCELLED',
        pendingSync: isOfflineLocal,  // push this split item to cloud only if offline local
      }
    })
    cancelledItemId = newCancelledItem.id
  } else {
    // Full cancellation
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: 'CANCELLED' },
    })
  }

  // Restore inventory stock for the cancelled item (food, drinks, and ingredients)
  await restoreOrderStock([{ menuItemId: orderItem.menuItemId, quantity: qtyToCancel }])

  // Log cancellation
  const cancellation = await prisma.cancellation.create({
    data: { orderItemId: cancelledItemId, managerId: authorizedManagerId, reason: reason || 'Cancelled by manager', pendingSync: isOfflineLocal },

    include: {
      orderItem: { include: { menuItem: true } },
      manager: { select: { fullName: true } },
    },
  })

  // Check if all items in the order are now cancelled — if so, free the table
  const allItems = await prisma.orderItem.findMany({ where: { orderId: orderItem.orderId } })
  const hasActiveItems = allItems.some(i => i.status !== 'CANCELLED')

  if (!hasActiveItems) {
    // Cancel the order and free the table
    const order = await prisma.order.update({
      where: { id: orderItem.orderId },
      data: { status: 'CANCELLED', pendingSync: isOfflineLocal },
    })
    await prisma.table.update({
      where: { id: order.tableId },
      data: { status: 'FREE' },
    })
  }

  // Trigger background sync to Neon
  backgroundSync()

  return NextResponse.json(cancellation)

}

export async function GET() {
  const cancellations = await prisma.cancellation.findMany({
    include: {
      orderItem: { include: { menuItem: true, order: { include: { table: true, waiter: { select: { fullName: true } } } } } },
      manager: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cancellations)
}
