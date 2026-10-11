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
    if (tableId) whereClause.tableId = tableId

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
    const order = await prisma.order.create({
      data: {
        tableId,
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

    // Update table status to OCCUPIED
    await prisma.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } })

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
