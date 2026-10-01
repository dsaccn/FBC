import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function POST(req: Request) {
  const { orderId, cashierId, amount, method, discount, discountType, isComplimentary, notes } = await req.json()

  // Create payment
  const payment = await prisma.payment.create({
    data: { orderId, cashierId, amount, method, discount: discount || 0, discountType: discountType || 'fixed', isComplimentary: isComplimentary || false, notes, pendingSync: true },
    include: { order: { include: { table: true } } },
  })

  // Mark order as PAID and flag it for push to cloud (pendingSync=true prevents
  // the next pullFromCloud from reverting the status back to OPEN before the push
  // has had a chance to sync the PAID status to Neon)
  await prisma.order.update({ where: { id: orderId }, data: { status: 'PAID', pendingSync: true } })

  // Free up the table
  await prisma.table.update({ where: { id: payment.order.tableId }, data: { status: 'FREE' } })

  // Trigger background sync to Neon
  backgroundSync()

  return NextResponse.json(payment)
}

export async function GET() {
  const payments = await prisma.payment.findMany({
    include: {
      order: { include: { table: true, waiter: { select: { fullName: true } }, orderItems: { include: { menuItem: true } } } },
      cashier: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(payments)
}
