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
    const neonUrl = process.env.NEON_DATABASE_URL

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

    return NextResponse.json({
      totalPending,
      breakdown: {
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
    backgroundSync()

    await logDevAction({
      action: 'SYNC',
      targetTable: 'ALL',
      reason: 'Triggered manual full push/pull sync from developer portal',
    })

    return NextResponse.json({
      success: true,
      message: 'Full sync cycle initiated successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[POST /api/system/sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
