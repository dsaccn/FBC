import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function GET() {
  const tables = await prisma.table.findMany({
    where: {
      id: { not: '__archived_orders_table__' },
      number: { not: 'Archived' },
      status: { not: 'ARCHIVED' },
    },
  })
  
  // Self-heal: check if table status is out of sync with actual open orders
  for (const table of tables) {
    const openOrder = await prisma.order.findFirst({
      where: { tableId: table.id, status: 'OPEN' },
    })

    if (!openOrder && table.status !== 'FREE') {
      // Table is marked occupied/waiting but has no open orders -> Reset to FREE
      await prisma.table.update({
        where: { id: table.id },
        data: { status: 'FREE' },
      })
      table.status = 'FREE'
    } else if (openOrder && table.status === 'FREE') {
      // Table is marked FREE but has an open order -> Mark as OCCUPIED
      await prisma.table.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED' },
      })
      table.status = 'OCCUPIED'
    }
  }
  
  // Sort tables naturally (e.g. 1, 2, 3... 10, 11 instead of 1, 10, 11, 2)
  tables.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' }))
  
  return NextResponse.json(tables)
}

export async function POST(req: Request) {
  const { number } = await req.json()
  const table = await prisma.table.create({ data: { number, pendingSync: true } })
  backgroundSync()
  return NextResponse.json(table)
}
