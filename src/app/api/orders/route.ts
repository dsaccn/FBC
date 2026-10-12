import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import { deductOrderStock } from '@/lib/stock'


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateWhere: Record<string, Date> = {}
    if (from) {
      const d = new Date(from + 'T00:00:00')
      dateWhere.gte = isNaN(d.getTime()) ? new Date(from) : d
    }
    if (to) {
      const d = new Date(to + 'T23:59:59.999')
      dateWhere.lte = isNaN(d.getTime()) ? new Date(to) : d
    }

    const whereClause: any = {}
    if (tableId) {
      const queriedTable = await prisma.table.findUnique({ where: { id: tableId } }).catch(() => null)
      if (queriedTable?.mergeGroupId) {
        const groupTables = await prisma.table.findMany({
          where: { mergeGroupId: queriedTable.mergeGroupId },
          select: { id: true },
        })
        whereClause.tableId = { in: groupTables.map(t => t.id) }
      } else if (queriedTable?.mergedWithId) {
        whereClause.tableId = { in: [tableId, queriedTable.mergedWithId] }
      } else {
        const childTables = await prisma.table.findMany({
          where: { mergedWithId: tableId },
          select: { id: true },
        })
        if (childTables.length > 0) {
          whereClause.tableId = { in: [tableId, ...childTables.map(t => t.id)] }
        } else {
          whereClause.tableId = tableId
        }
      }
    }

    if (status === 'OPEN') {
      whereClause.status = 'OPEN'
    } else if (status === 'PAID' || status === 'CANCELLED') {
      whereClause.status = status
      if (from || to) whereClause.createdAt = dateWhere
    } else {
      if (from || to) {
        whereClause.OR = [
          { status: 'OPEN' },
          { createdAt: dateWhere }
        ]
      }
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: {
          include: { menuItem: { include: { category: true } }, cancellation: true },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(orders)
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { tableId, waiterId: clientWaiterId, items } = await req.json()

    if (!tableId || !clientWaiterId || !items?.length) {
      return NextResponse.json({ error: 'Missing tableId, waiterId, or items' }, { status: 400 })
    }

    // Resolve the waiter from local DB — the client sends session.id (from JWT),
    // but if a sync replaced the local user record the JWT id may be stale.
    // We look up by id first, then fall back to session username, so we always
    // get the canonical local id before creating the order.
    let waiter = await prisma.user.findUnique({ where: { id: clientWaiterId } })

    if (!waiter) {
      // JWT id is stale — look up by username from the session cookie
      const { getSession } = await import('@/lib/session')
      const session = await getSession()
      if (session?.username) {
        waiter = await prisma.user.findUnique({ where: { username: session.username } })
      }
    }

    if (!waiter) {
      return NextResponse.json(
        { error: 'Your login session is outdated. Please log out and log in again.' },
        { status: 401 }
      )
    }

    const waiterId = waiter.id   // always use the authoritative local id

    const isOfflineLocal = !process.env.VERCEL

    // If requested table is a merged child, anchor the order to the host table
    const targetTableRecord = await prisma.table.findUnique({ where: { id: tableId } }).catch(() => null)
    const effectiveTableId = targetTableRecord?.mergedWithId || tableId

    const order = await prisma.order.create({
      data: {
        tableId: effectiveTableId,
        waiterId,
        pendingSync: isOfflineLocal,
        orderItems: {
          create: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes || null,
            pendingSync: isOfflineLocal,
          })),
        },
      },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true } },
        orderItems: { include: { menuItem: { include: { category: true } } } },
      },
    })

    // Update table status to OCCUPIED for all tables in the merge group
    const clusterIds = [effectiveTableId]
    if (targetTableRecord?.mergeGroupId) {
      const groupTables = await prisma.table.findMany({
        where: { mergeGroupId: targetTableRecord.mergeGroupId },
        select: { id: true },
      })
      groupTables.forEach(gt => { if (!clusterIds.includes(gt.id)) clusterIds.push(gt.id) })
    } else {
      const childTables = await prisma.table.findMany({
        where: { mergedWithId: effectiveTableId },
        select: { id: true },
      })
      childTables.forEach(ct => { if (!clusterIds.includes(ct.id)) clusterIds.push(ct.id) })
    }

    await prisma.table.updateMany({
      where: { id: { in: clusterIds } },
      data: { status: 'OCCUPIED' },
    })

    // Also update Neon if running locally
    if (isOfflineLocal) {
      try {
        const url = process.env.NEON_DATABASE_URL
        if (url) {
          const { Pool } = await import('pg')
          const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 })
          await pool.query(
            `UPDATE "Table" SET status = 'OCCUPIED' WHERE id = ANY($1)`,
            [clusterIds]
          ).catch(() => {})
          await pool.end().catch(() => {})
        }
      } catch {}
    }

    // Deduct stock for food, drinks, and recipe ingredients
    await deductOrderStock(items)

    // Kick off a background sync to Neon immediately (non-blocking)
    backgroundSync()

    return NextResponse.json(order)
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
