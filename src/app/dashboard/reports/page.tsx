'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  XCircle, 
  AlertTriangle, 
  Download,
  PieChart,
  Percent,
  Search,
  Filter,
  ArrowUpDown,
  Info,
  Layers,
  Package,
  Boxes,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronRight,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react'

export interface ProfitCategory {
  category: string
  quantity: number
  revenue: number
  cost: number
  grossProfit: number
  profitMargin: number
}

export interface ProfitItem {
  id: string
  name: string
  category: string
  type: string
  quantity: number
  price: number
  costPrice: number
  revenue: number
  totalCost: number
  grossProfit: number
  profitMargin: number
  isRecipe?: boolean
  recipeCost?: number
}

interface ReportData {
  totalRevenue: number
  totalCOGS?: number
  grossProfit?: number
  profitMargin?: number
  totalWasteCost?: number
  totalWasteQty?: number
  netProfit?: number
  netProfitMargin?: number
  wasteBreakdown?: {
    id: string
    itemName: string
    type: string
    quantity: number
    unitCost: number
    totalCost: number
    reason: string
    userName: string
    createdAt: string
  }[]
  totalOrders: number
  revenueByMethod: Record<string, number>
  bestSelling: { 
    name: string
    category: string
    quantity: number
    revenue: number
    costPrice?: number
    totalCost?: number
    profit?: number
    profitMargin?: number
    isRecipe?: boolean
    recipeCost?: number
  }[]
  profitByCategory?: ProfitCategory[]
  profitByItem?: ProfitItem[]
  staffPerformance: { name: string; orders: number; revenue: number }[]
  cancellations: { id: string; orderItem: { menuItem: { name: string }; quantity: number; order: { table: { number: string }; waiter: { fullName: string } } }; manager: { fullName: string }; reason: string; createdAt: string }[]
  lowStock: { id: string; name: string; stockQuantity: number; lowStockThreshold: number }[]
  inventory?: {
    id: string
    name: string
    stockQuantity: number
    barQuantity?: number
    lowStockThreshold: number
    costPrice: number
    price: number
    effectiveCost?: number
    isRecipe?: boolean
    recipeCost?: number
    category?: { name: string; type: string }
  }[]
  ingredients?: {
    id: string
    name: string
    unit: string
    quantity: number
    costPerUnit: number
    totalValue: number
    minAlert?: number
  }[]
  inventoryValuation?: {
    totalValue: number
    ingredientValue: number
    retailValue: number
  }
  transactions: { id: string; date: string; amount: number; method: string; cashier: string; waiter: string; table: string; items: string }[]
  dailySales: { date: string; orders: number; revenue: number; categories: { categoryName: string; items: { name: string; quantity: number; revenue: number }[] }[] }[]
  categorizedReport: {
    categories: {
      categoryName: string
      totalQuantity: number
      totalRevenue: number
      subCategories: {
        subCategoryName: string
        totalQuantity: number
        totalRevenue: number
        articles: {
          code: string
          name: string
          quantity: number
          avgAmount: number
          totalAmount: number
        }[]
      }[]
    }[]
    subTotal: number
    serviceCharge: number
    discount: number
    tax: number
    grandTotal: number
  }
  inventoryLogs?: {
    id: string
    itemName: string
    type: string
    action: string
    quantity: number
    prevQty: number
    newQty: number
    userName: string
    createdAt: string
  }[]
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [activeTab, setActiveTab] = useState('summary')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [plSearch, setPlSearch] = useState('')
  const [plTypeFilter, setPlTypeFilter] = useState<'ALL' | 'FOOD' | 'DRINKS'>('ALL')
  const [plSortBy, setPlSortBy] = useState<'profit' | 'margin' | 'revenue' | 'quantity' | 'cost'>('profit')
  const [invSubTab, setInvSubTab] = useState<'ingredients' | 'retail' | 'lowstock'>('ingredients')
  const [invSearch, setInvSearch] = useState('')
  const [quickDateActive, setQuickDateActive] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('all')

  const setQuickDate = (type: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    setQuickDateActive(type)
    const now = new Date()
    const formatDate = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    if (type === 'today') {
      const today = formatDate(now)
      setFrom(today)
      setTo(today)
    } else if (type === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = formatDate(y)
      setFrom(yStr)
      setTo(yStr)
    } else if (type === 'week') {
      const w = new Date(now)
      w.setDate(w.getDate() - 7)
      setFrom(formatDate(w))
      setTo(formatDate(now))
    } else if (type === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      setFrom(formatDate(m))
      setTo(formatDate(now))
    } else {
      setFrom('')
      setTo('')
    }
  }

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('tz', String(new Date().getTimezoneOffset()))
      const res = await fetch(`/api/reports?${params.toString()}`)
      if (res.ok) {
        setData(await res.json())
      } else {
        console.error('Failed to load reports:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading reports:', err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [from, to])

  const triggerSyncAndRefresh = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST' })
    } catch (err) {
      console.warn('[Reports] Sync trigger error:', err)
    } finally {
      await load(false)
      setSyncing(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(false), 30000)
    const handleSyncComplete = () => load(false)
    window.addEventListener('sync-complete', handleSyncComplete)
    window.addEventListener('cloud-pull-complete', handleSyncComplete)

    return () => {
      clearInterval(interval)
      window.removeEventListener('sync-complete', handleSyncComplete)
      window.removeEventListener('cloud-pull-complete', handleSyncComplete)
    }
  }, [load])

  function exportCategorizedToExcel() {
    if (!data || !data.categorizedReport) return
    const report = data.categorizedReport
    const dateLabel = from || to
      ? `from ${from || 'Start'} to ${to || 'End'}`
      : `at the day of ${new Date().toLocaleDateString('en-US')}`

    const tdBase = `border:1px solid #D1D5DB;padding:6px 10px;font-family:system-ui,sans-serif;font-size:10pt;`
    const numTd = `${tdBase}text-align:right;`

    let bodyRows = ''
    report.categories.forEach(cat => {
      bodyRows += `<tr style="background-color:#1E293B;color:#FFFFFF;">
        <td colspan="7" style="${tdBase}font-weight:bold;font-size:11pt;text-transform:uppercase;background-color:#1E293B;color:#FFFFFF;">${cat.categoryName}</td>
      </tr>`

      cat.subCategories.forEach(sub => {
        bodyRows += `<tr style="background-color:#F1F5F9;color:#0F172A;">
          <td style="${tdBase}background-color:#F1F5F9;"></td>
          <td colspan="6" style="${tdBase}font-weight:bold;text-transform:uppercase;background-color:#F1F5F9;color:#0F172A;">${sub.subCategoryName}</td>
        </tr>`

        sub.articles.forEach(art => {
          bodyRows += `<tr style="background-color:#FFFFFF;color:#334155;">
            <td style="${tdBase}"></td>
            <td style="${tdBase}"></td>
            <td style="${tdBase}font-family:monospace;">${art.code}</td>
            <td style="${tdBase}">${art.name}</td>
            <td style="${numTd}">${art.quantity.toFixed(2)}</td>
            <td style="${numTd}">${art.avgAmount.toFixed(2)}</td>
            <td style="${numTd}font-weight:600;">${art.totalAmount.toFixed(2)}</td>
          </tr>`
        })

        bodyRows += `<tr style="background-color:#F8FAFC;color:#0F172A;font-weight:bold;">
          <td style="${tdBase}background-color:#F8FAFC;"></td>
          <td style="${tdBase}background-color:#F8FAFC;"></td>
          <td style="${tdBase}background-color:#F8FAFC;"></td>
          <td style="${tdBase}background-color:#F8FAFC;">${sub.subCategoryName} Total</td>
          <td style="${numTd}background-color:#F8FAFC;">${sub.totalQuantity.toFixed(2)}</td>
          <td style="${tdBase}background-color:#F8FAFC;"></td>
          <td style="${numTd}background-color:#F8FAFC;">${sub.totalRevenue.toFixed(2)}</td>
        </tr>`
      })

      bodyRows += `<tr style="background-color:#E2E8F0;color:#0F172A;font-weight:bold;">
        <td style="${tdBase}background-color:#E2E8F0;"></td>
        <td style="${tdBase}background-color:#E2E8F0;"></td>
        <td style="${tdBase}background-color:#E2E8F0;"></td>
        <td style="${tdBase}background-color:#E2E8F0;">${cat.categoryName} Total</td>
        <td style="${numTd}background-color:#E2E8F0;">${cat.totalQuantity.toFixed(2)}</td>
        <td style="${tdBase}background-color:#E2E8F0;"></td>
        <td style="${numTd}background-color:#E2E8F0;">${cat.totalRevenue.toFixed(2)}</td>
      </tr>`
    })

    const summaryRows = [
      ['Sub Total', report.subTotal.toFixed(2), '#F8FAFC'],
      ['Discount', report.discount.toFixed(2), '#F8FAFC'],
      ['Grand Total', report.grandTotal.toFixed(2), '#E2E8F0'],
    ].map(([label, value, bg], i) => `
      <tr style="background-color:${bg};${i === 2 ? 'font-weight:bold;font-size:11pt;border-top:3px double #0F172A;' : 'font-weight:600;'}">
        <td colspan="5" style="${tdBase}border:none;background-color:#FFFFFF;"></td>
        <td style="${tdBase}color:#475569;background-color:${bg};">${label}</td>
        <td style="${numTd}color:#0F172A;background-color:${bg};">${value}</td>
      </tr>`).join('')

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8"/>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; }
          td, th { border: 1px solid #D1D5DB; }
        </style>
      </head>
      <body>
        <p style="text-align:center;font-size:16pt;font-weight:bold;font-family:system-ui,sans-serif;margin-bottom:4px;color:#0F172A;">Categorized And Summarized By Article</p>
        <p style="text-align:center;font-size:10pt;font-family:system-ui,sans-serif;color:#475569;margin-bottom:16px;">
          Cash Sales Voucher Report, ${dateLabel}
        </p>
        <table>
          <thead>
            <tr style="background-color:#1E293B;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Category</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Sub Category</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Article Code</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Article Name</th>
              <th style="${numTd}font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Quantity</th>
              <th style="${numTd}font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Avg Amount</th>
              <th style="${numTd}font-weight:bold;background-color:#1E293B;color:#FFFFFF;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr><td colspan="7" style="padding:8px;border:none;background-color:#FFFFFF;"></td></tr>
            ${summaryRows}
          </tbody>
        </table>
      </body>
      </html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Categorized_Sales_Report_${from || new Date().toISOString().split('T')[0]}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportProfitLossToExcel() {
    if (!data || !data.profitByItem) return
    const items = data.profitByItem
    const tdBase = `border:1px solid #D1D5DB;padding:6px 10px;font-family:system-ui,sans-serif;font-size:10pt;`
    const numTd = `${tdBase}text-align:right;`

    let itemRows = ''
    items.forEach(it => {
      const marginColor = it.profitMargin >= 50 ? '#059669' : it.profitMargin >= 25 ? '#D97706' : '#DC2626'
      const costMethod = it.isRecipe ? 'Recipe Cost' : (it.costPrice === 0 ? 'Unset (0.00)' : 'Direct Cost')
      itemRows += `<tr>
        <td style="${tdBase}">${it.name}${it.isRecipe ? ' (Recipe)' : ''}</td>
        <td style="${tdBase}">${it.category}</td>
        <td style="${tdBase}">${it.type}</td>
        <td style="${tdBase}">${costMethod}</td>
        <td style="${numTd}">${it.quantity}</td>
        <td style="${numTd}">${it.price.toFixed(2)}</td>
        <td style="${numTd}">${it.costPrice.toFixed(2)}</td>
        <td style="${numTd}">${it.revenue.toFixed(2)}</td>
        <td style="${numTd}">${it.totalCost.toFixed(2)}</td>
        <td style="${numTd}font-weight:600;color:${it.grossProfit >= 0 ? '#059669' : '#DC2626'};">${it.grossProfit.toFixed(2)}</td>
        <td style="${numTd}font-weight:600;color:${marginColor};">${it.profitMargin.toFixed(1)}%</td>
      </tr>`
    })

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8"/>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; }
          td, th { border: 1px solid #D1D5DB; }
        </style>
      </head>
      <body>
        <p style="text-align:center;font-size:16pt;font-weight:bold;font-family:system-ui,sans-serif;margin-bottom:4px;color:#0F172A;">Profit & Loss Statement</p>
        <table>
          <thead>
            <tr style="background-color:#1E293B;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#1E293B;color:#FFFFFF;">Item Name</th>
              <th style="${tdBase}text-align:left;background-color:#1E293B;color:#FFFFFF;">Category</th>
              <th style="${tdBase}text-align:left;background-color:#1E293B;color:#FFFFFF;">Type</th>
              <th style="${tdBase}text-align:left;background-color:#1E293B;color:#FFFFFF;">Cost Method</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Qty</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Sell Price</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Unit Cost</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Revenue</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Cost</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Profit</th>
              <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </body>
      </html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Profit_Loss_Report_${from || new Date().toISOString().split('T')[0]}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(amount)
  }

  const tabs = [
    { id: 'summary', label: 'Executive Dashboard', icon: <TrendingUp size={15}/> },
    { id: 'profit-loss', label: 'Profit & Loss', icon: <PieChart size={15}/> },
    { id: 'daily', label: 'Daily Sales', icon: <DollarSign size={15}/> },
    { id: 'categorized', label: 'Categorized Articles', icon: <Receipt size={15}/> },
    { id: 'history', label: 'Transaction Ledger', icon: <ShoppingBag size={15}/> },
    { id: 'best-sellers', label: 'Best Sellers', icon: <Sparkles size={15}/> },
    { id: 'cancellations', label: 'Cancellations', icon: <XCircle size={15}/> },
    { id: 'inventory', label: 'Asset Valuation', icon: <Boxes size={15}/> },
    { id: 'inventory-logs', label: 'Audit Trail', icon: <RefreshCw size={15}/> }
  ]

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', color: 'var(--text-secondary)' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--gold)', marginBottom: '16px' }} />
        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>Loading Intelligence Data...</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Calculating financial metrics and stock valuation</div>
      </div>
    )
  }

  if (!data) return null

  const avgOrderValue = data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0
  const grossProfitVal = data.grossProfit || 0
  const cogsVal = data.totalCOGS || 0
  const marginPct = data.profitMargin ?? 0
  const totalStockVal = data.inventoryValuation?.totalValue || 0

  return (
    <div style={{ paddingBottom: '60px', width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
      
      {/* ============================================================ */}
      {/* 1. ELEGANT EXECUTIVE HEADER                                  */}
      {/* ============================================================ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--black-border)',
        paddingBottom: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="font-cinzel" style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 }}>
              Business Intelligence
            </h1>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '12px', background: 'rgba(180,138,30,0.12)', color: 'var(--gold-dark)', border: '1px solid rgba(180,138,30,0.25)' }}>
              Live
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Real-time financial analytics, product performance, and stock valuation
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={triggerSyncAndRefresh}
            disabled={syncing || loading}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              border: '1px solid var(--black-border)',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: syncing ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              transition: 'all 0.15s ease'
            }}
            title="Synchronize with Cloud & Local DB"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} style={{ color: 'var(--gold)' }} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. STREAMLINED PERIOD & DATE FILTER BAR                      */}
      {/* ============================================================ */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--black-border)',
        borderRadius: '12px',
        padding: '10px 14px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.03)'
      }}>
        {/* Left: Segmented Filter Track */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Period:
          </span>
          <div style={{
            display: 'inline-flex',
            background: 'var(--black-hover)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--black-border)',
            gap: '2px'
          }}>
            {([
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' }
            ] as const).map(p => {
              const isActive = quickDateActive === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuickDate(p.id)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: isActive ? '700' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    background: isActive ? '#0F172A' : 'transparent',
                    color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 1px 3px rgba(15,23,42,0.2)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Custom Date Range Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--black-hover)',
          padding: '4px 10px',
          borderRadius: '8px',
          border: quickDateActive === 'custom' ? '1px solid var(--gold)' : '1px solid var(--black-border)',
          fontSize: '12px'
        }}>
          <Calendar size={14} style={{ color: quickDateActive === 'custom' ? 'var(--gold)' : 'var(--text-muted)' }} />
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Custom:</span>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setQuickDateActive('custom') }}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer'
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>→</span>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setQuickDateActive('custom') }}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer'
            }}
          />
          {(from || to) && quickDateActive === 'custom' && (
            <button
              type="button"
              onClick={() => setQuickDate('all')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                padding: '0 4px',
                marginLeft: '4px'
              }}
              title="Reset to All Time"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. REFINED EXECUTIVE KPI METRIC CARDS (No pastel junk)       */}
      {/* ============================================================ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
        gap: '14px',
        marginBottom: '26px'
      }}>
        {/* Metric 1: Total Revenue */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid var(--gold)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Revenue
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(180,138,30,0.1)', color: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {formatMoney(data.totalRevenue)}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            {data.totalOrders} settled orders
          </div>
        </div>

        {/* Metric 2: Total Cost of Goods */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid #E11D48',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cost of Goods (COGS)
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(225,29,72,0.1)', color: '#E11D48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: cogsVal > 0 ? '#E11D48' : 'var(--text-primary)', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {formatMoney(cogsVal)}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            {data.totalRevenue > 0 ? `${((cogsVal / data.totalRevenue) * 100).toFixed(1)}% of revenue` : '0% cost ratio'}
          </div>
        </div>

        {/* Metric 3: Gross Profit */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid var(--success)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Gross Profit
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(5,150,105,0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: grossProfitVal >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {formatMoney(grossProfitVal)}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            Revenue minus COGS
          </div>
        </div>

        {/* Metric 4: Profit Margin */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid #6366F1',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Profit Margin
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Percent size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#6366F1', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {marginPct.toFixed(1)}%
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            Operational margin return
          </div>
        </div>

        {/* Metric 5: Average Order Value */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid #F59E0B',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avg Order Value
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#B45309', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {formatMoney(avgOrderValue)}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            Average guest ticket size
          </div>
        </div>

        {/* Metric 6: Inventory Valuation */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px 18px',
          border: '1px solid var(--black-border)',
          borderTop: '3px solid var(--text-primary)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '110px'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Stock Assets Value
              </span>
              <span style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(15,23,42,0.06)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Boxes size={14}/>
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '8px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {formatMoney(totalStockVal)}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
            Raw: {formatMoney(data.inventoryValuation?.ingredientValue || 0)} · Retail: {formatMoney(data.inventoryValuation?.retailValue || 0)}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. SEAMLESS CONNECTED TAB NAVIGATION                         */}
      {/* ============================================================ */}
      <div style={{
        background: 'var(--black-hover)',
        border: '1px solid var(--black-border)',
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '24px',
        display: 'flex',
        overflowX: 'auto',
        gap: '4px'
      }} className="hide-scrollbar">
        {tabs.map(t => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#FFFFFF' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)' : 'none'
              }}
            >
              <span style={{ color: isActive ? 'var(--gold)' : 'var(--text-muted)' }}>
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ============================================================ */}
      {/* 5. TAB 1: EXECUTIVE DASHBOARD SUMMARY                        */}
      {/* ============================================================ */}
      {activeTab === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          
          {/* Chart A: Daily Sales Bar Chart */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} style={{ color: 'var(--gold)' }} />
                  Daily Revenue Trajectory
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Daily billing volume for the last 14 active days
                </p>
              </div>
            </div>

            {data.dailySales.length > 0 ? (
              <div style={{ overflowX: 'auto', paddingBottom: '6px' }} className="hide-scrollbar">
                <div style={{ minWidth: '420px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', height: '200px', display: 'flex', alignItems: 'flex-end', gap: '10px', borderBottom: '1px solid var(--black-border)', paddingBottom: '4px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => {
                      const maxRev = Math.max(...data.dailySales.slice(0, 14).map(d => d.revenue))
                      const heightPct = maxRev > 0 ? Math.max((day.revenue / maxRev) * 100, 8) : 8
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                            {day.revenue > 999 ? `${(day.revenue / 1000).toFixed(1)}k` : day.revenue.toFixed(0)}
                          </div>
                          <div
                            style={{
                              width: '100%',
                              maxWidth: '36px',
                              height: `${heightPct}%`,
                              background: 'linear-gradient(180deg, #D4AF37 0%, #B48A1E 100%)',
                              borderRadius: '4px 4px 0 0',
                              boxShadow: '0 1px 4px rgba(180,138,30,0.2)',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer'
                            }}
                            title={`${new Date(day.date).toLocaleDateString()} — ${formatMoney(day.revenue)} (${day.orders} orders)`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '11px', fontWeight: '500', color: 'var(--text-muted)' }}>
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No daily revenue activity recorded.
              </div>
            )}
          </div>

          {/* Chart B: Payment Methods Breakdown */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={16} style={{ color: 'var(--gold)' }} />
              Settlement Channels
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
              Distribution of incoming revenue by payment instrument
            </p>

            {Object.keys(data.revenueByMethod).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(data.revenueByMethod).map(([method, amount], i) => {
                  const pct = data.totalRevenue > 0 ? (amount / data.totalRevenue) * 100 : 0
                  const color = ['#B48A1E', '#059669', '#2563EB', '#D97706', '#7C3AED'][i % 5]
                  return (
                    <div key={method} style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--black-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{method}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pct.toFixed(1)}% of total</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatMoney(amount)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No payment methods recorded.
              </div>
            )}
          </div>

          {/* Allocation Ribbon: COGS vs Gross Profit */}
          <div style={{
            gridColumn: '1 / -1',
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Financial Split & Cost Absorption
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Portion of revenue consumed by material costs vs retained gross profit
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setActiveTab('profit-loss')}
                style={{ fontSize: '12px', padding: '6px 14px', height: '32px' }}
              >
                Inspect P&L Statement →
              </button>
            </div>

            {data.totalRevenue > 0 ? (() => {
              const cogsPct = Math.min(100, Math.max(0, (cogsVal / data.totalRevenue) * 100))
              const profitPct = Math.max(0, 100 - cogsPct)
              return (
                <div>
                  <div style={{ height: '18px', borderRadius: '8px', overflow: 'hidden', display: 'flex', background: 'var(--black-hover)', border: '1px solid var(--black-border)', marginBottom: '14px' }}>
                    <div style={{ width: `${cogsPct}%`, background: '#E11D48', transition: 'width 0.3s ease' }} title={`COGS: ${cogsPct.toFixed(1)}%`} />
                    <div style={{ width: `${profitPct}%`, background: '#059669', transition: 'width 0.3s ease' }} title={`Gross Profit: ${profitPct.toFixed(1)}%`} />
                  </div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#E11D48' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Cost of Goods (COGS):</span>
                      <b style={{ color: '#E11D48' }}>{formatMoney(cogsVal)}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({cogsPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#059669' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Gross Profit:</span>
                      <b style={{ color: '#059669' }}>{formatMoney(grossProfitVal)}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({profitPct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              )
            })() : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No revenue activity in this period.</div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. TAB 2: PROFIT & LOSS (P&L) STATEMENT                      */}
      {/* ============================================================ */}
      {activeTab === 'profit-loss' && (() => {
        const totalRev = data.totalRevenue || 0
        const totalCost = data.totalCOGS || 0
        const grossProf = data.grossProfit || 0
        const wasteCost = data.totalWasteCost || 0
        const netProf = data.netProfit !== undefined ? data.netProfit : (grossProf - wasteCost)
        const netMargin = data.netProfitMargin ?? (totalRev > 0 ? (netProf / totalRev) * 100 : 0)

        const filteredItems = (data.profitByItem || []).filter(item => {
          const matchesSearch = !plSearch || 
            item.name.toLowerCase().includes(plSearch.toLowerCase()) || 
            item.category.toLowerCase().includes(plSearch.toLowerCase())
          const matchesType = plTypeFilter === 'ALL' || item.type === plTypeFilter
          return matchesSearch && matchesType
        }).sort((a, b) => {
          if (plSortBy === 'profit') return b.grossProfit - a.grossProfit
          if (plSortBy === 'margin') return b.profitMargin - a.profitMargin
          if (plSortBy === 'revenue') return b.revenue - a.revenue
          if (plSortBy === 'quantity') return b.quantity - a.quantity
          if (plSortBy === 'cost') return b.totalCost - a.totalCost
          return 0
        })

        const totalFilteredProfit = filteredItems.reduce((s, it) => s + it.grossProfit, 0)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Header with Export */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Profit & Loss Statement (P&L)
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Per-item profitability, recipe costing, waste loss, and net margin return
                </p>
              </div>
              <button
                className="btn btn-gold btn-sm"
                onClick={exportProfitLossToExcel}
                style={{ fontSize: '12px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileSpreadsheet size={14} /> Export P&L to Excel
              </button>
            </div>

            {/* P&L Executive Summary Strip */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '12px',
              padding: '18px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Revenue</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{formatMoney(totalRev)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>COGS Expense</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#E11D48', marginTop: '4px' }}>{formatMoney(totalCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Waste / Spoilage</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: wasteCost > 0 ? '#DC2626' : 'var(--text-muted)', marginTop: '4px' }}>
                  {wasteCost > 0 ? `-${formatMoney(wasteCost)}` : '0.00 ETB'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Operating Profit</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: netProf >= 0 ? '#059669' : '#DC2626', marginTop: '4px' }}>
                  {formatMoney(netProf)}
                </div>
                <div style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>{netMargin.toFixed(1)}% Net Margin</div>
              </div>
            </div>

            {/* Filter toolbar for items */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '340px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter by item or category..."
                  value={plSearch}
                  onChange={e => setPlSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 12px 7px 34px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--black-border)',
                    outline: 'none',
                    background: 'var(--black-hover)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Type:</span>
                {(['ALL', 'FOOD', 'DRINKS'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPlTypeFilter(t)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: plTypeFilter === t ? '700' : '500',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: plTypeFilter === t ? 'var(--gold)' : 'var(--black-border)',
                      background: plTypeFilter === t ? 'rgba(180,138,30,0.1)' : '#FFFFFF',
                      color: plTypeFilter === t ? 'var(--gold-dark)' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {t === 'ALL' ? 'All' : t}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sort by:</span>
                <select
                  value={plSortBy}
                  onChange={e => setPlSortBy(e.target.value as any)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--black-border)',
                    background: '#FFFFFF',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >
                  <option value="profit">Highest Profit</option>
                  <option value="margin">Highest Margin %</option>
                  <option value="revenue">Highest Revenue</option>
                  <option value="quantity">Units Sold</option>
                  <option value="cost">Highest Cost</option>
                </select>
              </div>
            </div>

            {/* P&L Table */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item / Category</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qty</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cost / Unit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gross Profit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                          No items match the filter criteria.
                        </td>
                      </tr>
                    ) : filteredItems.map((item, idx) => {
                      const marginColor = item.profitMargin >= 50 ? '#059669' : item.profitMargin >= 25 ? '#D97706' : '#DC2626'
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.6)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: 'var(--black-hover)', color: 'var(--text-secondary)' }}>
                              {item.type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.price)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {item.costPrice > 0 ? formatMoney(item.costPrice) : '0.00 ETB'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.revenue)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#E11D48', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.totalCost)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: item.grossProfit >= 0 ? '#059669' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                            {formatMoney(item.grossProfit)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: marginColor }}>
                              {item.profitMargin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 7. TAB 3: DAILY SALES BREAKDOWN                              */}
      {/* ============================================================ */}
      {activeTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Daily Sales Audit
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              Day-by-day revenue, ticket counts, and category drill-downs
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                  <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Orders</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Average Ticket</th>
                  <th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '90px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.dailySales.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                      No daily records found.
                    </td>
                  </tr>
                ) : data.dailySales.map(day => {
                  const isExpanded = selectedDay === day.date
                  return (
                    <React.Fragment key={day.date}>
                      <tr
                        onClick={() => setSelectedDay(isExpanded ? null : day.date)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--black-border)',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(180,138,30,0.04)' : '#FFFFFF',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '14px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                          {day.orders}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(day.revenue)}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {day.orders > 0 ? formatMoney(day.revenue / day.orders) : '-'}
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--gold-dark)' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--black-border)' }}>
                          <td colSpan={5} style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                              Item Breakdown for {new Date(day.date).toLocaleDateString()}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                              {day.categories.map(cat => (
                                <div key={cat.categoryName} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '8px', padding: '12px' }}>
                                  <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--black-border)', paddingBottom: '6px', marginBottom: '8px' }}>
                                    {cat.categoryName}
                                  </div>
                                  {cat.items.map(it => (
                                    <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>{it.quantity}x {it.name}</span>
                                      <b style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(it.revenue)}</b>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. TAB 4: CATEGORIZED ARTICLES (Clean modern luxury style)   */}
      {/* ============================================================ */}
      {activeTab === 'categorized' && (() => {
        const report = data.categorizedReport
        if (!report || report.categories.length === 0) {
          return (
            <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No categorized sales records found.
            </div>
          )
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Categorized & Summarized by Article
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Audited sales voucher ledger organized by category hierarchy
                </p>
              </div>
              <button
                className="btn btn-gold btn-sm"
                onClick={exportCategorizedToExcel}
                style={{ fontSize: '12px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Download Excel Spreadsheet
              </button>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#0F172A', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article Code</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Price</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map(cat => (
                      <React.Fragment key={cat.categoryName}>
                        {/* Category Heading Band */}
                        <tr style={{ background: '#1E293B', color: '#FFFFFF' }}>
                          <td colSpan={5} style={{ padding: '10px 16px', fontWeight: '700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {cat.categoryName}
                          </td>
                        </tr>

                        {cat.subCategories.map(sub => (
                          <React.Fragment key={sub.subCategoryName}>
                            {/* Subcategory sub-band */}
                            <tr style={{ background: 'var(--black-hover)', color: 'var(--text-primary)' }}>
                              <td colSpan={5} style={{ padding: '8px 16px 8px 24px', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', borderBottom: '1px solid var(--black-border)' }}>
                                ↳ {sub.subCategoryName}
                              </td>
                            </tr>

                            {/* Articles */}
                            {sub.articles.map(art => (
                              <tr key={art.code} style={{ borderBottom: '1px solid var(--black-border)', color: 'var(--text-primary)' }}>
                                <td style={{ padding: '9px 16px 9px 36px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{art.code}</td>
                                <td style={{ padding: '9px 16px', fontWeight: '500' }}>{art.name}</td>
                                <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{art.quantity.toFixed(2)}</td>
                                <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{art.avgAmount.toFixed(2)}</td>
                                <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{art.totalAmount.toFixed(2)}</td>
                              </tr>
                            ))}

                            {/* Subcategory Total */}
                            <tr style={{ background: 'rgba(248,250,252,0.8)', fontWeight: '600', borderBottom: '1px solid var(--black-border)' }}>
                              <td colSpan={2} style={{ padding: '8px 16px 8px 36px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                {sub.subCategoryName} Subtotal
                              </td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sub.totalQuantity.toFixed(2)}</td>
                              <td style={{ padding: '8px 16px' }}></td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '700' }}>{sub.totalRevenue.toFixed(2)}</td>
                            </tr>
                          </React.Fragment>
                        ))}

                        {/* Category Total */}
                        <tr style={{ background: '#F1F5F9', fontWeight: '700', borderBottom: '2px solid var(--black-border)' }}>
                          <td colSpan={2} style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>
                            {cat.categoryName} Total
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cat.totalQuantity.toFixed(2)}</td>
                          <td style={{ padding: '10px 16px' }}></td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--gold-dark)' }}>{cat.totalRevenue.toFixed(2)}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Financial Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 24px', background: 'var(--black-hover)', borderTop: '1px solid var(--black-border)' }}>
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span>Sub Total:</span>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{report.subTotal.toFixed(2)} ETB</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span>Discount:</span>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{report.discount.toFixed(2)} ETB</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', borderTop: '2px solid var(--black-border)', paddingTop: '8px' }}>
                    <span>Grand Total:</span>
                    <span style={{ color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{report.grandTotal.toFixed(2)} ETB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 9. TAB 5: TRANSACTION HISTORY LEDGER                         */}
      {/* ============================================================ */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Transaction Ledger
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              Chronological log of customer payments and order settlements
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time & Date</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Table</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Staff</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Items</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Method</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        No transactions recorded.
                      </td>
                    </tr>
                  ) : data.transactions.map((tx, idx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                      <td style={{ padding: '12px 18px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(tx.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Table {tx.table}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{tx.waiter}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cashier: {tx.cashier}</div>
                      </td>
                      <td style={{ padding: '12px 18px', color: 'var(--text-secondary)', maxWidth: '280px', lineHeight: 1.4 }}>
                        {tx.items}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: tx.method === 'Cash' ? 'rgba(5,150,105,0.1)' : 'rgba(37,99,235,0.1)', color: tx.method === 'Cash' ? '#059669' : '#2563EB' }}>
                          {tx.method}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 10. TAB 6: BEST SELLERS RANKING                              */}
      {/* ============================================================ */}
      {activeTab === 'best-sellers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Top Selling Articles
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              Popularity rank, revenue contribution, and unit margins
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'center', width: '60px', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rank</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item Name</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Units Sold</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unit Cost</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bestSelling.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        No items sold during this period.
                      </td>
                    </tr>
                  ) : data.bestSelling.map((item, idx) => {
                    const margin = item.profitMargin ?? 0
                    const marginColor = margin >= 50 ? '#059669' : margin >= 25 ? '#D97706' : '#DC2626'
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                        <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: idx < 3 ? 'var(--gold)' : 'var(--black-hover)',
                            color: idx < 3 ? '#FFFFFF' : 'var(--text-secondary)'
                          }}>
                            {idx + 1}
                          </span>
                        </td>
                        <td style={{ padding: '12px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {item.name}
                        </td>
                        <td style={{ padding: '12px 18px', color: 'var(--text-secondary)' }}>{item.category}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.revenue)}</td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.costPrice ? formatMoney(item.costPrice) : '0.00'}
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: (item.profit ?? 0) >= 0 ? '#059669' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                          {item.profit !== undefined ? formatMoney(item.profit) : '-'}
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: marginColor }}>
                          {item.profitMargin !== undefined ? `${item.profitMargin.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 11. TAB 7: CANCELLATIONS & VOIDS                             */}
      {/* ============================================================ */}
      {activeTab === 'cancellations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Order Cancellations & Voids
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              Supervisor authorizations and cancellation rationale
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item Cancelled</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Table & Waiter</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reason</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Authorized By</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cancellations.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        <CheckCircle2 size={24} style={{ color: 'var(--success)', margin: '0 auto 8px auto', display: 'block' }} />
                        No cancellations recorded during this period.
                      </td>
                    </tr>
                  ) : data.cancellations.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--black-border)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: '600', color: '#DC2626' }}>
                        {c.orderItem.quantity}x {c.orderItem.menuItem.name}
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Table {c.orderItem.order.table.number}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Waiter: {c.orderItem.order.waiter.fullName}</div>
                      </td>
                      <td style={{ padding: '12px 18px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                        "{c.reason}"
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: 'var(--black-hover)', color: 'var(--text-primary)' }}>
                          {c.manager.fullName}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 12. TAB 8: ASSET VALUATION & INVENTORY                       */}
      {/* ============================================================ */}
      {activeTab === 'inventory' && (() => {
        const val = data.inventoryValuation || { totalValue: 0, ingredientValue: 0, retailValue: 0 }
        const allIngs = data.ingredients || []
        const allItems = data.inventory || []
        const lowStockList = data.lowStock || []

        const filteredIngs = allIngs.filter(i => 
          !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase()) || (i.unit && i.unit.toLowerCase().includes(invSearch.toLowerCase()))
        )
        const filteredItems = allItems.filter(i =>
          !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase()) || (i.category?.name && i.category.name.toLowerCase().includes(invSearch.toLowerCase()))
        )
        const filteredLowStock = lowStockList.filter(i =>
          !invSearch || i.name.toLowerCase().includes(invSearch.toLowerCase())
        )

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Header */}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Inventory Assets & Stock Valuation
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                Store ingredients, prepared recipe items, retail goods, and reorder warnings
              </p>
            </div>

            {/* Sub-navigation pill track + Search */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setInvSubTab('ingredients')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: invSubTab === 'ingredients' ? '700' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    background: invSubTab === 'ingredients' ? '#0F172A' : 'var(--black-hover)',
                    color: invSubTab === 'ingredients' ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Store Ingredients ({allIngs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvSubTab('retail')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: invSubTab === 'retail' ? '700' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    background: invSubTab === 'retail' ? '#0F172A' : 'var(--black-hover)',
                    color: invSubTab === 'retail' ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Menu & Retail Items ({allItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvSubTab('lowstock')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: invSubTab === 'lowstock' ? '700' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    background: invSubTab === 'lowstock' ? '#DC2626' : 'var(--black-hover)',
                    color: invSubTab === 'lowstock' ? '#FFFFFF' : (lowStockList.length > 0 ? '#DC2626' : 'var(--text-secondary)'),
                    cursor: 'pointer'
                  }}
                >
                  Low Stock Alerts ({lowStockList.length})
                </button>
              </div>

              <div style={{ position: 'relative', width: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={invSearch}
                  onChange={e => setInvSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 12px 6px 30px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--black-border)',
                    outline: 'none',
                    background: 'var(--black-hover)'
                  }}
                />
              </div>
            </div>

            {/* Inventory Tables */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                {invSubTab === 'ingredients' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ingredient</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>In Store Qty</th>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unit</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cost / Unit</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Asset Value</th>
                        <th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIngs.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No ingredients found.</td></tr>
                      ) : filteredIngs.map((ing, idx) => {
                        const isLow = Number(ing.quantity) <= Number(ing.minAlert || 5)
                        return (
                          <tr key={ing.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                            <td style={{ padding: '12px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>{ing.name}</td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: isLow ? '#DC2626' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{ing.quantity}</td>
                            <td style={{ padding: '12px 18px', color: 'var(--text-secondary)' }}>{ing.unit}</td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                              {ing.costPerUnit > 0 ? formatMoney(ing.costPerUnit) : '0.00 ETB'}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatMoney(ing.totalValue || 0)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: isLow ? 'rgba(220,38,38,0.1)' : 'rgba(5,150,105,0.1)', color: isLow ? '#DC2626' : '#059669' }}>
                                {isLow ? 'LOW STOCK' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}

                {invSubTab === 'retail' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Article Name</th>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category / Type</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Store Stock</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bar Stock</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cost Price</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Retail Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No articles found.</td></tr>
                      ) : filteredItems.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                          <td style={{ padding: '12px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</td>
                          <td style={{ padding: '12px 18px', color: 'var(--text-muted)' }}>
                            {item.category?.name || 'Uncategorized'} {item.isRecipe ? '· Recipe' : '· Retail'}
                          </td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                            {item.isRecipe ? '—' : item.stockQuantity}
                          </td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {item.isRecipe ? '—' : (item.barQuantity ?? 0)}
                          </td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {item.isRecipe ? (item.recipeCost ? formatMoney(item.recipeCost) : '0.00') : formatMoney(item.costPrice || 0)}
                          </td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatMoney(item.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {invSubTab === 'lowstock' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item Name</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Stock</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Threshold</th>
                        <th style={{ padding: '12px 18px', textAlign: 'center', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLowStock.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                            <CheckCircle2 size={24} style={{ color: 'var(--success)', margin: '0 auto 8px auto', display: 'block' }} />
                            All stock items are comfortably above threshold.
                          </td>
                        </tr>
                      ) : filteredLowStock.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--black-border)', background: 'rgba(239,68,68,0.02)' }}>
                          <td style={{ padding: '12px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '800', color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{item.stockQuantity}</td>
                          <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{item.lowStockThreshold}</td>
                          <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#DC2626', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                              REORDER
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 13. TAB 9: INVENTORY AUDIT TRAIL                             */}
      {/* ============================================================ */}
      {activeTab === 'inventory-logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Inventory Control & Audit Trail
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              Historical movements, intake additions, transfers, and spoilage records
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timestamp</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Article</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Source</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delta</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Previous</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>New</th>
                    <th style={{ padding: '12px 18px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.inventoryLogs || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        No inventory audit logs found.
                      </td>
                    </tr>
                  ) : (data.inventoryLogs || []).map((log, idx) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                      <td style={{ padding: '12px 18px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: '600', color: 'var(--text-primary)' }}>{log.itemName}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--text-secondary)' }}>{log.type}</td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: 'var(--black-hover)', color: 'var(--text-primary)' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '700', color: log.action.startsWith('WASTE') ? '#DC2626' : '#059669', fontVariantNumeric: 'tabular-nums' }}>
                        {log.action.startsWith('WASTE') ? `-${log.quantity}` : `+${log.quantity}`}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{log.prevQty}</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{log.newQty}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--text-secondary)' }}>{log.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
