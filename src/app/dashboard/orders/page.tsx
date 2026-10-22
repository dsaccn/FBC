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
  Receipt,
  ChevronDown,
  Scissors,
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
  tableId?: string
  table: { id?: string; number: string }
  waiterId?: string
  waiter: { id?: string; fullName: string; username?: string; role?: string }
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
    cashierId?: string
    cashier?: { id: string; fullName: string; username: string; role?: string }
  } | null
}

interface StaffUser {
  id: string
  fullName: string
  username?: string
  role?: string
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
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ id?: string; fullName: string; role: string } | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL')

  // Fetch current session: if cashier, default selection to their own account
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const user = data?.user || data
        if (user?.id) {
          setCurrentUser(user)
          if ((user.role || '').toUpperCase() === 'CASHIER') {
            setSelectedStaffId(user.id)
          }
        }
      })
      .catch(() => {})
  }, [])

  // Fetch staff list for selection (admins, cashiers, managers, waiters)
  useEffect(() => {
    fetch('/api/staff')
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (Array.isArray(data)) setStaffList(data)
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

  // Fetch orders: fetch all statuses for the period
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

  // Overall counts for tabs
  const tabCounts = useMemo(() => {
    let open = 0
    let paid = 0
    let cancelled = 0
    for (const o of orders) {
      if (o.status === 'OPEN') open++
      else if (o.status === 'PAID') paid++
      else if (o.status === 'CANCELLED') cancelled++
    }
    return { open, paid, cancelled, total: orders.length }
  }, [orders])

  // Check if current user is restricted to cashier-only view
  const isCashier = (currentUser?.role || '').toUpperCase() === 'CASHIER'

  // Extract available staff based on user role permissions:
  // If Cashier is viewing: they only have permission to see Cashiers!
  // If Admin/Manager is viewing: they can see all staff (Admins, Managers, Cashiers, Waiters)
  const availableStaff = useMemo(() => {
    const map = new Map<string, { id: string; fullName: string; role?: string }>()

    if (isCashier) {
      // CASHIER VIEW: Only include staff with role 'CASHIER'
      for (const s of staffList) {
        if (s.id && s.fullName && (s.role || '').toUpperCase() === 'CASHIER') {
          map.set(s.id, { id: s.id, fullName: s.fullName, role: 'CASHIER' })
        }
      }
      if (currentUser?.id && currentUser?.fullName && (currentUser.role || '').toUpperCase() === 'CASHIER') {
        map.set(currentUser.id, { id: currentUser.id, fullName: currentUser.fullName, role: 'CASHIER' })
      }
      for (const o of orders) {
        if (o.payment?.cashier?.id && o.payment?.cashier?.fullName) {
          const cRole = (o.payment.cashier.role || '').toUpperCase()
          if (cRole === 'CASHIER' || !cRole) {
            map.set(o.payment.cashier.id, {
              id: o.payment.cashier.id,
              fullName: o.payment.cashier.fullName,
              role: 'CASHIER',
            })
          }
        }
      }
    } else {
      // ADMIN / MANAGER VIEW: Include all staff & order creators
      for (const s of staffList) {
        if (s.id && s.fullName) {
          map.set(s.id, { id: s.id, fullName: s.fullName, role: s.role || 'STAFF' })
        }
      }
      if (currentUser?.id && currentUser?.fullName && !map.has(currentUser.id)) {
        map.set(currentUser.id, {
          id: currentUser.id,
          fullName: currentUser.fullName,
          role: currentUser.role || 'USER',
        })
      }
      for (const o of orders) {
        if (o.waiter?.id && o.waiter?.fullName && !map.has(o.waiter.id)) {
          map.set(o.waiter.id, {
            id: o.waiter.id,
            fullName: o.waiter.fullName,
            role: o.waiter.role || 'WAITER',
          })
        }
        if (o.payment?.cashier?.id && o.payment?.cashier?.fullName && !map.has(o.payment.cashier.id)) {
          map.set(o.payment.cashier.id, {
            id: o.payment.cashier.id,
            fullName: o.payment.cashier.fullName,
            role: o.payment.cashier.role || 'CASHIER',
          })
        } else if (o.payment?.cashierId && !map.has(o.payment.cashierId)) {
          map.set(o.payment.cashierId, {
            id: o.payment.cashierId,
            fullName: `Cashier (${o.payment.cashierId.slice(-4)})`,
            role: 'CASHIER',
          })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [staffList, currentUser, orders, isCashier])

  const selectedStaffObj = availableStaff.find(c => c.id === selectedStaffId)
  const selectedStaffName = selectedStaffId === 'ALL'
    ? (isCashier ? 'All Cashiers' : 'All Staff & Cashiers')
    : (selectedStaffObj?.fullName || (isCashier ? 'Cashier' : 'Selected Staff'))

  // Compute stats specifically for the Report Modal based on selectedStaffId & permissions
  const reportStats = useMemo(() => {
    const targetOrders = selectedStaffId === 'ALL'
      ? (isCashier
          ? orders.filter(o => {
              // Cashier view: only orders processed by a cashier
              const cRole = (o.payment?.cashier?.role || '').toUpperCase()
              return cRole === 'CASHIER' || !cRole
            })
          : orders)
      : orders.filter(o => {
          const selName = selectedStaffObj?.fullName?.toLowerCase().trim()

          // Matches as cashier (settled payment)
          const matchesCashier =
            o.payment?.cashierId === selectedStaffId ||
            o.payment?.cashier?.id === selectedStaffId ||
            (selName && o.payment?.cashier?.fullName?.toLowerCase().trim() === selName)

          // Matches as waiter / order creator
          const matchesWaiter =
            o.waiter?.id === selectedStaffId ||
            o.waiterId === selectedStaffId ||
            (selName && o.waiter?.fullName?.toLowerCase().trim() === selName)

          // If Cashier is viewing, they only match payments processed as cashier
          return isCashier ? matchesCashier : (matchesCashier || matchesWaiter)
        })

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
    let totalTips = 0
    let paidCount = 0

    let openTotalValue = 0
    let openCount = 0
    let cancelledCount = 0

    // Precompute cashier-match check for tip attribution
    const selName = selectedStaffObj?.fullName?.toLowerCase().trim()
    const isCashierMatch = (o: Order) => {
      if (selectedStaffId === 'ALL') return true
      return (
        o.payment?.cashierId === selectedStaffId ||
        o.payment?.cashier?.id === selectedStaffId ||
        (!!selName && o.payment?.cashier?.fullName?.toLowerCase().trim() === selName)
      )
    }

    for (const o of targetOrders) {
      if (o.status === 'OPEN') {
        openCount++
        openTotalValue += getOrderTotal(o)
      } else if (o.status === 'CANCELLED') {
        cancelledCount++
      } else if (o.status === 'PAID') {
        const total = getOrderTotal(o)
        paidCount++
        totalPaidRevenue += total
        totalDiscounts += o.payment?.discount || 0
        // Tips are a cashier-side metric — only count when selected person processed the payment
        if (isCashierMatch(o)) {
          const tipMatch = (o.payment?.notes || '').match(/\[Tip:\s*([\d.]+)\s*ETB\]/i)
          if (tipMatch) totalTips += parseFloat(tipMatch[1])
        }

        const methodStr = (o.payment?.method || 'Cash').toLowerCase()
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
      }
    }

    return {
      totalPaidRevenue,
      paidCount,
      totalDiscounts,
      totalTips,
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
    }
  }, [orders, selectedStaffId, selectedStaffObj, isCashier])

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

  // Print Bill (pre-payment itemized printout for table orders)
  const printBill = (order: Order) => {
    const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
    const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const discount = order.payment?.discount || 0
    const totalDue = Math.max(0, subtotal - discount)
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const tableLabel = order.table?.number || 'Table'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill - ${tableLabel}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          *, *:before, *:after { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 12px 14px;
            font-family: 'Courier New', Courier, monospace;
            width: 100%;
            font-size: 13px;
            color: #000;
            background: #fff;
            line-height: 1.35;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 18px; font-weight: 900; letter-spacing: 1.5px; }
          .bill-badge {
            display: inline-block;
            border: 2px solid #000;
            padding: 4px 18px;
            font-size: 15px;
            font-weight: 900;
            letter-spacing: 2px;
            margin: 6px 0;
          }
          hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .item-note { font-size: 11px; color: #333; padding-left: 12px; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">Kogna Coffee</div>
          <div style="font-size: 11px; margin-top: 2px;">Addis Ababa, Ethiopia</div>
          <div class="bill-badge">BILL</div>
        </div>

        <div style="font-size: 12px; margin: 8px 0;">
          <div><b>Table:</b> ${tableLabel}</div>
          <div><b>Server:</b> ${order.waiter?.fullName || 'Staff'}</div>
          <div><b>Time:</b> ${now}</div>
        </div>

        <hr/>
        <div class="bold" style="font-size: 12px; margin-bottom: 6px;">ITEMS:</div>
        ${activeItems.map(item => {
          const itemNoteClean = item.notes?.replace(/\[.*?\]/, '').trim()
          return `
            <div style="margin-bottom: 6px;">
              <div class="row">
                <span class="bold">${item.quantity}x ${item.menuItem.name}</span>
                <span>${(item.menuItem.price * item.quantity).toFixed(2)} ETB</span>
              </div>
              ${itemNoteClean ? `<div class="item-note">Note: ${itemNoteClean}</div>` : ''}
            </div>
          `
        }).join('')}

        <hr/>
        ${discount > 0 ? `
          <div class="row">
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)} ETB</span>
          </div>
          <div class="row">
            <span>Discount:</span>
            <span>-${discount.toFixed(2)} ETB</span>
          </div>
        ` : ''}
        <div class="row bold" style="font-size: 16px; margin-top: 4px; border-top: 2px solid #000; padding-top: 6px;">
          <span>AMOUNT DUE:</span>
          <span>${totalDue.toFixed(2)} ETB</span>
        </div>

        <hr/>
        <div class="center" style="font-size: 11px; margin-top: 8px; color: #444;">
          Thank you — please proceed to payment
        </div>
        <div class="center" style="font-size: 12px; font-weight: 900; margin-top: 6px; letter-spacing: 1.5px;">
          <b>MEBA TECH PRO</b>
        </div>
      </body>
      </html>
    `
    printTicketHtml(html)
  }

  // Print Cashier / Staff Shift Report on Thermal Slip
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
          <b style="font-size: 14px;">SHIFT SALES REPORT</b><br/>
          <span style="font-size: 11px;">Period: ${dateRangeStr}</span><br/>
          <span style="font-size: 11px;">Printed: ${now}</span><br/>
          <span style="font-size: 11px;">${isCashier ? 'Cashier' : 'Staff'}: ${selectedStaffName}</span>
        </div>
        <hr/>
        <div class="row"><span>TOTAL PAID SALES:</span><span>${reportStats.totalPaidRevenue.toFixed(2)} ETB</span></div>
        <div class="row"><span>Paid Orders Count:</span><span>${reportStats.paidCount}</span></div>
        ${reportStats.totalDiscounts > 0 ? `<div class="row"><span>Total Discounts:</span><span>-${reportStats.totalDiscounts.toFixed(2)} ETB</span></div>` : ''}
        ${reportStats.totalTips > 0 ? `<div class="row"><span>Waiter Tips (held):</span><span>${reportStats.totalTips.toFixed(2)} ETB</span></div>` : ''}
        <hr/>
        <div style="font-size: 12px; margin-bottom: 4px;"><b>PAYMENT BREAKDOWN:</b></div>
        <div class="row"><span>  [CASH] In Drawer:</span><span>${reportStats.totalCash.toFixed(2)} ETB (${reportStats.cashCount})</span></div>
        <div class="row"><span>  [TELEBIRR]:</span><span>${reportStats.totalTelebirr.toFixed(2)} ETB (${reportStats.telebirrCount})</span></div>
        <div class="row"><span>  [CBE / BANK]:</span><span>${reportStats.totalCbe.toFixed(2)} ETB (${reportStats.cbeCount})</span></div>
        ${reportStats.totalOther > 0 ? `<div class="row"><span>  [OTHER]:</span><span>${reportStats.totalOther.toFixed(2)} ETB (${reportStats.otherCount})</span></div>` : ''}
        <hr/>
        ${reportStats.openCount > 0 ? `
          <div class="row"><span>OPEN (PENDING):</span><span>${reportStats.openTotalValue.toFixed(2)} ETB (${reportStats.openCount})</span></div>
        ` : ''}
        ${reportStats.cancelledCount > 0 ? `
          <div class="row"><span>CANCELLED:</span><span>${reportStats.cancelledCount} orders</span></div>
          <hr/>
        ` : ''}
        <div class="title" style="font-size: 12px; font-weight: 900; color: #000; letter-spacing: 1.5px; margin-top: 10px;">
          <b>MEBA TECH PRO · SHIFT SUMMARY</b>
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
            <span className="gold-text">Orders</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
            {displayedOrders.length} orders found
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
            title="View Shift & Sales Report"
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

      {/* ── FILTER TABS & SEARCH ROW ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {/* Status Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${filter === 'OPEN' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('OPEN')}
          >
            OPEN ({tabCounts.open})
          </button>
          <button
            className={`btn btn-sm ${filter === 'PAID' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('PAID')}
          >
            PAID ({tabCounts.paid})
          </button>
          <button
            className={`btn btn-sm ${filter === 'CANCELLED' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('CANCELLED')}
          >
            CANCELLED ({tabCounts.cancelled})
          </button>
          <button
            className={`btn btn-sm ${filter === '' ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilter('')}
          >
            All ({tabCounts.total})
          </button>
        </div>

        {/* Search input */}
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
          <div>Loading orders...</div>
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
                    Waiter: {order.waiter?.fullName} · {new Date(order.createdAt).toLocaleString('en-US', {
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
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {order.status === 'OPEN' && (
                      <Link href={`/dashboard/orders/${order.id}?split=true`} className="btn btn-outline btn-sm"
                        style={{ borderColor: 'rgba(201,168,76,0.5)', color: 'var(--gold)' }}
                        title="Separate bill between guests">
                        <Scissors size={13} /> Split
                      </Link>
                    )}
                    <Link href={`/dashboard/orders/${order.id}`} className="btn btn-outline btn-sm">
                      <Eye size={13} /> View
                    </Link>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => printBill(order)}
                      title="Print itemized bill for customer"
                    >
                      <FileText size={13} /> Bill
                    </button>
                    {order.status === 'OPEN' && (
                      <>
                        <Link
                          href={`/dashboard/orders/new?tableId=${order.table?.id || order.tableId || order.table?.number || ''}`}
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: 'rgba(201,168,76,0.4)', color: 'var(--gold)' }}
                          title="Add more items to this open table order"
                        >
                          <Plus size={13} /> Add Items
                        </Link>
                        <Link href={`/dashboard/payment?orderId=${order.id}`} className="btn btn-gold btn-sm">
                          Pay
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── SHIFT & SALES REPORT MODAL (PORTAL) ──────────────────────────────────── */}
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
                  <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>
                    {isCashier ? 'Cashier Shift Sales Summary' : 'Shift & Sales Summary'}
                  </h3>
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

              {/* Sub-header meta with Role-restricted Staff / Cashier Selector */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--black-border)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '18px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Period: </span>
                  <b>{dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`}</b>
                </div>

                {/* Clickable Cashier/Staff Selector: Cashiers only see cashiers; Admins see everyone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{isCashier ? 'Cashier:' : 'Staff:'} </span>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <select
                      value={selectedStaffId}
                      onChange={e => setSelectedStaffId(e.target.value)}
                      className="input"
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        padding: '4px 28px 4px 10px',
                        height: '30px',
                        borderRadius: '8px',
                        background: 'var(--black-card)',
                        color: 'var(--gold)',
                        border: '1px solid var(--gold)',
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                      }}
                    >
                      <option value="ALL">
                        {isCashier ? 'All Cashiers (Combined)' : 'All Staff & Cashiers (Combined)'}
                      </option>
                      {availableStaff.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} {c.role ? `(${c.role})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      color="var(--gold)"
                      style={{ position: 'absolute', right: '8px', pointerEvents: 'none' }}
                    />
                  </div>
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
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{reportStats.totalPaidRevenue.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{reportStats.paidCount} orders</div>
                </div>
                <div style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--success-light)', fontWeight: '700' }}>CASH COLLECTED</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{reportStats.totalCash.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{reportStats.cashCount} orders</div>
                </div>
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>DIGITAL / BANK</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{(reportStats.totalTelebirr + reportStats.totalCbe + reportStats.totalOther).toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{reportStats.telebirrCount + reportStats.cbeCount + reportStats.otherCount} orders</div>
                </div>
                <div style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: '700' }}>OPEN (UNPAID)</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '2px' }}>{reportStats.openTotalValue.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{reportStats.openCount} pending</div>
                </div>
              </div>

              {/* Payment Methods Breakdown Table */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Payment Methods Breakdown {selectedStaffId !== 'ALL' && `(${selectedStaffName})`}
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
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{reportStats.cashCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{reportStats.totalCash.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {reportStats.totalPaidRevenue > 0 ? `${Math.round((reportStats.totalCash / reportStats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0284c7' }}>📱 Telebirr</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{reportStats.telebirrCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{reportStats.totalTelebirr.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {reportStats.totalPaidRevenue > 0 ? `${Math.round((reportStats.totalTelebirr / reportStats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#7c3aed' }}>🏦 CBE / Commercial Bank</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{reportStats.cbeCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{reportStats.totalCbe.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {reportStats.totalPaidRevenue > 0 ? `${Math.round((reportStats.totalCbe / reportStats.totalPaidRevenue) * 100)}%` : '0%'}
                        </td>
                      </tr>
                      {reportStats.totalOther > 0 && (
                        <tr style={{ borderBottom: '1px solid var(--black-border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600' }}>💳 Other Digital</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{reportStats.otherCount}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>{reportStats.totalOther.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {reportStats.totalPaidRevenue > 0 ? `${Math.round((reportStats.totalOther / reportStats.totalPaidRevenue) * 100)}%` : '0%'}
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: 'rgba(180, 138, 30, 0.05)', fontWeight: '700' }}>
                        <td style={{ padding: '8px 12px' }}>Total Paid Sales</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{reportStats.paidCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--gold)' }}>{reportStats.totalPaidRevenue.toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>100%</td>
                      </tr>
                      {reportStats.totalTips > 0 && (
                        <tr style={{ borderTop: '2px dashed rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.04)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--gold)' }}>💝 Waiter Tips (held)</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '800', color: 'var(--gold)' }}>{reportStats.totalTips.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '10px', color: 'var(--text-muted)' }}>for staff</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>



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
