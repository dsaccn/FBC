import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logDevAction } from '@/lib/dev-audit'
import { backgroundSync } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body.mode === 'all' ? 'all' : 'transactions' // default to clearing transactions
    const reason = body.reason?.trim() || `System reset: ${mode}`

    const results: Record<string, number> = {}

    // ── Helper to execute SQL on Neon directly if offline or configured ──────
    const neonUrl = process.env.NEON_DATABASE_URL
    const runOnNeon = async (sql: string, params: any[] = []) => {
      if (!neonUrl) return
      try {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } })
        await pool.query(sql, params)
        await pool.end().catch(() => {})
      } catch (err: any) {
        console.warn('[RESET] Neon query warning:', err?.message)
      }
    }

    // ── 1. Clear Transactional Data ──────────────────────────────────────────
    // Order of deletion matters: Cancellations -> Payments -> OrderItems -> Orders

    // Cancellations
    const cancellations = await prisma.cancellation.deleteMany({})
    results.cancellations = cancellations.count
    await runOnNeon('DELETE FROM "Cancellation"')

    // Payments
    const payments = await prisma.payment.deleteMany({})
    results.payments = payments.count
    await runOnNeon('DELETE FROM "Payment"')

    // OrderItems
    const orderItems = await prisma.orderItem.deleteMany({})
    results.orderItems = orderItems.count
    await runOnNeon('DELETE FROM "OrderItem"')

    // Orders
    const orders = await prisma.order.deleteMany({})
    results.orders = orders.count
    await runOnNeon('DELETE FROM "Order"')

    // ShiftLogs
    const shiftLogs = await prisma.shiftLog.deleteMany({})
    results.shiftLogs = shiftLogs.count
    await runOnNeon('DELETE FROM "ShiftLog"')

    // InventoryLogs
    const invLogs = await prisma.inventoryLog.deleteMany({})
    results.inventoryLogs = invLogs.count
    await runOnNeon('DELETE FROM "InventoryLog"')

    // WasteLogs
    const wasteLogs = await prisma.wasteLog.deleteMany({})
    results.wasteLogs = wasteLogs.count
    await runOnNeon('DELETE FROM "WasteLog"')

    // StaffMealItems & StaffMeals
    const staffMealItems = await prisma.staffMealItem.deleteMany({})
    results.staffMealItems = staffMealItems.count
    await runOnNeon('DELETE FROM "StaffMealItem"')

    const staffMeals = await prisma.staffMeal.deleteMany({})
    results.staffMeals = staffMeals.count
    await runOnNeon('DELETE FROM "StaffMeal"')

    // Reset Tables: remove virtual tables & reset physical tables to FREE
    await prisma.table.deleteMany({
      where: {
        OR: [
          { number: { startsWith: 'Delivery:' } },
          { number: { startsWith: 'Takeaway:' } },
          { number: { startsWith: 'DLV-' } },
          { number: 'Archived' },
        ]
      }
    }).catch(() => {})

    await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null,
      }
    })

    await runOnNeon(`
      DELETE FROM "Table" WHERE number LIKE 'Delivery:%' OR number LIKE 'Takeaway:%' OR number LIKE 'DLV-%' OR number = 'Archived';
      UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL;
    `)

    // ── 2. Full Clean Slate (if mode === 'all') ──────────────────────────────
    if (mode === 'all') {
      const staffRecipes = await prisma.staffRecipe.deleteMany({})
      results.staffRecipes = staffRecipes.count
      await runOnNeon('DELETE FROM "StaffRecipe"')

      const staffMenuItems = await prisma.staffMenuItem.deleteMany({})
      results.staffMenuItems = staffMenuItems.count
      await runOnNeon('DELETE FROM "StaffMenuItem"')

      const staffIngredients = await prisma.staffIngredient.deleteMany({})
      results.staffIngredients = staffIngredients.count
      await runOnNeon('DELETE FROM "StaffIngredient"')

      const recipes = await prisma.recipe.deleteMany({})
      results.recipes = recipes.count
      await runOnNeon('DELETE FROM "Recipe"')

      await prisma.menuItem.updateMany({ data: { parentItemId: null } })
      await runOnNeon('UPDATE "MenuItem" SET "parentItemId" = NULL')

      const menuItems = await prisma.menuItem.deleteMany({})
      results.menuItems = menuItems.count
      await runOnNeon('DELETE FROM "MenuItem"')

      const categories = await prisma.category.deleteMany({})
      results.categories = categories.count
      await runOnNeon('DELETE FROM "Category"')

      const ingredients = await prisma.ingredient.deleteMany({})
      results.ingredients = ingredients.count
      await runOnNeon('DELETE FROM "Ingredient"')
    }

    // Trigger local background sync if running locally to finalize alignment
    if (!process.env.VERCEL) {
      backgroundSync()
    }

    await logDevAction({
      action: 'DELETE',
      targetTable: mode === 'all' ? 'ALL_DATABASE_TABLES' : 'ALL_TRANSACTIONS',
      recordId: `reset_${mode}`,
      reason: `${reason} — cleared ${Object.values(results).reduce((a, b) => a + b, 0)} records`,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({
      success: true,
      mode,
      deletedCounts: results,
      message: mode === 'all'
        ? 'Full system clean slate reset completed successfully across all databases.'
        : 'All transaction, order, and payment data successfully reset to zero across Cloud and Localhost.',
    })
  } catch (err: any) {
    console.error('[POST /api/system/reset]', err)
    return NextResponse.json({ error: err.message || 'System reset failed' }, { status: 500 })
  }
}
