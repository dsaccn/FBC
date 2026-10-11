import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const issues: any[] = []

    // 1. Check for Orphan Orders (Orders with 0 OrderItems)
    const ordersWithZeroItems = await prisma.order.findMany({
      where: {
        orderItems: { none: {} },
      },
      select: { id: true, tableId: true, status: true, createdAt: true },
    })

    for (const ord of ordersWithZeroItems) {
      issues.push({
        severity: 'HIGH',
        category: 'ORPHAN_ORDER',
        title: `Order #${ord.id.slice(-6)} has 0 items`,
        description: `Order status is '${ord.status}' on table '${ord.tableId}' but contains zero items.`,
        recordId: ord.id,
        table: 'Order',
      })
    }

    // 2. Check for Table Status Discrepancies (Table marked FREE but has OPEN orders)
    const tablesMarkedFreeWithOpenOrders = await prisma.table.findMany({
      where: {
        status: 'FREE',
        orders: { some: { status: 'OPEN' } },
      },
      select: { id: true, number: true },
    })

    for (const tbl of tablesMarkedFreeWithOpenOrders) {
      issues.push({
        severity: 'HIGH',
        category: 'TABLE_STATUS_DISCREPANCY',
        title: `Table ${tbl.number} marked FREE but has OPEN order`,
        description: `Table is displayed as vacant on floor plan but has unpaid dining orders open.`,
        recordId: tbl.id,
        table: 'Table',
      })
    }

    // 3. Check for Negative Stock on MenuItems
    const negativeMenuItems = await prisma.menuItem.findMany({
      where: {
        OR: [{ stockQuantity: { lt: 0 } }, { barQuantity: { lt: 0 } }],
      },
      select: { id: true, name: true, stockQuantity: true, barQuantity: true },
    })

    for (const item of negativeMenuItems) {
      issues.push({
        severity: 'MEDIUM',
        category: 'NEGATIVE_STOCK',
        title: `Item '${item.name}' has negative inventory`,
        description: `Store: ${item.stockQuantity}, Bar: ${item.barQuantity}. Orders depleted stock beyond zero.`,
        recordId: item.id,
        table: 'MenuItem',
      })
    }

    // 4. Check for Negative Stock on Ingredients
    const negativeIngredients = await prisma.ingredient.findMany({
      where: { quantity: { lt: 0 } },
      select: { id: true, name: true, quantity: true, unit: true },
    })

    for (const ing of negativeIngredients) {
      issues.push({
        severity: 'MEDIUM',
        category: 'NEGATIVE_STOCK',
        title: `Ingredient '${ing.name}' has negative stock`,
        description: `Stock level is ${ing.quantity} ${ing.unit}. Depletion formulas exceeded available bulk stock.`,
        recordId: ing.id,
        table: 'Ingredient',
      })
    }

    // 5. Check for Bottle/Shot Link Inconsistencies
    const brokenChildUnits = await prisma.menuItem.findMany({
      where: {
        parentItemId: { not: null },
        parentItem: null, // parent was deleted or not found
      },
      select: { id: true, name: true, parentItemId: true },
    })

    for (const child of brokenChildUnits) {
      issues.push({
        severity: 'MEDIUM',
        category: 'BROKEN_UNIT_LINK',
        title: `Child unit '${child.name}' points to missing parent bottle`,
        description: `Referenced parent ID '${child.parentItemId}' does not exist in the database.`,
        recordId: child.id,
        table: 'MenuItem',
      })
    }

    // 6. Check for Extreme Discounts or Complimentary Anomalies
    const anomalyPayments = await prisma.payment.findMany({
      where: {
        OR: [
          { isComplimentary: true },
          { discount: { gt: 100 } }, // large flat discount
        ],
      },
      include: { order: true, cashier: { select: { fullName: true } } },
      take: 20,
      orderBy: { createdAt: 'desc' },
    })

    for (const pmt of anomalyPayments) {
      if (pmt.isComplimentary) {
        issues.push({
          severity: 'INFO',
          category: 'COMPLIMENTARY_ORDER',
          title: `Complimentary Order #${pmt.orderId.slice(-6)} (Total: 0 ETB)`,
          description: `Logged by cashier '${pmt.cashier?.fullName || 'Unknown'}' on ${new Date(pmt.createdAt).toLocaleDateString()}. Notes: ${pmt.notes || 'None'}`,
          recordId: pmt.id,
          table: 'Payment',
        })
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      issuesCount: issues.length,
      highSeverityCount: issues.filter(i => i.severity === 'HIGH').length,
      mediumSeverityCount: issues.filter(i => i.severity === 'MEDIUM').length,
      infoCount: issues.filter(i => i.severity === 'INFO').length,
      issues,
    })
  } catch (err: any) {
    console.error('[GET /api/system/integrity]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
