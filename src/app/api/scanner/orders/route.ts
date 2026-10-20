import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isScannerAuthorized } from '@/lib/scanner-auth'
import { pullFromCloud, startBackgroundPullLoop } from '@/lib/sync-engine'
import { getPaymentSettings } from '@/lib/payment-settings'

export const dynamic = 'force-dynamic'

let lastPullTime = 0
let pullPromise: Promise<any> | null = null

// Start server-side auto-pull background loop on local machine
if (typeof process !== 'undefined' && !process.env.VERCEL) {
  startBackgroundPullLoop(10000)
}

async function ensureFreshPull() {
  if (process.env.VERCEL) return
  startBackgroundPullLoop(10000)

  const now = Date.now()
  if (now - lastPullTime < 5000) return
  lastPullTime = now

  if (!pullPromise) {
    pullPromise = pullFromCloud().catch(err => {
      console.warn('[GET /api/scanner/orders] auto pull error:', err?.message || err)
    }).finally(() => {
      pullPromise = null
    })
  }

  // Allow up to 1000ms for fast cloud pull so response gets latest orders,
  // without stalling the scanner UI if network is slow.
  await Promise.race([
    pullPromise,
    new Promise(res => setTimeout(res, 1000))
  ])
}

export async function GET(req: Request) {
  try {
    // Check if the device is an authorized scanner device or active POS session
    const authorized = await isScannerAuthorized(req)
    if (!authorized) {
      // Return empty list to internet strangers without exposing error details
      return NextResponse.json({ success: true, orders: [], restricted: true })
    }

    // Ensure local SQLite is up to date with cloud orders
    await ensureFreshPull()

    const orders = await prisma.order.findMany({
      where: { status: 'OPEN' },
      include: {
        table: true,
        orderItems: {
          select: { id: true, quantity: true, notes: true, status: true, menuItem: { select: { price: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = orders.map(order => {
      const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
      const subtotal = activeItems.reduce((acc, i) => acc + (i.menuItem?.price || 0) * i.quantity, 0)
      
      const rawNumber = order.table?.number || '?'
      const lower = rawNumber.toLowerCase()
      const isDelivery = lower.includes('deliv')
      const isTakeaway = lower.includes('take')
      
      let displayTitle = order.table?.mergeGroupLabel ? `Table ${order.table.mergeGroupLabel}` : `Table ${rawNumber}`

      if (isDelivery || isTakeaway) {
        let cleanName = ''
        for (const item of order.orderItems) {
          if (item.notes) {
            const metaMatch = item.notes.match(/\[(.*?)\]/)
            if (metaMatch) {
              const parts = metaMatch[1].split('|').map((s: string) => s.trim())
              for (const part of parts) {
                if (part.startsWith('👤') && !cleanName) cleanName = part.replace('👤', '').trim()
              }
            }
          }
        }
        if (isDelivery) {
          displayTitle = cleanName ? `${cleanName} (Delivery)` : 'Delivery'
        } else {
          displayTitle = cleanName ? `${cleanName} (Takeaway)` : 'Takeaway'
        }
      }

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

    const paymentSettings = await getPaymentSettings().catch(() => ({
      telebirrReceiverPhone: '',
      cbeReceiverAccount: '',
      merchantName: 'Kogna Coffee'
    }))

    return NextResponse.json(
      {
        success: true,
        orders: formatted,
        settings: {
          telebirrReceiverPhone: paymentSettings.telebirrReceiverPhone || '',
          cbeReceiverAccount: paymentSettings.cbeReceiverAccount || '',
          merchantName: paymentSettings.merchantName || 'Kogna Coffee'
        }
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (err: any) {
    console.error('[GET /api/scanner/orders]', err)
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 })
  }
}
