import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { orderId, cashierId, amount, method, discount, discountType, isComplimentary, notes } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // 1. Verify order exists in the database
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true, payment: true },
    })

    if (!order) {
      return NextResponse.json({ error: `Order not found (${orderId})` }, { status: 404 })
    }

    // 2. If order already has a payment, return it idempotently instead of throwing a unique constraint error
    if (order.payment) {
      return NextResponse.json(order.payment)
    }

    // 3. Resolve cashierId to a valid user in the User table
    // (Prevents foreign key constraint violations when logged in via standalone AbebeCredential / master_root)
    let validCashierId = cashierId
    const existingCashier = validCashierId
      ? await prisma.user.findUnique({ where: { id: validCashierId } }).catch(() => null)
      : null

    if (!existingCashier) {
      const fallbackUser = await prisma.user.findFirst({
        where: { active: true },
        orderBy: { role: 'asc' }, // ADMIN, CASHIER, MANAGER
      }).catch(() => null)

      if (fallbackUser) {
        validCashierId = fallbackUser.id
      } else {
        const sysAdmin = await prisma.user.upsert({
          where: { username: 'admin' },
          update: { active: true },
          create: {
            username: 'admin',
            fullName: 'Administrator',
            role: 'ADMIN',
            passwordHash: '$2a$10$Dt4qsePOVyLnjvkUMY1Hgen5mhPQnOLCKlgiMYikgMNzQTt9Y0ETe',
            active: true,
          },
        }).catch(() => null)
        validCashierId = sysAdmin?.id || 'master_root'
      }
    }

    const isOfflineLocal = !process.env.VERCEL

    // 4. Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        cashierId: validCashierId,
        amount: Number(amount) || 0,
        method: method || 'Cash',
        discount: Number(discount) || 0,
        discountType: discountType || 'fixed',
        isComplimentary: Boolean(isComplimentary),
        notes: notes || null,
        pendingSync: isOfflineLocal,
      },
      include: { order: { include: { table: true } } },
    })

    // 5. Mark order as PAID
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID', pendingSync: isOfflineLocal },
    }).catch(() => {})

    // 6. Free up physical floor table if not delivery/takeaway
    const tableId = order.tableId
    if (tableId && tableId !== 'tbl_static_delivery' && tableId !== 'tbl_static_takeaway') {
      await prisma.table.updateMany({
        where: {
          OR: [
            { id: tableId },
            { mergedWithId: tableId },
          ],
        },
        data: { status: 'FREE', mergedWithId: null, pendingSync: isOfflineLocal },
      }).catch(() => {})

      // Sync table status directly to Neon Cloud PostgreSQL if running offline local
      if (isOfflineLocal) {
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 })
            await pool.query(
              `UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL WHERE id = $1 OR "mergedWithId" = $1`,
              [tableId]
            ).catch(() => {})
            await pool.end().catch(() => {})
          }
        } catch {}
      }
    }

    // 7. Trigger background sync to Neon (only in offline local mode)
    backgroundSync()

    return NextResponse.json(payment)
  } catch (error: any) {
    console.error('[POST /api/payments error]:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to process payment' },
      { status: 500 }
    )
  }
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
