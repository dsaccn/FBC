import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isScannerAuthorized } from '@/lib/scanner-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    // Check if the device is an authorized scanner device or active POS session
    const authorized = await isScannerAuthorized(req)
    if (!authorized) {
      // Return empty list to internet strangers without exposing error details
      return NextResponse.json({ success: true, orders: [], restricted: true })
    }

    const orders = await prisma.order.findMany({
      where: { status: 'OPEN' },
      include: {
        table: true,
        orderItems: {
          select: { id: true, quantity: true, status: true, menuItem: { select: { price: true } } },
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

      // Data Minimization: Strictly anonymous table and bill data only.
      // Customer payer names, phone numbers, waiter names, and specific food items are NOT exposed.
      return {
        id: order.id,
        tableId: order.tableId,
        displayTitle,
        isDelivery,
        isTakeaway,
        createdAt: order.createdAt,
        subtotal,
        total: subtotal,
        itemsCount: activeItems.reduce((acc, i) => acc + i.quantity, 0),
        isVerified: Boolean(order.verifiedRef),
        verifiedRef: order.verifiedRef || null,
        verifiedProvider: order.verifiedProvider || null,
        verifiedAmount: order.verifiedAmount || null,
        verifiedAt: order.verifiedAt || null,
      }
    })

    return NextResponse.json({ success: true, orders: formatted })
  } catch (err: any) {
    console.error('[GET /api/scanner/orders]', err)
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 })
  }
}

