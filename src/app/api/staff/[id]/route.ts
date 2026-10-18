import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { backgroundSync, pushUserToCloud, deleteUserFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { password, ...rest } = await req.json()
    const data: Record<string, unknown> = { ...rest }
    if (password) data.passwordHash = await bcrypt.hash(password, 10)
    
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, fullName: true, role: true, phone: true, active: true },
    })

    // Immediately push update (including active status toggle) to Cloud
    await pushUserToCloud({
      id: user.id,
      username: user.username,
      passwordHash: data.passwordHash as string | undefined,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      active: user.active,
    })

    backgroundSync()

    return NextResponse.json(user)
  } catch (err) {
    console.error('[PATCH /api/staff/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // 0. Find existing user to get username for precise cross-database deletion
    const existingUser = await prisma.user.findUnique({ where: { id } })
    const username = existingUser?.username

    // 1. Delete ShiftLogs for this user locally
    await prisma.shiftLog.deleteMany({ where: { userId: id } })

    // 2. Delete Cancellations where this user was the manager locally
    await prisma.cancellation.deleteMany({ where: { managerId: id } })

    // 3. Delete Payments where this user was cashier locally
    await prisma.payment.deleteMany({ where: { cashierId: id } })

    // 4. Delete all orders (and their items/cancellations/payments) where this user was the waiter locally
    const userOrders = await prisma.order.findMany({ where: { waiterId: id }, select: { id: true } })
    if (userOrders.length > 0) {
      const orderIds = userOrders.map(o => o.id)
      await prisma.cancellation.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } })
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } })
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    }

    // 5. Delete the user from SQLite
    await prisma.user.delete({ where: { id } })

    // 6. Delete the user and cascading relations from Cloud (Neon) by ID AND username
    await deleteUserFromCloud(id, username)

    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/staff/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
