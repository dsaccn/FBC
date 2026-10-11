import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logDevAction } from '@/lib/dev-audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [
      users,
      categories,
      menuItems,
      tables,
      orders,
      orderItems,
      payments,
      cancellations,
      ingredients,
      recipes,
      inventoryLogs,
      shiftLogs,
      staffMembers,
      staffMenuItems,
      staffIngredients,
      staffRecipes,
      staffMeals,
      staffMealItems,
      devAuditLogs,
    ] = await Promise.all([
      prisma.user.findMany().catch(() => []),
      prisma.category.findMany().catch(() => []),
      prisma.menuItem.findMany().catch(() => []),
      prisma.table.findMany().catch(() => []),
      prisma.order.findMany().catch(() => []),
      prisma.orderItem.findMany().catch(() => []),
      prisma.payment.findMany().catch(() => []),
      prisma.cancellation.findMany().catch(() => []),
      prisma.ingredient.findMany().catch(() => []),
      prisma.recipe.findMany().catch(() => []),
      prisma.inventoryLog.findMany().catch(() => []),
      prisma.shiftLog.findMany().catch(() => []),
      prisma.staffMember.findMany().catch(() => []),
      prisma.staffMenuItem.findMany().catch(() => []),
      prisma.staffIngredient.findMany().catch(() => []),
      prisma.staffRecipe.findMany().catch(() => []),
      prisma.staffMeal.findMany().catch(() => []),
      prisma.staffMealItem.findMany().catch(() => []),
      prisma.devAuditLog.findMany({ take: 500, orderBy: { timestamp: 'desc' } }).catch(() => []),
    ])

    const backupPayload = {
      meta: {
        system: 'Kogna Coffee POS',
        exportedAt: new Date().toISOString(),
        exportedBy: session.username,
        version: '1.0.0',
      },
      tables: {
        User: users,
        Category: categories,
        MenuItem: menuItems,
        Table: tables,
        Order: orders,
        OrderItem: orderItems,
        Payment: payments,
        Cancellation: cancellations,
        Ingredient: ingredients,
        Recipe: recipes,
        InventoryLog: inventoryLogs,
        ShiftLog: shiftLogs,
        StaffMember: staffMembers,
        StaffMenuItem: staffMenuItems,
        StaffIngredient: staffIngredients,
        StaffRecipe: staffRecipes,
        StaffMeal: staffMeals,
        StaffMealItem: staffMealItems,
        DevAuditLog: devAuditLogs,
      },
    }

    await logDevAction({
      action: 'SYNC',
      targetTable: 'ALL',
      reason: 'Generated full database JSON backup export',
    })

    const jsonString = JSON.stringify(backupPayload, null, 2)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `kogna-backup-${timestamp}.json`

    return new Response(jsonString, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('[GET /api/system/backup]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
