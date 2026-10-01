import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { password, ...rest } = await req.json()
  const data: Record<string, unknown> = { ...rest }
  if (password) data.passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, fullName: true, role: true, phone: true, active: true },
  })
  return NextResponse.json(user)
}

import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // 1. Delete ShiftLogs for this user
    await prisma.shiftLog.deleteMany({ where: { userId: id } })

    // 2. Delete Cancellations where this user was the manager
    await prisma.cancellation.deleteMany({ where: { managerId: id } })

    // 3. Delete Payments where this user was cashier
    await prisma.payment.deleteMany({ where: { cashierId: id } })

    // 4. Delete all orders (and their items/cancellations/payments) where this user was the waiter
    const userOrders = await prisma.order.findMany({ where: { waiterId: id }, select: { id: true } })
    if (userOrders.length > 0) {
      const orderIds = userOrders.map(o => o.id)
      await prisma.cancellation.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } })
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    }

    // 5. Finally delete the user
    await prisma.user.delete({ where: { id } })

    // Cloud deletion
    await deleteFromCloud(`DELETE FROM "ShiftLog" WHERE "userId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Cancellation" WHERE "managerId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Payment" WHERE "cashierId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Cancellation" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1))`, [id])
    await deleteFromCloud(`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1)`, [id])
    await deleteFromCloud(`DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "waiterId" = $1)`, [id])
    await deleteFromCloud(`DELETE FROM "Order" WHERE "waiterId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "User" WHERE id = $1`, [id])

    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/staff/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
