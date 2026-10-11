import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function GET() {
  // Fetch dine-in tables and open dine-in order tableIds in parallel — 2 queries instead of 2N+1
  const [allTables, openOrders] = await Promise.all([
    prisma.table.findMany({
      where: {
        id: { notIn: ['__archived_orders_table__', 'tbl_static_delivery', 'tbl_static_takeaway'] },
        status: { not: 'ARCHIVED' },
      },
    }),
    prisma.order.findMany({
      where: { status: 'OPEN' },
      select: { tableId: true },
    }),
  ])

  // Filter out any delivery, takeaway, or system tables so only actual floor tables remain
  const tables = allTables.filter((t) => {
    const num = (t.number || '').trim().toLowerCase()
    return (
      num !== 'archived' &&
      num !== 'delivery' &&
      num !== 'takeaway' &&
      !num.startsWith('delivery') &&
      !num.startsWith('takeaway') &&
      !num.startsWith('dlv')
    )
  })

  const occupiedTableIds = new Set(openOrders.map((o) => o.tableId))

  // Determine which dine-in tables need status correction
  const toFree: string[] = []
  const toOccupied: string[] = []

  for (const table of tables) {
    const hasOpen = occupiedTableIds.has(table.id)
    if (!hasOpen && table.status !== 'FREE') {
      toFree.push(table.id)
      table.status = 'FREE'
    } else if (hasOpen && table.status === 'FREE') {
      toOccupied.push(table.id)
      table.status = 'OCCUPIED'
    }
  }

  // Bulk-update in at most 2 queries (instead of one per table)
  await Promise.all([
    toFree.length > 0
      ? prisma.table.updateMany({ where: { id: { in: toFree } }, data: { status: 'FREE' } })
      : Promise.resolve(),
    toOccupied.length > 0
      ? prisma.table.updateMany({ where: { id: { in: toOccupied } }, data: { status: 'OCCUPIED' } })
      : Promise.resolve(),
  ])

  // Sort tables naturally (e.g. 1, 2, 3… 10, 11 instead of 1, 10, 11, 2)
  tables.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' }))

  return NextResponse.json(tables)
}

export async function POST(req: Request) {
  const { number } = await req.json()
  const table = await prisma.table.create({ data: { number, pendingSync: !process.env.VERCEL } })
  backgroundSync()
  return NextResponse.json(table)
}
