import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync } from '@/lib/sync-engine'
import { logDevAction } from '@/lib/dev-audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 1. Gather pending counts across tables
    const [
      pendingOrders,
      pendingOrderItems,
      pendingPayments,
      pendingCancellations,
      pendingInventoryLogs,
      pendingStaffMeals,
      pendingStaffMealItems,
      pendingStaffMembers,
      pendingStaffMenuItems,
      pendingStaffIngredients,
      pendingStaffRecipes,
      pendingTables,
    ] = await Promise.all([
      prisma.order.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.orderItem.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.payment.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.cancellation.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.inventoryLog.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffMeal.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffMealItem.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffMember.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffMenuItem.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffIngredient.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.staffRecipe.count({ where: { pendingSync: true } }).catch(() => 0),
      prisma.table.count({ where: { pendingSync: true } }).catch(() => 0),
    ])

    const totalPending =
      pendingOrders +
      pendingOrderItems +
      pendingPayments +
      pendingCancellations +
      pendingInventoryLogs +
      pendingStaffMeals +
      pendingStaffMealItems +
      pendingStaffMembers +
      pendingStaffMenuItems +
      pendingStaffIngredients +
      pendingStaffRecipes +
      pendingTables

    // 2. Test Neon cloud database connectivity and latency
    let cloudStatus = 'DISCONNECTED'
    let cloudLatencyMs = null
    const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL

    if (neonUrl) {
      try {
        const { Pool } = require('pg')
        const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 5000 })
        const start = Date.now()
        await pool.query('SELECT 1')
        cloudLatencyMs = Date.now() - start
        cloudStatus = 'CONNECTED'
        await pool.end()
      } catch (err: any) {
        cloudStatus = 'ERROR: ' + (err.message || 'Connection failed')
      }
    } else {
      cloudStatus = 'NO_NEON_URL_CONFIGURED'
    }

    const isCloud = Boolean(process.env.VERCEL)
    if (isCloud) {
      // Running directly on Neon Cloud: auto-heal any legacy stray pendingSync flags
      await prisma.$executeRawUnsafe(`
        UPDATE "Order" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "OrderItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Payment" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Table" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Cancellation" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "InventoryLog" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMeal" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMealItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMember" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMenuItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffIngredient" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffRecipe" SET "pendingSync" = false WHERE "pendingSync" = true;
      `).catch(() => {})
    }

    return NextResponse.json({
      isCloud,
      totalPending: isCloud ? 0 : totalPending,
      breakdown: isCloud
        ? { orders: 0, orderItems: 0, payments: 0, cancellations: 0, inventoryLogs: 0, tables: 0, staffMeals: 0, staffCatalog: 0 }
        : {
            orders: pendingOrders,
            orderItems: pendingOrderItems,
            payments: pendingPayments,
            cancellations: pendingCancellations,
            inventoryLogs: pendingInventoryLogs,
            tables: pendingTables,
            staffMeals: pendingStaffMeals + pendingStaffMealItems,
            staffCatalog: pendingStaffMembers + pendingStaffMenuItems + pendingStaffIngredients + pendingStaffRecipes,
          },
      cloud: {
        status: cloudStatus,
        latencyMs: cloudLatencyMs,
        provider: 'AWS Neon PostgreSQL Serverless',
      },
    })
  } catch (err: any) {
    console.error('[GET /api/system/sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const isCloud = Boolean(process.env.VERCEL)

    if (isCloud) {
      // Running directly on Neon Cloud: flush/reconcile any pendingSync flags
      await prisma.$executeRawUnsafe(`
        UPDATE "Order" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "OrderItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Payment" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Table" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "Cancellation" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "InventoryLog" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMeal" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMealItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMember" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffMenuItem" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffIngredient" SET "pendingSync" = false WHERE "pendingSync" = true;
        UPDATE "StaffRecipe" SET "pendingSync" = false WHERE "pendingSync" = true;
      `).catch(() => {})

      await logDevAction({
        action: 'SYNC',
        targetTable: 'ALL',
        reason: 'Reconciled cloud database state on Vercel/Neon',
      })

      return NextResponse.json({
        success: true,
        message: 'Cloud state reconciled: All records are synced and live.',
        isCloud: true,
        timestamp: new Date().toISOString(),
      })
    }

    backgroundSync()

    await logDevAction({
      action: 'SYNC',
      targetTable: 'ALL',
      reason: 'Triggered manual full push/pull sync from developer portal',
    })

    return NextResponse.json({
      success: true,
      message: 'Full sync cycle initiated successfully',
      isCloud: false,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[POST /api/system/sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
