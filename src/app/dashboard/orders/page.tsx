'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Eye,
  RefreshCw,
  Calendar,
  Bike,
  ShoppingBag,
  TrendingUp,
  Wallet,
  Smartphone,
  Clock,
  Printer,
  FileText,
  X,
  Search,
  CheckCircle2,
  DollarSign,
  UtensilsCrossed,
  Receipt,
  Percent,
} from 'lucide-react'
import Portal from '@/components/Portal'
import { printTicketHtml } from '@/lib/printer'

interface OrderItem {
  id: string
  menuItem: { name: string; price: number; category?: { name: string; type: string } | null }
  quantity: number
  notes?: string
  status: string
}

interface Order {
  id: string
  table: { number: string }
  waiter: { fullName: string }
  orderItems: OrderItem[]
  status: string
  createdAt: string
  payment?: {
    id?: string
    amount: number
    method?: string
    discount?: number
    discountType?: string
    notes?: string
    createdAt?: string
  } | null
}

export default function OrdersPage() {
  const searchParams = useSearchParams()
  const tableId = searchParams.get('tableId')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [filter, setFilter] = useState('OPEN')
  const [searchQuery, setSearchQuery] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id?: string; fullName: string; role: string } | null>(null)

  // Fetch current session for cashier report attribution
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) setCurrentUser(data.user)
      })
      .catch(() => {})
  }, [])

  // Helper to format date in local timezone YYYY-MM-DD
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Date filter — default to present local day
  const [dateFrom, setDateFrom] = useState(() => getLocalDateStr())
  const [dateTo, setDateTo] = useState(() => getLocalDateStr())

  // Fetch orders: fetch all statuses for the period so the Sales Summary is always complete
  const load = useCallback(async (isBackground = false) => {
    if (!hasLoadedRef.current && !isBackground) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const params = new URLSearchParams()
      if (tableId) params.set('tableId', tableId)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      params.set('tz', String(new Date().getTimezoneOffset()))

      const res = await fetch(`/api/orders?${params.toString()}`)
      if (res.ok) {
        setOrders(await res.json())
        hasLoadedRef.current = true
      } else {
        console.error('Failed to load orders:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading orders:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [tableId, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // Auto-refresh when sync occurs or periodically every 15s silently
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => {
    const handleCloudPull = () => loadRef.current(true)
    const handleSyncComplete = () => loadRef.current(true)
    window.addEventListener('cloud-pull-complete', handleCloudPull)
    window.addEventListener('sync-complete', handleSyncComplete)
    const interval = setInterval(() => loadRef.current(true), 15000)
    return () => {
      window.removeEventListener('cloud-pull-complete', handleCloudPull)
      window.removeEventListener('sync-complete', handleSyncComplete)
      clearInterval(interval)
    }
  }, [])

  const statusColors: Record<string, string> = {
    OPEN: 'badge-open',
    PAID: 'badge-paid',
    CANCELLED: 'badge-cancelled',
  }

  // Helper: calculate total for an order (using official payment amount when paid, or sum of active items)
  const getOrderTotal = (order: Order) => {
    if (order.status === 'PAID' && order.payment?.amount !== undefined && order.payment?.amount !== null) {
      return order.payment.amount
    }
    return order.orderItems.reduce((sum, item) => {
      if (item.status === 'CANCELLED') return sum
      return sum + (item.menuItem?.price || 0) * (item.quantity || 0)
    }, 0)
  }

  // Parse delivery/takeaway or standard table
  const parseOrderInfo = (tableNumber: string, items?: OrderItem[]) => {
    const lower = (tableNumber || '').toLowerCase()
    const isDelivery = lower.startsWith('delivery')
    const isTakeaway = lower.startsWith('takeaway')

    if (!isDelivery && !isTakeaway) {
      return {
        isSpecial: false,
        type: 'TABLE',
        title: `Table ${tableNumber}`,
        boxLabel: tableNumber,
        phone: null,
      }
    }

    const type = isDelivery ? 'DELIVERY' : 'TAKEAWAY'
    let cleanName = tableNumber.replace(/^(Delivery:|Takeaway:)\s*/i, '').replace(/#.*$/, '').trim()
    let extractedPhone = ''
    const phoneMatch = cleanName.match(/\(([^)]+)\)/)
    if (phoneMatch) {
      extractedPhone = phoneMatch[1]
      cleanName = cleanName.replace(/\([^)]+\)/, '').trim()
    }

    if (!cleanName || cleanName.toLowerCase() === 'delivery' || cleanName.toLowerCase() === 'takeaway') {
      cleanName = ''
    }

    if (items && items[0]?.notes) {
      const metaMatch = items[0].notes.match(/\[(.*?)\]/)
      if (metaMatch) {
        const parts = metaMatch[1].split('|').map((s: string) => s.trim())
        for (const part of parts) {
          if (part.startsWith('👤') && !cleanName) cleanName = part.replace('👤', '').trim()
          if (part.startsWith('📞') && !extractedPhone) extractedPhone = part.replace('📞', '').trim()
        }
      }
    }

    return {
      isSpecial: true,
      type,
      title: cleanName || (isDelivery ? 'Delivery Order' : 'Takeaway Order'),
      boxLabel: isDelivery ? '🛵' : '🥡',
      phone: extractedPhone,
    }
  }

  // Compute Sales Report statistics for Cashiers
  const stats = useMemo(() => {
    let totalPaidRevenue = 0
    let totalCash = 0
    let totalTelebirr = 0
    let totalCbe = 0
    let totalOther = 0
    let cashCount = 0
    let telebirrCount = 0
    let cbeCount = 0
    let otherCount = 0
    let totalDiscounts = 0

    let openTotalValue = 0
    let openCount = 0
    let paidCount = 0
    let cancelledCount = 0

    let dineInRevenue = 0
    let dineInCount = 0
    let takeawayRevenue = 0
    let takeawayCount = 0
    let deliveryRevenue = 0
    let deliveryCount = 0

    const waiterMap: Record<string, { name: string; orders: number; revenue: number }> = {}
    const itemMap: Record<string, { name: string; quantity: number; revenue: number }> = {}

    for (const order of orders) {
      const isPaid = order.status === 'PAID'
      const isOpen = order.status === 'OPEN'
      const isCancelled = order.status === 'CANCELLED'
      const total = getOrderTotal(order)

      const tableLower = (order.table?.number || '').toLowerCase()
      const isDel = tableLower.startsWith('delivery')
      const isTak = tableLower.startsWith('takeaway')

      if (isOpen) {
        openCount++
        openTotalValue += total
      } else if (isCancelled) {
        cancelledCount++
      } else if (isPaid) {
        paidCount++
        totalPaidRevenue += total
        totalDiscounts += order.payment?.discount || 0

        const methodStr = (order.payment?.method || 'Cash').toLowerCase()
        if (methodStr.includes('cash')) {
          totalCash += total
          cashCount++
        } else if (methodStr.includes('telebirr')) {
          totalTelebirr += total
          telebirrCount++
        } else if (methodStr.includes('cbe') || methodStr.includes('bank')) {
          totalCbe += total
          cbeCount++
        } else {
          totalOther += total
          otherCount++
        }

        if (isDel) {
          deliveryCount++
          deliveryRevenue += total
        } else if (isTak) {
          takeawayCount++
          takeawayRevenue += total
        } else {
          dineInCount++
          dineInRevenue += total
        }

        // Waiter performance
        const wName = order.waiter?.fullName || 'Unknown'
        if (!waiterMap[wName]) waiterMap[wName] = { name: wName, orders: 0, revenue: 0 }
        waiterMap[wName].orders++
        waiterMap[wName].revenue += total

        // Items breakdown
        for (const it of order.orderItems) {
          if (it.status !== 'CANCELLED' && it.menuItem) {
            const iName = it.menuItem.name
            if (!itemMap[iName]) itemMap[iName] = { name: iName, quantity: 0, revenue: 0 }
            itemMap[iName].quantity += it.quantity
            itemMap[iName].revenue += it.quantity * it.menuItem.price
          }
        }
      }
    }

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)

    const staffPerformance = Object.values(waiterMap)
      .sort((a, b) => b.revenue - a.revenue)

    return {
      totalPaidRevenue,
      paidCount,
      totalDiscounts,
      totalCash,
      cashCount,
      totalTelebirr,
      telebirrCount,
      totalCbe,
      cbeCount,
      totalOther,
      otherCount,
      openTotalValue,
      openCount,
      cancelledCount,
      totalOrders: orders.length,
      dineInRevenue,
      dineInCount,
      takeawayRevenue,
      takeawayCount,
      deliveryRevenue,
      deliveryCount,
      topItems,
      staffPerformance,
    }
  }, [orders])

  // Filtered and searched orders for display
  const displayedOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Status Filter
      if (filter && order.status !== filter) return false

      // 2. Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const tableNum = (order.table?.number || '').toLowerCase()
        const waiterName = (order.waiter?.fullName || '').toLowerCase()
        const hasItem = order.orderItems.some(i => i.menuItem?.name?.toLowerCase().includes(query))
        const hasNotes = order.orderItems.some(i => i.notes?.toLowerCase().includes(query))
        const orderId = order.id.toLowerCase()
        if (!tableNum.includes(query) && !waiterName.includes(query) && !hasItem && !hasNotes && !orderId.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [orders, filter, searchQuery])

  // Print Cashier Shift Report on Thermal Slip
  const printShiftSummary = () => {
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const dateRangeStr = dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`

    const html = `<html>
      <head>
        <title>Cashier Sales Report</title>
        <style>
          @page { margin: 0; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 12px 14px; font-family: 'Courier New', Courier, monospace; width: 100%; font-size: 13px; color: #000; background: #fff; font-weight: bold; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
          .title { text-align: center; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="title">
          <b style="font-size: 18px; letter-spacing: 2px;">KOGNA COFFEE</b><br/>
          <span style="font-size: 11px;">Addis Ababa, Ethiopia</span><br/>
          <hr/>
          <b style="font-size: 14px;">CASHIER SALES REPORT</b><br/>
          <span style="font-size: 11px;">Period: ${dateRangeStr}</span><br/>
          <span style="font-size: 11px;">Printed: ${now}</span><br/>
          <span style="font-size: 11px;">Cashier: ${currentUser?.fullName || 'Active Shift'}</span>
        </div>
        <hr/>
        <div class="row"><span>TOTAL PAID SALES:</span><span>${stats.totalPaidRevenue.toFixed(2)} ETB</span></div>
        <div class="row"><span>Paid Orders Count:</span><span>${stats.paidCount}</span></div>
        ${stats.totalDiscounts > 0 ? `<div class="row"><span>Total Discounts:</span><span>-${stats.totalDiscounts.toFixed(2)} ETB</span></div>` : ''}
        <hr/>
        <div style="font-size: 12px; margin-bottom: 4px;"><b>PAYMENT BREAKDOWN:</b></div>
        <div class="row"><span>  [CASH] In Drawer:</span><span>${stats.totalCash.toFixed(2)} ETB (${stats.cashCount})</span></div>
        <div class="row"><span>  [TELEBIRR]:</span><span>${stats.totalTelebirr.toFixed(2)} ETB (${stats.telebirrCount})</span></div>
        <div class="row"><span>  [CBE / BANK]:</span><span>${stats.totalCbe.toFixed(2)} ETB (${stats.cbeCount})</span></div>
        ${stats.totalOther > 0 ? `<div class="row"><span>  [OTHER]:</span><span>${stats.totalOther.toFixed(2)} ETB (${stats.otherCount})</span></div>` : ''}
        <hr/>
        <div style="font-size: 12px; margin-bottom: 4px;"><b>ORDER TYPES:</b></div>
        <div class="row"><span>  🍽️ Dine-in:</span><span>${stats.dineInRevenue.toFixed(2)} ETB (${stats.dineInCount})</span></div>
        <div class="row"><span>  🥡 Takeaway:</span><span>${stats.takeawayRevenue.toFixed(2)} ETB (${stats.takeawayCount})</span></div>
        <div class="row"><span>  🛵 Delivery:</span><span>${stats.deliveryRevenue.toFixed(2)} ETB (${stats.deliveryCount})</span></div>
        <hr/>
        <div class="row"><span>OPEN (PENDING):</span><span>${stats.openTotalValue.toFixed(2)} ETB (${stats.openCount})</span></div>
        <div class="row"><span>CANCELLED:</span><span>${stats.cancelledCount} orders</span></div>
        <hr/>
        ${stats.topItems.length > 0 ? `
          <div style="font-size: 12px; margin-bottom: 4px;"><b>TOP ITEMS SOLD:</b></div>
          ${stats.topItems.map(it => `<div class="row"><span>  ${it.name} (x${it.quantity})</span><span>${it.revenue.toFixed(2)} ETB</span></div>`).join('')}
          <hr/>
        ` : ''}
        <div class="title" style="font-size: 10px; color: #555; letter-spacing: 1px; margin-top: 10px;">
          KOGNA POS · SHIFT SUMMARY
        </div>
      </body>
    </html>`

    printTicketHtml(html)
  }

  const isToday = dateFrom === getLocalDateStr() && dateTo === getLocalDateStr()

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px' }}>
      {/* ── Page Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}>
            <span className="gold-text">Orders &amp; Sales</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
            {displayedOrders.length} orders shown · <strong style={{ color: 'var(--gold)' }}>{stats.totalPaidRevenue.toFixed(2)} ETB</strong> paid in selected period
          </p>
        </div>

        {/* Date Filter & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--black-border)',
            borderRadius: '10px',
            padding: '4px 10px',
          }}>
            <Calendar size={14} color="var(--gold)" />
            <input
              type="date"
              className="input"
              style={{ fontSize: '13px', padding: '4px 8px', height: '32px', width: '130px' }}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
            <input
              type="date"
              className="input"
              style={{ fontSize: '13px', padding: '4px 8px', height: '32px', width: '130px' }}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
            {!isToday && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '11px', height: '24px', padding: '0 6px' }}
                onClick={() => {
                  setDateFrom(getLocalDateStr())
                  setDateTo(getLocalDateStr())
                }}
              >
                Today
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', gap: '6px' }}
            onClick={() => setShowReportModal(true)}
            title="View Full Cashier Shift Report & Print"
          >
            <FileText size={14} /> Report
          </button>

          <button className="btn btn-ghost btn-sm" onClick={() => load(false)}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>

          <Link href={`/dashboard/orders/new${tableId ? `?tableId=${tableId}` : ''}`} className="btn btn-gold btn-sm">
            <Plus size={14} /> New Order
          </Link>
        </div>
      </div>

      {/* ── TOP CASHIER SALES SUMMARY REPORT CARDS ─────────────────────────────── */}
      <div style={{
        marginBottom: '22px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
      }}>
        {/* Card 1: Total Paid Sales */}
        <div
          onClick={() => setFilter('PAID')}
          style={{
            cursor: 'pointer',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(180, 138, 30, 0.1) 0%, rgba(180, 138, 30, 0.02) 100%)',
            border: filter === 'PAID' ? '2px solid var(--gold)' : '1px solid rgba(180, 138, 30, 0.35)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
              Total Paid Sales
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(180, 138, 30, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={15} color="var(--gold)" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'Cinzel, serif' }}>
              {stats.totalPaidRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--gold)' }}>ETB</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span><b>{stats.paidCount}</b> orders paid</span>
              <span>·</span>
              <span>Avg {stats.paidCount > 0 ? (stats.totalPaidRevenue / stats.paidCount).toFixed(0) : '0'} ETB</span>
            </div>
          </div>
        </div>

        {/* Card 2: Cash in Drawer */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.09) 0%, rgba(5, 150, 105, 0.02) 100%)',
            border: '1px solid rgba(5, 150, 105, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--success-light)' }}>
              Cash in Drawer
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(5, 150, 105, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={15} color="var(--success-light)" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'Cinzel, serif' }}>
              {stats.totalCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--success-light)' }}>ETB</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span><b>{stats.cashCount}</b> cash orders</span>
              <span>·</span>
              <span>{stats.totalPaidRevenue > 0 ? Math.round((stats.totalCash / stats.totalPaidRevenue) * 100) : 0}% of sales</span>
            </div>
          </div>
        </div>

        {/* Card 3: Digital & Bank Payments */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.09) 0%, rgba(59, 130, 246, 0.02) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#2563eb' }}>
              Digital &amp; Bank
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={15} color="#2563eb" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'Cinzel, serif' }}>
              {(stats.totalTelebirr + stats.totalCbe + stats.totalOther).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#2563eb' }}>ETB</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ color: '#0284c7' }}>📱 Telebirr: <b>{stats.totalTelebirr.toFixed(0)}</b> ({stats.telebirrCount})</span>
              <span>·</span>
              <span style={{ color: '#7c3aed' }}>🏦 CBE: <b>{stats.totalCbe.toFixed(0)}</b> ({stats.cbeCount})</span>
            </div>
          </div>
        </div>

        {/* Card 4: Open Pending Orders */}
        <div
          onClick={() => setFilter('OPEN')}
          style={{
            cursor: 'pointer',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.09) 0%, rgba(217, 119, 6, 0.02) 100%)',
            border: filter === 'OPEN' ? '2px solid var(--warning)' : '1px solid rgba(217, 119, 6, 0.35)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--warning)' }}>
              Open / Unpaid
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(217, 119, 6, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={15} color="var(--warning)" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'Cinzel, serif' }}>
              {stats.openTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--warning)' }}>ETB</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <b>{stats.openCount}</b> open orders waiting for payment
            </div>
          </div>
        </div>
      </div>

      {/* ── FILTER TABS & SEARCH ROW ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {/* Status Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${filter === 'OPEN' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('OPEN')}
          >
            OPEN ({stats.openCount})
          </button>
          <button
            className={`btn btn-sm ${filter === 'PAID' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('PAID')}
          >
            PAID ({stats.paidCount})
          </button>
          <button
            className={`btn btn-sm ${filter === 'CANCELLED' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('CANCELLED')}
          >
            CANCELLED ({stats.cancelledCount})
          </button>
          <button
            className={`btn btn-sm ${filter === '' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('')}
          >
            All ({stats.totalOrders})
          </button>
        </div>

        {/* Search input for cashiers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', maxWidth: '360px', minWidth: '220px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search table, waiter, phone, or item..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '13px', height: '34px', width: '100%' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── ORDERS LIST ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px', color: 'var(--gold)' }} />
          <div>Loading orders &amp; sales data...</div>
        </div>
      ) : displayedOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <p style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)' }}>No orders found</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>
            {searchQuery
              ? `No orders matching "${searchQuery}" in ${filter || 'All'}`
              : `No ${filter || ''} orders recorded for the selected period.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedOrders.map(order => {
            const total = getOrderTotal(order)
            const food = order.orderItems.filter(i => i.menuItem?.category?.type === 'FOOD')
            const drinks = order.orderItems.filter(i => i.menuItem?.category?.type === 'DRINK')
            const info = parseOrderInfo(order.table.number, order.orderItems)

            return (
              <div key={order.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px' }}>
                {/* Visual Identifier Box */}
                <div style={{
                  width: '52px',
                  height: '52px',
                  background: info.isSpecial
                    ? (info.type === 'DELIVERY' ? 'rgba(59,130,246,0.1)' : 'rgba(234,88,12,0.1)')
                    : 'rgba(201,168,76,0.08)',
                  border: info.isSpecial
                    ? (info.type === 'DELIVERY' ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(234,88,12,0.4)')
                    : '1px solid var(--gold-dark)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Cinzel,serif',
                  fontWeight: '700',
                  fontSize: info.isSpecial ? '22px' : '17px',
                  color: 'var(--gold)',
                  flexShrink: 0
                }}>
                  {info.boxLabel}
                </div>

                {/* Order Details */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '15px' }}>{info.title}</span>

                    {info.isSpecial && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: info.type === 'DELIVERY' ? 'rgba(37,99,235,0.08)' : 'rgba(234,88,12,0.08)',
                        color: info.type === 'DELIVERY' ? '#1d4ed8' : '#c2410c',
                        border: `1px solid ${info.type === 'DELIVERY' ? 'rgba(37,99,235,0.25)' : 'rgba(234,88,12,0.25)'}`,
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {info.type === 'DELIVERY' ? <Bike size={11} /> : <ShoppingBag size={11} />}
                        {info.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                      </span>
                    )}

                    {info.phone && (
                      <span style={{ fontSize: '12px', color: 'var(--gold)', background: 'rgba(201,168,76,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                        📞 {info.phone}
                      </span>
                    )}

                    <span className={`badge ${statusColors[order.status] || ''}`}>{order.status}</span>

                    {order.status === 'PAID' && order.payment?.method && (
                      <span style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: order.payment.method.toLowerCase().includes('cash')
                          ? 'rgba(5,150,105,0.1)'
                          : 'rgba(59,130,246,0.1)',
                        color: order.payment.method.toLowerCase().includes('cash')
                          ? 'var(--success-light)'
                          : '#2563eb',
                        border: `1px solid ${order.payment.method.toLowerCase().includes('cash') ? 'rgba(5,150,105,0.25)' : 'rgba(59,130,246,0.25)'}`,
                        fontWeight: '600'
                      }}>
                        {order.payment.method}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Waiter: {order.waiter.fullName} · {new Date(order.createdAt).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Africa/Addis_Ababa'
                    })}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {order.orderItems.length} items {food.length > 0 && `· 🍳 ${food.length} food`} {drinks.length > 0 && `· 🍹 ${drinks.length} drinks`}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gold)' }}>{total.toFixed(2)} ETB</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                    <Link href={`/dashboard/orders/${order.id}`} className="btn btn-outline btn-sm">
                      <Eye size={13} /> View
                    </Link>
                    {order.status === 'OPEN' && (
                      <Link href={`/dashboard/payment?orderId=${order.id}`} className="btn btn-gold btn-sm">
                        Pay
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── CASHIER SHIFT REPORT MODAL (PORTAL) ─────────────────────────────────── */}
      {showReportModal && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
            <div
              className="modal"
              style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--black-border)', paddingBottom: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color="var(--gold)" />
                  <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Cashier Shift &amp; Sales Summary</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px', height: 'auto' }}
                  onClick={() => setShowReportModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Sub-header meta */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--black-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Period: </span>
                  <b>{dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Cashier: </span>
                  <b>{currentUser?.fullName || 'Active Cashier'}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Generated: </span>
                  <b>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Addis_Ababa' })}</b>
                </div>
              </div>

              {/* Summary KPIs in Modal */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(180, 138, 30, 0.08)', border: '1px solid rgba(180, 138, 30, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: '700' }}>TOTAL PAID SALES</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{stats.totalPaidRevenue.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stats.paidCount} orders</div>
                </div>
                <div style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--success-light)', fontWeight: '700' }}>CASH COLLECTED</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{stats.totalCash.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stats.cashCount} orders</div>
                </div>
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>DIGITAL / BANK</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{(stats.totalTelebirr + stats.totalCbe + stats.totalOther).toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stats.telebirrCount + stats.cbeCount + stats.otherCount} orders</div>
                </div>
                <div style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: '700' }}>OPEN (UNPAID)</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{stats.openTotalValue.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stats.openCount} pending</div>
                </div>
              </div>

              {/* Payment Methods Breakdown Table */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Payment Methods Breakdown
                </h4>
                <div style={{ border: '1px solid var(--black-border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--black-border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Method</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Orders</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount (ETB)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600' }}>💵 Cash In Drawer</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{stats.cashCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{stats.totalCash.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {stats.totalPaidRevenue > 0 ? `${Math.round((stats.totalCash / stats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0284c7' }}>📱 Telebirr</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{stats.telebirrCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{stats.totalTelebirr.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {stats.totalPaidRevenue > 0 ? `${Math.round((stats.totalTelebirr / stats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#7c3aed' }}>🏦 CBE / Commercial Bank</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{stats.cbeCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{stats.totalCbe.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {stats.totalPaidRevenue > 0 ? `${Math.round((stats.totalCbe / stats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      {stats.totalOther > 0 && (
                        <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600' }}>💳 Other Digital</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{stats.otherCount}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{stats.totalOther.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {stats.totalPaidRevenue > 0 ? `${Math.round((stats.totalOther / stats.totalPaidRevenue) * 100)}%` : '0%'}
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: 'rgba(180, 138, 30, 0.05)', fontWeight: '700' }}>
                        <td style={{ padding: '8px 12px' }}>Total Paid Sales</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{stats.paidCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--gold)' }}>{stats.totalPaidRevenue.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Fulfillment Types */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Fulfillment Channels
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div style={{ border: '1px solid var(--black-border)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>🍽️</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dine-In Tables</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>{stats.dineInRevenue.toFixed(2)} ETB</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{stats.dineInCount} orders</div>
                  </div>
                  <div style={{ border: '1px solid var(--black-border)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>🥡</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Takeaway</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>{stats.takeawayRevenue.toFixed(2)} ETB</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{stats.takeawayCount} orders</div>
                  </div>
                  <div style={{ border: '1px solid var(--black-border)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>🛵</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Delivery</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>{stats.deliveryRevenue.toFixed(2)} ETB</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{stats.deliveryCount} orders</div>
                  </div>
                </div>
              </div>

              {/* Top Selling Items */}
              {stats.topItems.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Top Selling Items
                  </h4>
                  <div style={{ border: '1px solid var(--black-border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {stats.topItems.map((item, idx) => (
                          <tr key={item.name} style={{ borderBottom: idx < stats.topItems.length - 1 ? '1px solid var(--black-border)' : 'none' }}>
                            <td style={{ padding: '6px 12px', fontWeight: '600' }}>#{idx + 1} {item.name}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{item.quantity} sold</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '700', color: 'var(--gold)' }}>{item.revenue.toFixed(2)} ETB</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--black-border)' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowReportModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  style={{ gap: '6px' }}
                  onClick={printShiftSummary}
                >
                  <Printer size={14} /> Print Shift Slip (80mm)
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
