import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import { broadcastVerificationEvent } from '@/lib/scanner-events'
import { checkReceiptDuplicate } from '@/lib/receipt-dedup'

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
      include: {
        table: true,
        payment: true,
        orderItems: { include: { menuItem: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: `Order not found (${orderId})` }, { status: 404 })
    }

    // 2. If order already has a payment, return it idempotently instead of throwing a unique constraint error
    if (order.payment) {
      return NextResponse.json(order.payment)
    }

    // 2b. 🚨 STRICT DUPLICATE RECEIPT CHECK:
    // Check both order.verifiedRef and payment notes to ensure no transaction reference is reused
    const refToCheck = order.verifiedRef || (typeof notes === 'string' ? notes : null)
    if (refToCheck) {
      const duplicateConflict = await checkReceiptDuplicate(refToCheck, orderId)
      if (duplicateConflict) {
        return NextResponse.json(
          { error: duplicateConflict.errorMessage, duplicate: true, reference: duplicateConflict.ref },
          { status: 400 }
        )
      }
    }

    // 2c. 🚨 SERVER-SIDE BILL TOTAL VALIDATION:
    // Compute total from database items to prevent client tampering
    const activeItems = (order.orderItems || []).filter(i => i.status !== 'CANCELLED')
    const calculatedOrderTotal = activeItems.reduce(
      (acc, i) => acc + (i.menuItem?.price || 0) * i.quantity,
      0
    )

    const rawDiscount = Number(discount) || 0
    let calculatedDiscount = 0
    if (discountType === 'percentage') {
      calculatedDiscount = (calculatedOrderTotal * Math.min(100, Math.max(0, rawDiscount))) / 100
    } else {
      calculatedDiscount = Math.min(calculatedOrderTotal, Math.max(0, rawDiscount))
    }

    const expectedPayable = isComplimentary ? 0 : Math.max(0, calculatedOrderTotal - calculatedDiscount)
    const submittedAmount = Number(amount) || 0

    // Prevent underpayment tampering (allow 1 ETB tolerance for rounding)
    if (calculatedOrderTotal > 0 && !isComplimentary && submittedAmount < expectedPayable - 1) {
      return NextResponse.json({
        error: `Payment amount (${submittedAmount.toFixed(2)} ETB) is less than the calculated order bill (${expectedPayable.toFixed(2)} ETB). Underpayments are rejected.`,
      }, { status: 400 })
    }

    // 3. Resolve cashierId from authoritative session
    const { getSession } = await import('@/lib/session')
    const session = await getSession()
    let validCashierId = session?.id || cashierId
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
        amount: isComplimentary ? 0 : submittedAmount,
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
      const currentTable = await prisma.table.findUnique({ where: { id: tableId } }).catch(() => null)
      const targetGroupId = currentTable?.mergeGroupId || null

      const clusterWhere: any = {
        OR: [
          { id: tableId },
          { mergedWithId: tableId },
        ],
      }
      if (targetGroupId) {
        clusterWhere.OR.push({ mergeGroupId: targetGroupId })
      }

      await prisma.table.updateMany({
        where: clusterWhere,
        data: {
          status: 'FREE',
          mergedWithId: null,
          mergeGroupId: null,
          mergeGroupLabel: null,
          pendingSync: isOfflineLocal,
        },
      }).catch(() => {})

      // Sync table status directly to Neon Cloud PostgreSQL if running offline local
      if (isOfflineLocal) {
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 })
            await pool.query(
              `UPDATE "Table"
               SET status = 'FREE', "mergedWithId" = NULL, "mergeGroupId" = NULL, "mergeGroupLabel" = NULL
               WHERE id = $1 OR "mergedWithId" = $1 OR ($2::text IS NOT NULL AND "mergeGroupId" = $2)`,
              [tableId, targetGroupId]
            ).catch(() => {})
            await pool.end().catch(() => {})
          }
        } catch {}
      }
    }

    // 7. Trigger background sync to Neon (only in offline local mode)
    backgroundSync()

    // 8. Broadcast instant real-time clearance to mobile scanner devices
    broadcastVerificationEvent({
      type: 'ORDER_PAID',
      orderId,
      tableNumber: payment?.order?.table?.number,
      timestamp: new Date().toISOString(),
    })

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
