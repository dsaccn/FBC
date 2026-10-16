import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'OPEN' },
      include: {
        table: true,
        waiter: { select: { id: true, fullName: true, username: true } },
        orderItems: {
          include: { menuItem: { select: { id: true, name: true, price: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = orders.map(order => {
      const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
      const subtotal = activeItems.reduce((acc, i) => acc + (i.menuItem?.price || 0) * i.quantity, 0)
      
      const rawNumber = order.table?.number || '?'
      const isDelivery = rawNumber.startsWith('DELIV-') || rawNumber.startsWith('DELIVERY-')
      const isTakeaway = rawNumber.startsWith('TAKE-') || rawNumber.startsWith('TAKEAWAY-')
      
      let displayTitle = order.table?.mergeGroupLabel || `Table ${rawNumber}`
      if (isDelivery) displayTitle = `Delivery #${rawNumber.replace(/^(DELIV|DELIVERY)-/, '')}`
      if (isTakeaway) displayTitle = `Takeaway #${rawNumber.replace(/^(TAKE|TAKEAWAY)-/, '')}`

      const itemsSummary = activeItems.map(i => `${i.quantity}x ${i.menuItem?.name || 'Item'}`).join(', ')

      return {
        id: order.id,
        tableId: order.tableId,
        displayTitle,
        isDelivery,
        isTakeaway,
        waiterName: order.waiter?.fullName || 'Waiter',
        createdAt: order.createdAt,
        subtotal,
        total: subtotal,
        itemsCount: activeItems.reduce((acc, i) => acc + i.quantity, 0),
        itemsSummary: itemsSummary || 'No items',
        isVerified: Boolean(order.verifiedRef),
        verifiedRef: order.verifiedRef || null,
        verifiedProvider: order.verifiedProvider || null,
        verifiedAmount: order.verifiedAmount || null,
        verifiedPayer: order.verifiedPayer || null,
        verifiedReceiver: order.verifiedReceiver || null,
        verifiedAt: order.verifiedAt || null,
      }
    })

    return NextResponse.json({ success: true, orders: formatted })
  } catch (err: any) {
    console.error('[GET /api/scanner/orders]', err)
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 })
  }
}
