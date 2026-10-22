import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import { getSession } from '@/lib/session'
import { deductOrderStock } from '@/lib/stock'
import { parseDateFilter } from '@/lib/date-utils'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type') // 'DELIVERY' | 'TAKEAWAY' | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const tz = searchParams.get('tz')

    const dateWhere = parseDateFilter(from, to, tz)

    const whereClause: any = {}
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

    const allOrders = await prisma.order.findMany({
      where: whereClause,
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: {
          include: { menuItem: { include: { category: true } }, cancellation: true },
        },
        payment: {
          include: { cashier: { select: { fullName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter to only Delivery and Takeaway orders based on table number
    const deliveryOrders = allOrders.filter(o => {
      const num = (o.table?.number || '').toLowerCase()
      const isDlv = num.startsWith('delivery')
      const isTak = num.startsWith('takeaway')
      
      if (!isDlv && !isTak) return false
      if (type === 'DELIVERY') return isDlv
      if (type === 'TAKEAWAY') return isTak
      return true
    })

    return NextResponse.json(deliveryOrders)
  } catch (err) {
    console.error('[GET /api/delivery-orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { orderId, items } = body

    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item required' }, { status: 400 })
    }

    const isOfflineLocal = !process.env.VERCEL

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        orderItems: {
          create: items.map((item: { menuItemId: string; quantity: number; notes?: string }) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes?.trim() || null,
            pendingSync: isOfflineLocal,
          })),
        },
      },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: { include: { menuItem: { include: { category: true } } } },
      },
    })

    await deductOrderStock(items)
    backgroundSync()

    return NextResponse.json(updatedOrder)
  } catch (err) {
    console.error('[PATCH /api/delivery-orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderType, orderName, phone, address, deliveryNotes, items } = body

    if (!orderName || !orderName.trim()) {
      return NextResponse.json({ error: 'Order name / customer name is required' }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item must be ordered' }, { status: 400 })
    }

    // Resolve waiter / server from session
    const session = await getSession()
    const waiterId = body.waiterId || session?.id

    let waiter = waiterId ? await prisma.user.findUnique({ where: { id: waiterId } }) : null
    if (!waiter && session?.username) {
      waiter = await prisma.user.findUnique({ where: { username: session.username } })
    }

    if (!waiter) {
      // Fallback: pick any active user so the order can still be taken
      waiter = await prisma.user.findFirst({ where: { active: true } })
    }

    if (!waiter) {
      return NextResponse.json({ error: 'No active staff user found to assign order' }, { status: 400 })
    }

    const isTakeaway = (orderType || 'DELIVERY').toUpperCase() === 'TAKEAWAY'
    const typePrefix = isTakeaway ? 'Takeaway' : 'Delivery'
    const staticId = isTakeaway ? 'tbl_static_takeaway' : 'tbl_static_delivery'
    const cleanName = orderName.trim()
    const cleanPhone = phone ? phone.trim() : ''
    const shortSeq = Math.floor(100 + Math.random() * 900) // e.g. 482
    const timeCode = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '')

    // Use permanent static table (zero table pollution)
    let table = await prisma.table.findUnique({ where: { number: typePrefix } })
    const isOfflineLocal = !process.env.VERCEL

    if (!table) {
      table = await prisma.table.upsert({
        where: { id: staticId },
        update: { number: typePrefix },
        create: {
          id: staticId,
          number: typePrefix,
          status: 'FREE',
          pendingSync: isOfflineLocal,
        },
      })
    }

    // Prepare metadata note: embeds customer name, phone, address, instructions, and order code
    const metaPrefix = [
      cleanName ? `👤 ${cleanName}` : '',
      cleanPhone ? `📞 ${cleanPhone}` : '',
      address?.trim() ? `📍 ${address.trim()}` : '',
      deliveryNotes?.trim() ? `📝 ${deliveryNotes.trim()}` : '',
      `#${timeCode}-${shortSeq}`,
    ].filter(Boolean).join(' | ')

    // Create the order with all items
    const order = await prisma.order.create({
      data: {
        tableId: table.id,
        waiterId: waiter.id,
        pendingSync: isOfflineLocal,
        orderItems: {
          create: items.map((item: { menuItemId: string; quantity: number; notes?: string }, idx: number) => {
            let combinedNote = item.notes ? item.notes.trim() : ''
            // Attach customer / address / delivery notes to the first item for persistent storage
            if (idx === 0 && metaPrefix) {
              combinedNote = combinedNote ? `[${metaPrefix}] ${combinedNote}` : `[${metaPrefix}]`
            }
            return {
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              notes: combinedNote || null,
              pendingSync: isOfflineLocal,
            }
          }),
        },
      },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: {
          include: { menuItem: { include: { category: true } } },
        },
      },
    })

    // Deduct stock for food, drinks, and recipe ingredients
    await deductOrderStock(items)

    // Trigger background sync to Neon
    backgroundSync()

    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    console.error('[POST /api/delivery-orders]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
