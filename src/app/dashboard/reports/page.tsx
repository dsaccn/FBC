'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { 
  Printer, 
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
  Calendar
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
  const [showCustomDate, setShowCustomDate] = useState(false)

  const setQuickDate = (type: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    setQuickDateActive(type)
    setShowCustomDate(false)
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
    // Poll reports data every 30s to keep reports live
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

  function printReport() { window.print() }

  function exportCategorizedToExcel() {
    if (!data || !data.categorizedReport) return

    const report = data.categorizedReport
    const dateLabel = from || to
      ? `from ${from || 'Start'} to ${to || 'End'}`
      : `at the day of ${new Date().toLocaleDateString('en-US')}`

    const tdBase = `border:1px solid #D1D5DB;padding:6px 10px;font-family:Arial,sans-serif;font-size:10pt;`
    const numTd = `${tdBase}text-align:right;`

    let bodyRows = ''

    report.categories.forEach(cat => {
      // Category heading row (teal)
      bodyRows += `<tr style="background-color:#4F727C;color:#FFFFFF;">
        <td colspan="7" style="${tdBase}font-weight:bold;font-size:11pt;text-transform:uppercase;background-color:#4F727C;color:#FFFFFF;border:1px solid #4F727C;">${cat.categoryName}</td>
      </tr>`

      cat.subCategories.forEach(sub => {
        // Sub-category heading row (light blue-grey)
        bodyRows += `<tr style="background-color:#CED9DC;color:#1F2937;">
          <td style="${tdBase}background-color:#CED9DC;"></td>
          <td colspan="6" style="${tdBase}font-weight:bold;text-transform:uppercase;background-color:#CED9DC;color:#1F2937;">${sub.subCategoryName}</td>
        </tr>`

        sub.articles.forEach(art => {
          bodyRows += `<tr style="background-color:#FFFFFF;color:#374151;">
            <td style="${tdBase}"></td>
            <td style="${tdBase}"></td>
            <td style="${tdBase}font-family:Courier New,monospace;">${art.code}</td>
            <td style="${tdBase}">${art.name}</td>
            <td style="${numTd}">${art.quantity.toFixed(2)}</td>
            <td style="${numTd}">${art.avgAmount.toFixed(2)}</td>
            <td style="${numTd}font-weight:600;">${art.totalAmount.toFixed(2)}</td>
          </tr>`
        })

        // Sub-category total row
        bodyRows += `<tr style="background-color:#F3F4F6;color:#111827;font-weight:bold;">
          <td style="${tdBase}background-color:#F3F4F6;"></td>
          <td style="${tdBase}background-color:#F3F4F6;"></td>
          <td style="${tdBase}background-color:#F3F4F6;"></td>
          <td style="${tdBase}background-color:#F3F4F6;">${sub.subCategoryName} Total</td>
          <td style="${numTd}background-color:#F3F4F6;">${sub.totalQuantity.toFixed(2)}</td>
          <td style="${tdBase}background-color:#F3F4F6;"></td>
          <td style="${numTd}background-color:#F3F4F6;">${sub.totalRevenue.toFixed(2)}</td>
        </tr>`
      })

      // Category total row
      bodyRows += `<tr style="background-color:#E5E7EB;color:#111827;font-weight:bold;">
        <td style="${tdBase}background-color:#E5E7EB;"></td>
        <td style="${tdBase}background-color:#E5E7EB;"></td>
        <td style="${tdBase}background-color:#E5E7EB;"></td>
        <td style="${tdBase}background-color:#E5E7EB;">${cat.categoryName} Total</td>
        <td style="${numTd}background-color:#E5E7EB;">${cat.totalQuantity.toFixed(2)}</td>
        <td style="${tdBase}background-color:#E5E7EB;"></td>
        <td style="${numTd}background-color:#E5E7EB;">${cat.totalRevenue.toFixed(2)}</td>
      </tr>`
    })

    const summaryRows = [
      ['Sub Total', report.subTotal.toFixed(2), '#F9FAFB'],
      ['Discount', report.discount.toFixed(2), '#F9FAFB'],
      ['Grand Total', report.grandTotal.toFixed(2), '#E5E7EB'],
    ].map(([label, value, bg], i) => `
      <tr style="background-color:${bg};${i === 2 ? 'font-weight:bold;font-size:11pt;border-top:3px double #111827;' : 'font-weight:600;'}">
        <td colspan="5" style="${tdBase}border:none;background-color:#FFFFFF;"></td>
        <td style="${tdBase}color:#4B5563;background-color:${bg};">${label}</td>
        <td style="${numTd}color:#111827;background-color:${bg};">${value}</td>
      </tr>`).join('')

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Sales Report</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
          td, th { border: 1px solid #D1D5DB; }
        </style>
      </head>
      <body>
        <p style="text-align:center;font-size:16pt;font-weight:bold;font-family:Arial,sans-serif;margin-bottom:4px;color:#1F2937;">Categorized And Summarized By Article</p>
        <p style="text-align:center;font-size:10pt;font-family:Arial,sans-serif;color:#4B5563;margin-bottom:16px;">
          Cash Sales Voucher Report filtered by Void State = Not Void, ${dateLabel}
        </p>
        <table>
          <colgroup>
            <col width="120" style="width:90pt;"></col>
            <col width="150" style="width:110pt;"></col>
            <col width="110" style="width:80pt;"></col>
            <col width="220" style="width:160pt;"></col>
            <col width="90" style="width:65pt;"></col>
            <col width="110" style="width:80pt;"></col>
            <col width="120" style="width:90pt;"></col>
          </colgroup>
          <thead>
            <tr style="background-color:#4F727C;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Category</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Sub Category</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Article Code</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Article Name</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Quantity</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Avg Amount</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Total Amount</th>
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
    const dateLabel = from || to
      ? `from ${from || 'Start'} to ${to || 'End'}`
      : `at the day of ${new Date().toLocaleDateString('en-US')}`

    const tdBase = `border:1px solid #D1D5DB;padding:6px 10px;font-family:Arial,sans-serif;font-size:10pt;`
    const numTd = `${tdBase}text-align:right;`

    let itemRows = ''
    items.forEach(it => {
      const marginColor = it.profitMargin >= 50 ? '#047857' : it.profitMargin >= 25 ? '#B45309' : '#B91C1C'
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
        <td style="${numTd}font-weight:600;color:${it.grossProfit >= 0 ? '#047857' : '#B91C1C'};">${it.grossProfit.toFixed(2)}</td>
        <td style="${numTd}font-weight:600;color:${marginColor};">${it.profitMargin.toFixed(1)}%</td>
      </tr>`
    })

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Profit and Loss</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
          td, th { border: 1px solid #D1D5DB; }
        </style>
      </head>
      <body>
        <p style="text-align:center;font-size:16pt;font-weight:bold;font-family:Arial,sans-serif;margin-bottom:4px;color:#1F2937;">Profit & Loss Statement</p>
        <p style="text-align:center;font-size:10pt;font-family:Arial,sans-serif;color:#4B5563;margin-bottom:16px;">
          Generated ${dateLabel}
        </p>

        <!-- Executive Summary Table -->
        <table style="margin-bottom:20px;width:420px;">
          <tr style="background-color:#1E293B;color:#FFFFFF;font-weight:bold;">
            <th style="${tdBase}text-align:left;background-color:#1E293B;color:#FFFFFF;">Financial Metric</th>
            <th style="${numTd}background-color:#1E293B;color:#FFFFFF;">Amount (ETB)</th>
          </tr>
          <tr><td style="${tdBase}">Gross Revenue</td><td style="${numTd}font-weight:bold;">${data.totalRevenue.toFixed(2)}</td></tr>
          <tr><td style="${tdBase}">Cost of Goods Sold (COGS)</td><td style="${numTd}color:#B91C1C;">${(data.totalCOGS || 0).toFixed(2)}</td></tr>
          <tr style="background-color:#F0FDF4;"><td style="${tdBase}font-weight:bold;">Gross Profit</td><td style="${numTd}font-weight:bold;color:#047857;">${(data.grossProfit || 0).toFixed(2)}</td></tr>
          <tr><td style="${tdBase}">Overall Profit Margin</td><td style="${numTd}font-weight:bold;">${(data.profitMargin ?? 0).toFixed(1)}%</td></tr>
          ${data.inventoryValuation ? `
          <tr style="background-color:#F8FAFC;"><td style="${tdBase}">Store Raw Ingredients Valuation</td><td style="${numTd}">${data.inventoryValuation.ingredientValue.toFixed(2)}</td></tr>
          <tr style="background-color:#F8FAFC;"><td style="${tdBase}">Retail Finished Stock Valuation</td><td style="${numTd}">${data.inventoryValuation.retailValue.toFixed(2)}</td></tr>
          <tr style="background-color:#FEF3C7;"><td style="${tdBase}font-weight:bold;">Total Inventory Asset Valuation</td><td style="${numTd}font-weight:bold;color:#92400E;">${data.inventoryValuation.totalValue.toFixed(2)}</td></tr>
          ` : ''}
        </table>

        <!-- Item Detail Table -->
        <table>
          <thead>
            <tr style="background-color:#4F727C;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Item Name</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Category</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Type</th>
              <th style="${tdBase}text-align:left;font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Cost Method</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Qty Sold</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Selling Price</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Cost Price</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Revenue</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Total Cost</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Gross Profit</th>
              <th style="${numTd}font-weight:bold;background-color:#4F727C;color:#FFFFFF;">Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
            <tr style="background-color:#E5E7EB;font-weight:bold;border-top:3px double #111827;">
              <td colspan="4" style="${tdBase}">TOTAL</td>
              <td style="${numTd}">${items.reduce((s, it) => s + it.quantity, 0)}</td>
              <td style="${tdBase}">-</td>
              <td style="${tdBase}">-</td>
              <td style="${numTd}">${data.totalRevenue.toFixed(2)}</td>
              <td style="${numTd}">${(data.totalCOGS || 0).toFixed(2)}</td>
              <td style="${numTd}">${(data.grossProfit || 0).toFixed(2)}</td>
              <td style="${numTd}">${(data.profitMargin ?? 0).toFixed(1)}%</td>
            </tr>
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

  const tabs = [
    { id: 'summary', label: 'Dashboard', icon: <TrendingUp size={14}/> },
    { id: 'profit-loss', label: 'Profit & Loss', icon: <PieChart size={14}/> },
    { id: 'daily', label: 'Daily Sales', icon: <DollarSign size={14}/> },
    { id: 'categorized', label: 'Categorized Report', icon: <TrendingUp size={14}/> },
    { id: 'history', label: 'Transaction History', icon: <ShoppingBag size={14}/> },
    { id: 'best-sellers', label: 'Best Sellers', icon: <TrendingUp size={14}/> },
    { id: 'staff', label: 'Staff Performance', icon: <TrendingUp size={14}/> },
    { id: 'cancellations', label: 'Cancellations', icon: <XCircle size={14}/> },
    { id: 'inventory', label: 'Inventory Valuation', icon: <Boxes size={14}/> },
    { id: 'inventory-logs', label: 'Inventory Control Log', icon: <RefreshCw size={14}/> }
  ]

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--gold)' }}>
      <RefreshCw className="animate-spin" size={40} style={{ marginBottom: '16px' }} />
      <div className="font-cinzel" style={{ fontSize: '18px' }}>Gathering Intelligence...</div>
    </div>
  )
  
  if (!data) return null

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
  }

  const avgOrderValue = data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0

  // Colors for charts
  const methodColors = ['#D4AF37', '#52B788', '#F4A261', '#E63946', '#4A4E69']

  return (
    <div className="animate-fade-in no-print" style={{ paddingBottom: '40px', width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
      {/* ============================================================ */}
      {/* MOBILE-ONLY TOP SECTION (Ultra-compact, zero-scroll layout)  */}
      {/* ============================================================ */}
      <div className="mobile-only" style={{ marginBottom: '16px' }}>
        {/* Mobile Header: Title + Sync & Print icons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <div>
            <h1 className="font-cinzel" style={{ fontSize: '18px', fontWeight: '700', lineHeight: 1.2, margin: 0 }}>
              <span className="gold-text">Business Intelligence</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: '2px 0 0 0' }}>
              Advanced Analytics & Reports
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={triggerSyncAndRefresh}
              disabled={syncing || loading}
              style={{ padding: '6px 10px', height: '32px', minHeight: '32px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Sync & Refresh Data"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? '...' : 'Sync'}</span>
            </button>
            <button
              className="btn btn-gold btn-sm"
              onClick={printReport}
              style={{ padding: '6px 10px', height: '32px', minHeight: '32px', fontSize: '11px' }}
              title="Print report"
            >
              <Printer size={13} />
            </button>
          </div>
        </div>

        {/* Mobile Quick Date Preset Filter Bar */}
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '10px', padding: '8px 10px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }} className="hide-scrollbar">
            {([
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ] as const).map(p => {
              const isActive = quickDateActive === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setQuickDate(p.id)
                    setQuickDateActive(p.id)
                    setShowCustomDate(false)
                  }}
                  style={{
                    padding: '5px 10px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap',
                    fontWeight: isActive ? '700' : '500',
                    background: isActive ? 'var(--gold)' : 'transparent',
                    color: isActive ? '#000' : 'var(--text-secondary)',
                    border: isActive ? '1px solid var(--gold)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setShowCustomDate(!showCustomDate)}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
                fontWeight: quickDateActive === 'custom' || showCustomDate ? '700' : '500',
                background: quickDateActive === 'custom' || showCustomDate ? 'rgba(212,175,55,0.2)' : 'transparent',
                color: quickDateActive === 'custom' || showCustomDate ? 'var(--gold)' : 'var(--text-secondary)',
                border: quickDateActive === 'custom' || showCustomDate ? '1px solid var(--gold)' : '1px solid var(--black-border)',
                cursor: 'pointer'
              }}
            >
              📅 {showCustomDate ? 'Hide' : 'Custom'}
            </button>
          </div>

          {/* Collapsible Custom Date Pickers */}
          {showCustomDate && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--black-border)', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="date"
                className="input"
                style={{ flex: 1, padding: '5px 8px', fontSize: '11px', minWidth: 0 }}
                value={from}
                onChange={e => {
                  setFrom(e.target.value)
                  setQuickDateActive('custom')
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
              <input
                type="date"
                className="input"
                style={{ flex: 1, padding: '5px 8px', fontSize: '11px', minWidth: 0 }}
                value={to}
                onChange={e => {
                  setTo(e.target.value)
                  setQuickDateActive('custom')
                }}
              />
            </div>
          )}
        </div>

        {/* Mobile 2x2 Micro-Metric Summary Grid (~95px total height!) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '12px', width: '100%', maxWidth: '100%' }}>
          {/* Revenue */}
          <div style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(20,20,20,0.8) 100%)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '10px', padding: '9px 11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Total Revenue</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: '2px 0', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatMoney(data.totalRevenue)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{data.totalOrders} paid orders</div>
          </div>

          {/* Gross Profit */}
          <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(20,20,20,0.8) 100%)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '10px', padding: '9px 11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--success-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Gross Profit</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: (data.grossProfit || 0) >= 0 ? 'var(--success-light)' : 'var(--danger-light)', margin: '2px 0', wordBreak: 'break-word', lineHeight: 1.2 }}>
              {formatMoney(data.grossProfit || 0)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(data.profitMargin ?? 0).toFixed(0)}% return</div>
          </div>

          {/* Cost / COGS */}
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '8px 11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--danger-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Cost of Goods</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '2px 0', wordBreak: 'break-word', lineHeight: 1.2 }}>{formatMoney(data.totalCOGS || 0)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Avg bill: {formatMoney(avgOrderValue)}</div>
          </div>

          {/* Profit Margin */}
          <div style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(20,20,20,0.8) 100%)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '10px', padding: '8px 11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Profit Margin</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#c084fc', margin: '2px 0', lineHeight: 1.2 }}>{(data.profitMargin ?? 0).toFixed(1)}%</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Return on sales</div>
          </div>
        </div>

        {/* Mobile Stock Asset Valuation Banner */}
        {data.inventoryValuation && (
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(20,20,20,0.85) 100%)', 
            border: '1px solid rgba(212,175,55,0.3)', 
            borderRadius: '10px', 
            padding: '8px 12px', 
            marginBottom: '12px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            fontSize: '11px' 
          }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Package size={11} color="var(--gold)" /> Stock Asset Valuation
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#fff', marginTop: '1px' }}>
                {formatMoney(data.inventoryValuation.totalValue)}
              </div>
            </div>
            <div style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '10px', lineHeight: 1.4 }}>
              <div>Raw Store: <b style={{ color: 'var(--gold-light)' }}>{formatMoney(data.inventoryValuation.ingredientValue)}</b></div>
              <div>Retail Stock: <b style={{ color: 'var(--text-primary)' }}>{formatMoney(data.inventoryValuation.retailValue)}</b></div>
            </div>
          </div>
        )}

        {/* Mobile Sticky Section Selector */}
        <div style={{ position: 'sticky', top: '60px', zIndex: 120, background: 'rgba(12,12,12,0.95)', backdropFilter: 'blur(10px)', padding: '6px 0', borderBottom: '1px solid var(--black-border)', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              📊 Selected Report:
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              Tap below to switch
            </span>
          </div>
          <select
            className="input"
            value={activeTab}
            onChange={e => setActiveTab(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              fontWeight: '700',
              borderRadius: '8px',
              background: '#1a1a1a',
              color: 'var(--gold-light)',
              border: '1.5px solid var(--gold-dark)',
              outline: 'none'
            }}
          >
            {tabs.map(t => (
              <option key={t.id} value={t.id} style={{ background: '#181818', color: '#fff' }}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DESKTOP-ONLY TOP SECTION (Grand luxury layout)               */}
      {/* ============================================================ */}
      <div className="desktop-only">
        {/* Header Title & Main Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="font-cinzel" style={{ fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: '700', textShadow: '0 2px 10px rgba(212,175,55,0.2)' }}>
              <span className="gold-text">Business Intelligence</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Advanced Analytics & Financial Performance
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={triggerSyncAndRefresh}
              disabled={syncing || loading}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid var(--black-border)',
                background: 'rgba(20,20,20,0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px'
              }}
              title="Sync & Refresh Data"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} color="var(--gold)" />
              <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
            </button>
            <button
              className="btn btn-gold btn-sm"
              onClick={printReport}
              style={{
                height: '38px',
                padding: '0 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(212,175,55,0.25)'
              }}
            >
              <Printer size={15} /> Print Report
            </button>
          </div>
        </div>

        {/* Unified Luxury Filter Toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: 'linear-gradient(135deg, rgba(20,20,20,0.9) 0%, rgba(15,15,15,0.95) 100%)',
          border: '1px solid rgba(212,175,55,0.25)',
          padding: '8px 14px',
          borderRadius: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)'
        }}>
          {/* Left: Period Presets (Segmented Pill Switcher) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>
              Period:
            </span>
            <div style={{
              display: 'inline-flex',
              background: 'rgba(0,0,0,0.5)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.06)',
              gap: '2px'
            }}>
              {(['today', 'yesterday', 'week', 'month', 'all'] as const).map(p => {
                const labels: Record<string, string> = { today: 'Today', yesterday: 'Yesterday', week: '7 Days', month: 'Month', all: 'All Time' }
                const isActive = quickDateActive === p
                return (
                  <button
                    key={p}
                    type="button"
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: isActive ? '700' : '500',
                      borderRadius: '6px',
                      border: 'none',
                      background: isActive ? 'var(--gold)' : 'transparent',
                      color: isActive ? '#000' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(212,175,55,0.35)' : 'none',
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => setQuickDate(p)}
                  >
                    {labels[p]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: Custom Date Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,0,0,0.5)',
              padding: '5px 12px',
              borderRadius: '8px',
              border: quickDateActive === 'custom' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)'
            }}>
              <Calendar size={15} color={quickDateActive === 'custom' ? 'var(--gold)' : 'var(--text-muted)'} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Custom:
              </span>
              <input
                type="date"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                  colorScheme: 'dark',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
                value={from}
                onChange={e => { setFrom(e.target.value); setQuickDateActive('custom') }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
              <input
                type="date"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                  colorScheme: 'dark',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
                value={to}
                onChange={e => { setTo(e.target.value); setQuickDateActive('custom') }}
              />
              {(from || to) && quickDateActive === 'custom' && (
                <button
                  type="button"
                  onClick={() => setQuickDate('all')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger-light)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '0 4px',
                    fontWeight: 'bold'
                  }}
                  title="Clear custom range"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 7 KPI Cards for Desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {/* Total Revenue */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.02) 100%)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Total Revenue</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{formatMoney(data.totalRevenue)}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(212,175,55,0.2)', borderRadius: '10px', color: 'var(--gold)', flexShrink: 0 }}><DollarSign size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Gross sales collected</div>
          </div>

          {/* Total Cost (COGS) */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.02) 100%)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--danger-light)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Total Cost (COGS)</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatMoney(data.totalCOGS || 0)}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(239,68,68,0.2)', borderRadius: '10px', color: 'var(--danger-light)', flexShrink: 0 }}><ShoppingBag size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Purchased item expense</div>
          </div>

          {/* Gross Profit */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.02) 100%)', border: '1px solid rgba(16,185,129,0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--success-light)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Gross Profit</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: (data.grossProfit || 0) >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                  {formatMoney(data.grossProfit || 0)}
                </div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(16,185,129,0.2)', borderRadius: '10px', color: 'var(--success-light)', flexShrink: 0 }}><TrendingUp size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Revenue minus costs</div>
          </div>

          {/* Profit Margin */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.02) 100%)', border: '1px solid rgba(168,85,247,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Profit Margin</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#c084fc' }}>
                  {(data.profitMargin ?? 0).toFixed(1)}%
                </div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(168,85,247,0.2)', borderRadius: '10px', color: '#c084fc', flexShrink: 0 }}><Percent size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Return on sales</div>
          </div>

          {/* Average Order Value */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(244,162,97,0.15) 0%, rgba(244,162,97,0.02) 100%)', border: '1px solid rgba(244,162,97,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--warning-light)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Avg Order Value</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatMoney(avgOrderValue)}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(244,162,97,0.2)', borderRadius: '10px', color: 'var(--warning-light)', flexShrink: 0 }}><TrendingUp size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Average bill size</div>
          </div>

          {/* Stock Asset Valuation */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(20,20,20,0.85) 100%)', border: '1px solid rgba(212,175,55,0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>Stock Assets Valuation</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{formatMoney(data.inventoryValuation?.totalValue || 0)}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(212,175,55,0.2)', borderRadius: '10px', color: 'var(--gold)', flexShrink: 0 }}><Package size={18}/></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Raw: {formatMoney(data.inventoryValuation?.ingredientValue || 0)} · Retail: {formatMoney(data.inventoryValuation?.retailValue || 0)}
            </div>
          </div>
        </div>

        {/* Tabs (Horizontal Scrollable Pills for Desktop) */}
        <div className="reports-tabs-scroll hide-scrollbar" style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid var(--black-border)' }}>
          {tabs.map(t => (
            <button key={t.id} className={`btn btn-sm ${activeTab === t.id ? 'btn-gold' : 'btn-ghost'}`} style={{ whiteSpace: 'nowrap', borderRadius: '8px 8px 0 0', borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent', padding: '10px 16px' }} onClick={() => setActiveTab(t.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {t.icon}
                <span style={{ fontWeight: activeTab === t.id ? '600' : '400' }}>{t.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Summary Dashboard */}
      {activeTab === 'summary' && (
        <div className="reports-dashboard-grid">
          
          {/* Daily Sales Bar Chart (CSS) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
            <h3 style={{ fontWeight: '600', marginBottom: '24px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={18} color="var(--gold)" /> Daily Revenue Trends
              </span>
              <span className="mobile-only" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: 'auto' }}>
                Swipe ↔ to view
              </span>
            </h3>
            {data.dailySales.length > 0 ? (
              <div className="hide-scrollbar" style={{ overflowX: 'auto', paddingBottom: '8px', width: '100%', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ minWidth: '450px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ position: 'relative', height: '220px', display: 'flex', alignItems: 'flex-end', gap: '6px', borderBottom: '2px solid var(--black-border)', marginBottom: '8px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => {
                      const maxRev = Math.max(...data.dailySales.slice(0, 14).map(d => d.revenue))
                      const heightPct = maxRev > 0 ? Math.max((day.revenue / maxRev) * 100, 4) : 4
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }} title={`${new Date(day.date).toLocaleDateString()} — ${formatMoney(day.revenue)}`}>
                          <div style={{ width: '100%', height: `${heightPct}%`, background: 'linear-gradient(to top, var(--gold-dark, #a87b20), var(--gold, #d4af37))', borderRadius: '4px 4px 0 0', transition: 'filter 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.3)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(day.date).getDate()}/{new Date(day.date).getMonth() + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No daily sales data yet.</div>
            )}
            <style dangerouslySetInnerHTML={{__html: `
              .bar-hover:hover { filter: brightness(1.3); }
            `}} />
          </div>

          {/* Payment Method Donut Chart */}
          <div className="card">
            <h3 style={{ fontWeight: '600', marginBottom: '24px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} color="var(--gold)" /> Revenue by Method
            </h3>
            
            {Object.keys(data.revenueByMethod).length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px', position: 'relative' }}>
                  {/* CSS Donut Chart */}
                  <div style={{ width: '180px', height: '180px', borderRadius: '50%', position: 'relative', background: (() => {
                    let acc = 0;
                    const segments = Object.entries(data.revenueByMethod).map(([method, amt], i) => {
                      const pct = (amt / data.totalRevenue) * 100;
                      const start = acc;
                      acc += pct;
                      return `${methodColors[i % methodColors.length]} ${start}% ${acc}%`;
                    }).join(', ');
                    return `conic-gradient(${segments})`;
                  })() }}>
                    {/* Inner hole for donut */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '110px', height: '110px', background: 'var(--black-card)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total</span>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)' }}>{data.totalRevenue > 9999 ? (data.totalRevenue/1000).toFixed(1)+'k' : data.totalRevenue.toFixed(0)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(data.revenueByMethod).map(([method, amount], i) => {
                    const pct = data.totalRevenue > 0 ? (amount / data.totalRevenue) * 100 : 0
                    return (
                      <div key={method} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: methodColors[i % methodColors.length] }} />
                          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{method}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600' }}>{formatMoney(amount)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>No payment data yet.</div>
            )}
          </div>

          {/* Executive Profitability & Expense Bar */}
          <div className="card" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, rgba(20,20,20,0.8), rgba(30,25,15,0.9))', border: '1px solid var(--black-border)', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontWeight: '600', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PieChart size={18} color="var(--gold)" /> Profit & Expense Allocation
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Visual split between cost of goods sold (purchase expense) and gross profit
                </p>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveTab('profit-loss')}>
                Open Full P&L Report →
              </button>
            </div>

            {data.totalRevenue > 0 ? (() => {
              const cogsPct = Math.min(100, Math.max(0, ((data.totalCOGS || 0) / data.totalRevenue) * 100))
              const profitPct = Math.max(0, 100 - cogsPct)
              return (
                <div>
                  <div style={{ height: '22px', borderRadius: '11px', overflow: 'hidden', display: 'flex', background: 'var(--black-card)', border: '1px solid var(--black-border)', marginBottom: '16px' }}>
                    <div style={{ width: `${cogsPct}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', transition: 'width 0.4s' }} title={`COGS: ${cogsPct.toFixed(1)}%`} />
                    <div style={{ width: `${profitPct}%`, background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.4s' }} title={`Gross Profit: ${profitPct.toFixed(1)}%`} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Cost of Goods (COGS):</span>
                      <b style={{ color: 'var(--text-primary)' }}>{formatMoney(data.totalCOGS || 0)}</b>
                      <span style={{ color: 'var(--danger-light)', fontSize: '12px' }}>({cogsPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Gross Profit:</span>
                      <b style={{ color: 'var(--text-primary)' }}>{formatMoney(data.grossProfit || 0)}</b>
                      <span style={{ color: 'var(--success-light)', fontSize: '12px' }}>({profitPct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              )
            })() : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No revenue recorded in this period yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Advanced Tables Helper Component */}
      {(() => {
        const renderResponsiveTable = <T extends any>(
          columns: string[],
          items: T[],
          desktopRowRenderer: (item: T, index: number) => React.ReactNode,
          mobileCardRenderer: (item: T, index: number) => React.ReactNode,
          emptyMessage: string
        ) => {
          const isEmpty = items.length === 0
          return (
            <>
              {/* Desktop Table View */}
              <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--black-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', width: '100%' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--black-border)' }}>
                        {columns.map(h => (
                          <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {isEmpty ? (
                        <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>{emptyMessage}</td></tr>
                      ) : (
                        items.map((item, idx) => desktopRowRenderer(item, idx))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-only" style={{ width: '100%' }}>
                {isEmpty ? (
                  <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{emptyMessage}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {items.map((item, idx) => mobileCardRenderer(item, idx))}
                  </div>
                )}
              </div>
            </>
          )
        }

        if (activeTab === 'profit-loss') {
          const totalRev = data.totalRevenue || 0
          const totalCost = data.totalCOGS || 0
          const grossProf = data.grossProfit || 0
          const overallMargin = data.profitMargin ?? 0
          const cogsPct = totalRev > 0 ? Math.min(100, Math.max(0, (totalCost / totalRev) * 100)) : 0
          const profitPct = totalRev > 0 ? Math.max(0, 100 - cogsPct) : 0

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              
              {/* Header Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 className="font-cinzel" style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <PieChart size={22} color="var(--gold)" /> Profit & Loss Statement (P&L)
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                    Cost of Goods Sold (COGS), Gross Profit, and Margin breakdown across items and categories
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button className="btn btn-gold btn-sm" onClick={exportProfitLossToExcel}>
                    <Download size={15} style={{ marginRight: '6px' }} /> Export P&L to Excel
                  </button>
                </div>
              </div>

              {/* Section A: Financial Executive Overview Card */}
              <div className="card" style={{ background: 'linear-gradient(135deg, rgba(20,20,20,0.85), rgba(30,25,12,0.9))', border: '1px solid rgba(212,175,55,0.25)' }}>
                <div style={{ fontSize: '12px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginBottom: '16px' }}>
                  Executive Financial Summary
                </div>

                {/* 5 Mini Cards in Grid */}
                <div className="reports-pl-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  <div className="reports-pl-card" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '10px', border: '1px solid var(--black-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Sales Revenue</div>
                    <div className="reports-pl-value" style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatMoney(totalRev)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '4px' }}>100% of income</div>
                  </div>

                  <div className="reports-pl-card" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--danger-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Cost of Goods (COGS)</div>
                    <div className="reports-pl-value" style={{ fontSize: '22px', fontWeight: '700', color: 'var(--danger-light)' }}>{formatMoney(totalCost)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{cogsPct.toFixed(1)}% of revenue</div>
                  </div>

                  <div className="reports-pl-card" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(160,185,129,0.25)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--success-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Gross Profit</div>
                    <div className="reports-pl-value" style={{ fontSize: '22px', fontWeight: '700', color: grossProf >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                      {formatMoney(grossProf)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{profitPct.toFixed(1)}% of revenue</div>
                  </div>

                  <div className="reports-pl-card" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.25)' }}>
                    <div style={{ fontSize: '11px', color: '#c084fc', textTransform: 'uppercase', marginBottom: '4px' }}>Gross Profit Margin</div>
                    <div className="reports-pl-value" style={{ fontSize: '22px', fontWeight: '700', color: '#c084fc' }}>{overallMargin.toFixed(1)}%</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Net return rate</div>
                  </div>

                  <div className="reports-pl-card" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.25)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '4px' }}>Stock Valuation</div>
                    <div className="reports-pl-value" style={{ fontSize: '22px', fontWeight: '700', color: 'var(--gold)' }}>{formatMoney(data.inventoryValuation?.totalValue || 0)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Raw: {formatMoney(data.inventoryValuation?.ingredientValue || 0)}</div>
                  </div>
                </div>

                {/* Revenue Split Horizontal Bar */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Revenue Allocation</span>
                    <span style={{ color: 'var(--text-muted)' }}>Cost ({cogsPct.toFixed(1)}%) vs Profit ({profitPct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: '22px', borderRadius: '11px', overflow: 'hidden', display: 'flex', background: 'var(--black-card)', border: '1px solid var(--black-border)' }}>
                    <div style={{ width: `${cogsPct}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', transition: 'width 0.4s' }} title={`COGS: ${formatMoney(totalCost)} (${cogsPct.toFixed(1)}%)`} />
                    <div style={{ width: `${profitPct}%`, background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.4s' }} title={`Gross Profit: ${formatMoney(grossProf)} (${profitPct.toFixed(1)}%)`} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ef4444' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>COGS:</span>
                      <b style={{ color: 'var(--danger-light)' }}>{formatMoney(totalCost)}</b>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Gross Profit:</span>
                      <b style={{ color: 'var(--success-light)' }}>{formatMoney(grossProf)}</b>
                    </div>
                  </div>
                </div>

                {/* Collapsible Info Callout */}
                <details style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
                  <summary style={{ color: 'var(--gold)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', outline: 'none' }}>
                    <Info size={15} color="var(--gold)" />
                    <span>How COGS & Recipe Costs are calculated (tap to view)</span>
                  </summary>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(212,175,55,0.1)' }}>
                    Cost of Goods Sold (COGS) is computed automatically:
                    <ul style={{ paddingLeft: '18px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>
                        <b>Prepared Drinks & Food (e.g. STRAWBERRY MOJITO, COCKTAILS, FRESH JUICE):</b> Cost is calculated dynamically from recipe ingredients (<code style={{ color: 'var(--gold-light)' }}>∑ recipe.quantity × ingredient.costPerUnit</code>). There is no standalone finished item stock; the ingredients themselves are the cost.
                      </li>
                      <li>
                        <b>Direct Retail Goods (e.g. Water bottles, soft drinks, retail snacks):</b> Cost is taken from the item's purchase price (<code style={{ color: 'var(--gold-light)' }}>costPrice</code>).
                      </li>
                      <li>
                        If an ingredient cost is 0, update unit bought prices in <b>Inventory / Store</b> to see exact profitability.
                      </li>
                    </ul>
                  </div>
                </details>
              </div>

              {/* Section B: Category Profitability (FOOD vs DRINKS) */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={16} /> Category Performance Comparison
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '16px', width: '100%', maxWidth: '100%' }}>
                  {(data.profitByCategory && data.profitByCategory.length > 0) ? (
                    data.profitByCategory.map(cat => {
                      const isFood = cat.category === 'FOOD'
                      const badgeColor = isFood ? '#f59e0b' : '#38bdf8'
                      const bgGradient = isFood 
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(20,20,20,0.6) 100%)' 
                        : 'linear-gradient(135deg, rgba(56,189,248,0.08) 0%, rgba(20,20,20,0.6) 100%)'
                      const borderCol = isFood ? 'rgba(245,158,11,0.3)' : 'rgba(56,189,248,0.3)'

                      return (
                        <div key={cat.category} className="card" style={{ background: bgGradient, border: `1px solid ${borderCol}`, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44`, textTransform: 'uppercase' }}>
                                {cat.category}
                              </span>
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{cat.quantity} units sold</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '18px', fontWeight: '700', color: cat.profitMargin >= 50 ? 'var(--success-light)' : cat.profitMargin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)' }}>
                                {cat.profitMargin.toFixed(1)}%
                              </span>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Margin</div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '8px', background: 'var(--black-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gold)', marginTop: '2px', wordBreak: 'break-word' }}>{formatMoney(cat.revenue)}</div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>COGS</div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--danger-light)', marginTop: '2px', wordBreak: 'break-word' }}>{formatMoney(cat.cost)}</div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit</div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success-light)', marginTop: '2px', wordBreak: 'break-word' }}>{formatMoney(cat.grossProfit)}</div>
                            </div>
                          </div>

                          {/* Category Margin Bar */}
                          <div>
                            <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, cat.profitMargin))}%`, background: cat.profitMargin >= 50 ? 'var(--success-light)' : cat.profitMargin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)', borderRadius: '3px' }} />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
                      No category profit breakdown available for this period.
                    </div>
                  )}
                </div>
              </div>

              {/* Section C: Per-Item Profit Breakdown Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Per-Item Profitability Breakdown ({filteredItems.length} items)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Filtered Gross Profit: <b style={{ color: 'var(--success-light)' }}>{formatMoney(totalFilteredProfit)}</b>
                  </div>
                </div>

                {/* Filters and Controls */}
                <div className="card" style={{ padding: '14px 16px', background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                  {/* Search Input */}
                  <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '380px' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                      type="text" 
                      className="input" 
                      placeholder="Search item or category..." 
                      value={plSearch} 
                      onChange={e => setPlSearch(e.target.value)} 
                      style={{ paddingLeft: '36px', width: '100%', fontSize: '13px' }} 
                    />
                  </div>

                  {/* Type Filter Buttons */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>Type:</span>
                    {(['ALL', 'FOOD', 'DRINKS'] as const).map(t => (
                      <button
                        key={t}
                        className={`btn btn-sm ${plTypeFilter === t ? 'btn-gold' : 'btn-ghost'}`}
                        style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
                        onClick={() => setPlTypeFilter(t)}
                      >
                        {t === 'ALL' ? 'All Types' : t}
                      </button>
                    ))}
                  </div>

                  {/* Sort By Dropdown */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sort:</span>
                    <select
                      className="input"
                      value={plSortBy}
                      onChange={e => setPlSortBy(e.target.value as any)}
                      style={{ padding: '6px 12px', fontSize: '12px', minWidth: '150px' }}
                    >
                      <option value="profit">Highest Profit</option>
                      <option value="margin">Highest Margin %</option>
                      <option value="revenue">Highest Revenue</option>
                      <option value="quantity">Most Units Sold</option>
                      <option value="cost">Highest Cost</option>
                    </select>
                  </div>
                </div>

                {/* Desktop & Mobile Responsive Table */}
                {renderResponsiveTable(
                  ['Item & Category', 'Type', 'Qty Sold', 'Selling Price', 'Unit Cost', 'Revenue', 'Total Cost', 'Gross Profit', 'Margin %'],
                  filteredItems,
                  (item) => {
                    const isUnsetCost = item.costPrice === 0
                    const marginColor = item.profitMargin >= 50 ? 'var(--success-light)' : item.profitMargin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)'
                    const marginBadgeBg = item.profitMargin >= 50 ? 'rgba(16,185,129,0.12)' : item.profitMargin >= 25 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'

                    return (
                      <tr key={item.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</span>
                            {item.isRecipe && (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }} title="Cost computed dynamically from recipe ingredients">
                                🍹 Recipe
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.category}</div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: item.type === 'FOOD' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)', color: item.type === 'FOOD' ? '#f59e0b' : '#38bdf8' }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: '700', color: 'var(--text-primary)' }}>{item.quantity}</td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>{formatMoney(item.price)}</td>
                        <td style={{ padding: '14px 20px', fontSize: '13px' }}>
                          {item.isRecipe ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ color: item.costPrice > 0 ? 'var(--text-primary)' : 'var(--warning-light)', fontWeight: '600' }}>
                                {formatMoney(item.costPrice)}
                              </span>
                              <span style={{ fontSize: '10px', color: item.costPrice > 0 ? 'var(--gold)' : 'var(--warning-light)' }}>
                                {item.costPrice > 0 ? '🍹 Recipe Cost' : '⚠️ 0.00 (Set Ing. Cost)'}
                              </span>
                            </div>
                          ) : isUnsetCost ? (
                            <span style={{ fontSize: '10px', color: 'var(--warning-light)', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }} title="Cost price is 0 ETB. Set in Inventory to see true profit.">
                              ⚠️ 0.00
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>{formatMoney(item.costPrice)}</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--gold)', fontWeight: '600', fontSize: '14px' }}>{formatMoney(item.revenue)}</td>
                        <td style={{ padding: '14px 20px', color: 'var(--danger-light)', fontSize: '13px' }}>{formatMoney(item.totalCost)}</td>
                        <td style={{ padding: '14px 20px', fontWeight: '700', fontSize: '14px', color: item.grossProfit >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                          {formatMoney(item.grossProfit)}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '700', color: marginColor, background: marginBadgeBg, padding: '3px 8px', borderRadius: '12px', border: `1px solid ${marginColor}33` }}>
                            {item.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  },
                  (item) => {
                    const isUnsetCost = item.costPrice === 0
                    const marginColor = item.profitMargin >= 50 ? 'var(--success-light)' : item.profitMargin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)'

                    return (
                      <div key={item.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{item.name}</span>
                              {item.isRecipe && (
                                <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}>
                                  🍹 Recipe
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {item.category} · <span style={{ color: item.type === 'FOOD' ? '#f59e0b' : '#38bdf8', fontWeight: '600' }}>{item.type}</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: marginColor, background: `${marginColor}18`, padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                            {item.profitMargin.toFixed(1)}% Margin
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Qty Sold</div>
                            <div style={{ fontWeight: '700', marginTop: '2px' }}>{item.quantity}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Sell Price</div>
                            <div style={{ fontWeight: '600', marginTop: '2px' }}>{formatMoney(item.price)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Unit Cost</div>
                            <div style={{ fontWeight: '600', marginTop: '2px', color: item.isRecipe ? 'var(--gold-light)' : (isUnsetCost ? 'var(--warning-light)' : 'inherit') }}>
                              {item.isRecipe ? (item.costPrice > 0 ? `${formatMoney(item.costPrice)} (R)` : '⚠️ 0 (Recipe)') : (isUnsetCost ? '⚠️ 0 ETB' : formatMoney(item.costPrice))}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid var(--black-border)', paddingTop: '10px', fontSize: '13px' }}>
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Revenue: </span>
                            <b style={{ color: 'var(--gold)' }}>{formatMoney(item.revenue)}</b>
                            <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>|</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Cost: </span>
                            <span style={{ color: 'var(--danger-light)' }}>{formatMoney(item.totalCost)}</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Profit: </span>
                            <b style={{ color: item.grossProfit >= 0 ? 'var(--success-light)' : 'var(--danger-light)', fontSize: '14px' }}>
                              {formatMoney(item.grossProfit)}
                            </b>
                          </div>
                        </div>
                      </div>
                    )
                  },
                  'No profit items match your filter criteria.'
                )}
              </div>
            </div>
          )
        }

        if (activeTab === 'categorized') {
          const report = data.categorizedReport
          if (!report || report.categories.length === 0) {
            return (
              <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                No sales data available for the selected period.
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-gold btn-sm" onClick={exportCategorizedToExcel}>
                  <Download size={14} style={{ marginRight: '6px' }} /> Export to Excel
                </button>
              </div>

              {/* Desktop Table View */}
              <div className="desktop-only" style={{ background: '#FFFFFF', color: '#1A1A1A', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 30px rgba(0,0,0,0.4)', overflowX: 'auto', border: '1px solid #E5E7EB' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px', fontFamily: '"Courier New", Courier, monospace' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 6px', color: '#1F2937', letterSpacing: '0.5px' }}>Categorized And Summarized By Article</h2>
                  <p style={{ fontSize: '12px', color: '#4B5563', margin: 0 }}>
                    Cash Sales Voucher Report filtered by Void State = Not Void, {from || to ? `from ${from || 'Start'} to ${to || 'End'}` : `at the day of ${new Date().toLocaleDateString('en-US')}`}
                  </p>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'Arial, sans-serif' }}>
                  <thead>
                    <tr style={{ background: '#4F727C', color: '#FFFFFF', borderBottom: '2px solid #1F2937' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Category</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Sub Category</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Article Code</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Article Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold' }}>Quantity</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold' }}>Avg Amount</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold' }}>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((cat, catIdx) => (
                      <React.Fragment key={cat.categoryName}>
                        <tr style={{ background: '#598B9C', color: '#FFFFFF' }}>
                          <td colSpan={7} style={{ padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase' }}>
                            {cat.categoryName}
                          </td>
                        </tr>

                        {cat.subCategories.map((sub, subIdx) => (
                          <React.Fragment key={sub.subCategoryName}>
                            <tr style={{ background: '#CED9DC', color: '#1F2937' }}>
                              <td style={{ padding: '6px 12px' }}></td>
                              <td colSpan={6} style={{ padding: '6px 12px', fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
                                {sub.subCategoryName}
                              </td>
                            </tr>

                            {sub.articles.map((art) => (
                              <tr key={art.code} style={{ borderBottom: '1px solid #E5E7EB', color: '#374151' }}>
                                <td style={{ padding: '6px 12px' }}></td>
                                <td style={{ padding: '6px 12px' }}></td>
                                <td style={{ padding: '6px 12px', fontFamily: 'monospace' }}>{art.code}</td>
                                <td style={{ padding: '6px 12px' }}>{art.name}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{art.quantity.toFixed(2)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{art.avgAmount.toFixed(2)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600' }}>{art.totalAmount.toFixed(2)}</td>
                              </tr>
                            ))}

                            <tr style={{ fontWeight: 'bold', color: '#111827', borderBottom: '1px solid #111827' }}>
                              <td style={{ padding: '6px 12px' }}></td>
                              <td style={{ padding: '6px 12px' }}></td>
                              <td style={{ padding: '6px 12px' }}></td>
                              <td style={{ padding: '6px 12px', borderTop: '1px solid #9CA3AF' }}>{sub.subCategoryName} Total</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', borderTop: '1px solid #9CA3AF' }}>{sub.totalQuantity.toFixed(2)}</td>
                              <td style={{ padding: '6px 12px', borderTop: '1px solid #9CA3AF' }}></td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', borderTop: '1px solid #9CA3AF' }}>{sub.totalRevenue.toFixed(2)}</td>
                            </tr>
                          </React.Fragment>
                        ))}

                        <tr style={{ fontWeight: 'bold', color: '#111827', borderBottom: '2px solid #111827', background: '#F9FAFB' }}>
                          <td style={{ padding: '8px 12px' }}></td>
                          <td style={{ padding: '8px 12px' }}></td>
                          <td style={{ padding: '8px 12px' }}></td>
                          <td style={{ padding: '8px 12px' }}>{cat.categoryName} Total</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{cat.totalQuantity.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px' }}></td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{cat.totalRevenue.toFixed(2)}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '320px', fontFamily: 'Arial, sans-serif' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #D1D5DB' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 'bold', color: '#4B5563' }}>Sub Total</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>{report.subTotal.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #111827' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 'bold', color: '#4B5563' }}>Discount</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>{report.discount.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '4px double #111827', background: '#F3F4F6' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', color: '#111827' }}>Grand Total</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#111827' }}>{report.grandTotal.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {report.categories.map(cat => (
                  <div key={cat.categoryName} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--gold)', borderBottom: '1px solid var(--black-border)', paddingBottom: '8px', marginBottom: '12px', textTransform: 'uppercase' }}>
                      {cat.categoryName}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {cat.subCategories.map(sub => (
                        <div key={sub.subCategoryName} style={{ borderLeft: '2px solid var(--gold-dark)', paddingLeft: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                            {sub.subCategoryName}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sub.articles.map(art => (
                              <div key={art.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '13px', borderBottom: '1px dashed var(--black-border)', paddingBottom: '6px' }}>
                                <div>
                                  <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{art.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Code: {art.code} · Qty: {art.quantity.toFixed(2)} @ {art.avgAmount.toFixed(2)}</div>
                                </div>
                                <div style={{ fontWeight: '600', color: 'var(--gold)' }}>{art.totalAmount.toFixed(2)}</div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              <span>{sub.subCategoryName} Total</span>
                              <span>{sub.totalRevenue.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', borderTop: '1px solid var(--black-border)', paddingTop: '10px', marginTop: '12px' }}>
                      <span>{cat.categoryName} Total</span>
                      <span style={{ color: 'var(--gold)' }}>{cat.totalRevenue.toFixed(2)}</span>
                    </div>
                  </div>
                ))}

                <div className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--gold-dark)', marginTop: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Sub Total</span>
                      <span>{report.subTotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Discount</span>
                      <span>{report.discount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', borderTop: '1px solid var(--black-border)', paddingTop: '10px' }}>
                      <span>Grand Total</span>
                      <span style={{ color: 'var(--gold)' }}>{report.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        if (activeTab === 'daily') {
          return (
            <>
              {/* Desktop Table View */}
              <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--black-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', width: '100%' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--black-border)' }}>
                        {['Date', 'Total Orders', 'Revenue (ETB)', 'Avg Order Value', ''].map(h => (
                          <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailySales.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>No daily sales data available.</td></tr>
                      ) : data.dailySales.map((day) => (
                        <React.Fragment key={day.date}>
                          <tr
                            className="table-row-hover"
                            style={{ borderBottom: selectedDay === day.date ? 'none' : '1px solid var(--black-border)', cursor: 'pointer', background: selectedDay === day.date ? 'rgba(212,175,55,0.06)' : 'transparent' }}
                            onClick={() => setSelectedDay(selectedDay === day.date ? null : day.date)}
                          >
                            <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>
                              <span style={{ marginRight: '8px', fontSize: '12px', color: 'var(--gold)' }}>{selectedDay === day.date ? '▼' : '▶'}</span>
                              {new Date(day.date).toLocaleDateString('en-ET', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </td>
                            <td style={{ padding: '16px 20px' }}><span className="badge badge-outline">{day.orders}</span></td>
                            <td style={{ padding: '16px 20px', color: 'var(--gold)', fontWeight: '700', fontSize: '15px' }}>{formatMoney(day.revenue)}</td>
                            <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{day.orders > 0 ? formatMoney(day.revenue / day.orders) : '-'}</td>
                            <td style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>Click to expand</td>
                          </tr>
                          {selectedDay === day.date && (
                            <tr key={day.date + '-detail'}>
                              <td colSpan={5} style={{ padding: '0', borderBottom: '1px solid var(--black-border)', background: 'rgba(212,175,55,0.03)' }}>
                                <div style={{ padding: '20px 32px 24px' }}>
                                  <div style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    📋 Breakdown for {new Date(day.date).toLocaleDateString('en-ET', { weekday: 'long', month: 'long', day: 'numeric' })}
                                  </div>
                                  {day.categories.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No item details available.</div>
                                  ) : day.categories.map(cat => {
                                    const catTotalQty = cat.items.reduce((s, i) => s + i.quantity, 0)
                                    const catTotalRev = cat.items.reduce((s, i) => s + i.revenue, 0)
                                    return (
                                      <div key={cat.categoryName} style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--black-border)' }}>
                                          {cat.categoryName}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0' }}>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: '600' }}>ITEM</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 16px', fontWeight: '600', textAlign: 'center' }}>QTY</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: '600', textAlign: 'right' }}>REVENUE</div>
                                          {cat.items.map(item => (
                                            <React.Fragment key={item.name}>
                                              <div style={{ padding: '6px 8px', fontSize: '14px', color: 'var(--text-primary)', borderTop: '1px solid rgba(255,255,255,0.03)' }}>{item.name}</div>
                                              <div style={{ padding: '6px 16px', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.03)' }}>{item.quantity}</div>
                                              <div style={{ padding: '6px 8px', fontSize: '14px', color: 'var(--gold)', fontWeight: '600', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.03)' }}>{formatMoney(item.revenue)}</div>
                                            </React.Fragment>
                                          ))}
                                          <div style={{ padding: '8px 8px 4px', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', borderTop: '1px solid var(--black-border)' }}>Subtotal</div>
                                          <div style={{ padding: '8px 16px 4px', fontSize: '13px', fontWeight: '700', color: 'white', textAlign: 'center', borderTop: '1px solid var(--black-border)' }}>{catTotalQty}</div>
                                          <div style={{ padding: '8px 8px 4px', fontSize: '13px', fontWeight: '700', color: 'white', textAlign: 'right', borderTop: '1px solid var(--black-border)' }}>{formatMoney(catTotalRev)}</div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--black-border)', display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Orders: <b style={{ color: 'var(--text-primary)' }}>{day.orders}</b></span>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Revenue: <b style={{ color: 'var(--gold)', fontSize: '15px' }}>{formatMoney(day.revenue)}</b></span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-only" style={{ width: '100%' }}>
                {data.dailySales.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No daily sales data available.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {data.dailySales.map((day) => {
                      const isExpanded = selectedDay === day.date
                      return (
                        <div
                          key={day.date}
                          className="card"
                          style={{
                            background: 'var(--black-card)',
                            border: isExpanded ? '1px solid var(--gold)' : '1px solid var(--black-border)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                          onClick={() => setSelectedDay(isExpanded ? null : day.date)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', fontSize: '14px', color: isExpanded ? 'var(--gold)' : 'var(--text-primary)' }}>
                              {new Date(day.date).toLocaleDateString('en-ET', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{isExpanded ? '▼ Collapse' : '▶ Expand'}</span>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '6px' }}>Orders:</span>
                              <span className="badge badge-outline" style={{ fontSize: '11px', padding: '2px 8px' }}>{day.orders}</span>
                            </div>
                            <div style={{ color: 'var(--gold)', fontWeight: '700', fontSize: '16px' }}>{formatMoney(day.revenue)}</div>
                          </div>
                          
                          {day.orders > 0 && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Avg Order Value: <b>{formatMoney(day.revenue / day.orders)}</b>
                            </div>
                          )}

                          {isExpanded && (
                            <div
                              style={{
                                borderTop: '1px solid var(--black-border)',
                                paddingTop: '12px',
                                marginTop: '4px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <div style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Item Breakdown
                              </div>
                              {day.categories.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No item details available.</div>
                              ) : (
                                day.categories.map(cat => {
                                  const catTotalQty = cat.items.reduce((s, i) => s + i.quantity, 0)
                                  const catTotalRev = cat.items.reduce((s, i) => s + i.revenue, 0)
                                  return (
                                    <div key={cat.categoryName} style={{ background: 'var(--black-hover)', borderRadius: '8px', padding: '10px', border: '1px solid var(--black-border)' }}>
                                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', borderBottom: '1px solid var(--black-border)', paddingBottom: '4px', marginBottom: '8px' }}>
                                        {cat.categoryName}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {cat.items.map(item => (
                                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--text-primary)' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>×{item.quantity}</span></span>
                                            <span style={{ color: 'var(--gold)', fontWeight: '500' }}>{formatMoney(item.revenue)}</span>
                                          </div>
                                        ))}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', borderTop: '1px dashed var(--black-border)', paddingTop: '4px', marginTop: '4px' }}>
                                          <span>Total ({catTotalQty})</span>
                                          <span>{formatMoney(catTotalRev)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )
        }

        if (activeTab === 'history') return renderResponsiveTable(
          ['Date & Time', 'Table', 'Served By', 'Items Ordered', 'Method', 'Total Paid'],
          data.transactions,
          (tx) => (
            <tr key={tx.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
              <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{new Date(tx.date).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td style={{ padding: '16px 20px', fontWeight: '700' }}>Table {tx.table}</td>
              <td style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{tx.waiter}</div>
                <div style={{ fontSize: '11px', color: 'var(--gold)' }}>Cashier: {tx.cashier}</div>
              </td>
              <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '250px', lineHeight: '1.5' }}>
                {tx.items.split(', ').map((it, idx) => <div key={idx}>• {it}</div>)}
              </td>
              <td style={{ padding: '16px 20px' }}><span className={`badge ${tx.method === 'Cash' ? 'badge-success' : 'badge-occupied'}`}>{tx.method}</span></td>
              <td style={{ padding: '16px 20px', color: 'var(--gold)', fontWeight: '700', fontSize: '15px' }}>{formatMoney(tx.amount)}</td>
            </tr>
          ),
          (tx) => (
            <div key={tx.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px' }}>Table {tx.table}</span>
                <span className={`badge ${tx.method === 'Cash' ? 'badge-success' : 'badge-occupied'}`} style={{ fontSize: '10px' }}>{tx.method}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(tx.date).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div style={{ color: 'var(--gold)', fontWeight: '700', fontSize: '15px' }}>{formatMoney(tx.amount)}</div>
              </div>
              <div style={{ fontSize: '13px', borderTop: '1px solid var(--black-border)', paddingTop: '8px' }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>Waiter: {tx.waiter} <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'normal' }}>(Cashier: {tx.cashier})</span></div>
                <div style={{ color: 'var(--text-primary)', marginTop: '6px' }}>
                  {tx.items.split(', ').map((it, idx) => <div key={idx} style={{ fontSize: '12px', marginBottom: '2px' }}>• {it}</div>)}
                </div>
              </div>
            </div>
          ),
          'No transactions found.'
        )

        if (activeTab === 'best-sellers') return renderResponsiveTable(
          ['Rank', 'Item Name', 'Category', 'Units Sold', 'Revenue', 'Unit Cost', 'Gross Profit', 'Margin %'],
          data.bestSelling,
          (item, i) => {
            const hasCost = item.costPrice !== undefined && item.costPrice > 0
            const margin = item.profitMargin ?? 0
            const marginColor = margin >= 50 ? 'var(--success-light)' : margin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)'

            return (
              <tr key={i} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: i < 3 ? 'var(--gold)' : 'var(--black-hover)', color: i < 3 ? 'var(--black)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px' }}>
                    {i + 1}
                  </div>
                </td>
                <td style={{ padding: '16px 20px', fontWeight: '600', fontSize: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>{item.name}</span>
                    {item.isRecipe && (
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}>
                        🍹 Recipe
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{item.category}</td>
                <td style={{ padding: '16px 20px', fontWeight: '700', color: 'var(--text-primary)' }}>{item.quantity}</td>
                <td style={{ padding: '16px 20px', color: 'var(--gold)', fontWeight: '700' }}>{formatMoney(item.revenue)}</td>
                <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {item.isRecipe ? (
                    <span style={{ color: item.costPrice ? 'var(--text-primary)' : 'var(--warning-light)', fontWeight: '500' }}>
                      {item.costPrice ? formatMoney(item.costPrice) : '⚠️ 0.00'}
                    </span>
                  ) : hasCost ? formatMoney(item.costPrice || 0) : <span style={{ color: 'var(--warning-light)', fontSize: '11px' }}>⚠️ 0.00</span>}
                </td>
                <td style={{ padding: '16px 20px', fontWeight: '700', color: (item.profit ?? 0) >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                  {item.profit !== undefined ? formatMoney(item.profit) : '-'}
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: marginColor, background: `${marginColor}18`, padding: '3px 8px', borderRadius: '10px' }}>
                    {item.profitMargin !== undefined ? `${item.profitMargin.toFixed(1)}%` : '-'}
                  </span>
                </td>
              </tr>
            )
          },
          (item, i) => {
            const margin = item.profitMargin ?? 0
            const marginColor = margin >= 50 ? 'var(--success-light)' : margin >= 25 ? 'var(--warning-light)' : 'var(--danger-light)'

            return (
              <div key={i} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: i < 3 ? 'var(--gold)' : 'var(--black-hover)', color: i < 3 ? 'var(--black)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{item.name}</span>
                      {item.isRecipe && (
                        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)' }}>
                          🍹 Recipe
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.category}</div>
                  </div>
                  {item.profitMargin !== undefined && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: marginColor, background: `${marginColor}18`, padding: '2px 7px', borderRadius: '8px' }}>
                      {item.profitMargin.toFixed(1)}%
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--black-border)', paddingTop: '10px', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.quantity} sold · Rev: <b style={{ color: 'var(--gold)' }}>{formatMoney(item.revenue)}</b></span>
                  {item.profit !== undefined && (
                    <span style={{ color: 'var(--text-secondary)' }}>Profit: <b style={{ color: item.profit >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>{formatMoney(item.profit)}</b></span>
                  )}
                </div>
              </div>
            )
          },
          'No items sold yet.'
        )

        if (activeTab === 'staff') return renderResponsiveTable(
          ['Staff Member', 'Orders Handled', 'Total Revenue'],
          [...data.staffPerformance].sort((a, b) => b.revenue - a.revenue),
          (s, i) => (
            <tr key={i} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
              <td style={{ padding: '16px 20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(212,175,55,0.2)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                  {s.name.charAt(0)}
                </div>
                {s.name}
              </td>
              <td style={{ padding: '16px 20px' }}><span className="badge badge-outline">{s.orders}</span></td>
              <td style={{ padding: '16px 20px', color: 'var(--gold)', fontWeight: '700', fontSize: '15px' }}>{formatMoney(s.revenue)}</td>
            </tr>
          ),
          (s, i) => (
            <div key={i} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', flexShrink: 0, border: '1px solid var(--gold-dark)' }}>
                {s.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{s.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Orders: <span className="badge badge-outline" style={{ padding: '1px 6px', fontSize: '10px' }}>{s.orders}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--gold)', fontWeight: '700', fontSize: '14px' }}>{formatMoney(s.revenue)}</div>
              </div>
            </div>
          ),
          'No staff performance data.'
        )

        if (activeTab === 'cancellations') return renderResponsiveTable(
          ['Item Cancelled', 'Order Info', 'Reason', 'Authorized By', 'Date & Time'],
          data.cancellations,
          (c) => (
            <tr key={c.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
              <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--danger-light)' }}>{c.orderItem.quantity}x {c.orderItem.menuItem.name}</td>
              <td style={{ padding: '16px 20px', fontSize: '13px' }}>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Table {c.orderItem.order.table.number}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Waiter: {c.orderItem.order.waiter.fullName}</div>
              </td>
              <td style={{ padding: '16px 20px', fontSize: '13px', fontStyle: 'italic', color: 'var(--text-muted)' }}>"{c.reason}"</td>
              <td style={{ padding: '16px 20px' }}><span className="badge badge-waiting">{c.manager.fullName}</span></td>
              <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{new Date(c.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}</td>
            </tr>
          ),
          (c) => (
            <div key={c.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: '600', color: 'var(--danger-light)', fontSize: '14px' }}>{c.orderItem.quantity}x {c.orderItem.menuItem.name}</div>
                <span className="badge badge-waiting" style={{ fontSize: '9px', padding: '2px 6px' }}>{c.manager.fullName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Table {c.orderItem.order.table.number} · Waiter: {c.orderItem.order.waiter.fullName}</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ background: 'rgba(230,57,70,0.05)', borderLeft: '3px solid var(--danger-light)', padding: '8px 12px', borderRadius: '4px', fontStyle: 'italic', fontSize: '12px', color: 'var(--text-primary)', marginTop: '4px' }}>
                "{c.reason}"
              </div>
            </div>
          ),
          'No cancellations recorded.'
        )

        if (activeTab === 'inventory') {
          const val = data.inventoryValuation || {
            totalValue: 0,
            ingredientValue: 0,
            retailValue: 0,
          }
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Header Title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 className="font-cinzel" style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Boxes size={22} color="var(--gold)" /> Inventory Assets & Stock Valuation
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                    Valuation of raw store ingredients, prepared recipe items, retail inventory, and low stock warnings
                  </p>
                </div>
              </div>

              {/* 4 Asset Valuation KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(20,20,20,0.9) 100%)', border: '1px solid rgba(212,175,55,0.35)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>Total Inventory Assets</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff', margin: '6px 0 2px' }}>{formatMoney(val.totalValue)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Ingredients + Retail Stock</div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(20,20,20,0.9) 100%)', border: '1px solid rgba(56,189,248,0.3)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>Raw Store Ingredients</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#38bdf8', margin: '6px 0 2px' }}>{formatMoney(val.ingredientValue)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{allIngs.length} raw ingredients in stock</div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(20,20,20,0.9) 100%)', border: '1px solid rgba(16,185,129,0.3)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--success-light)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>Retail Products Stock</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--success-light)', margin: '6px 0 2px' }}>{formatMoney(val.retailValue)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Stand-alone goods (bar + store)</div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(20,20,20,0.9) 100%)', border: '1px solid rgba(239,68,68,0.3)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--danger-light)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>Low Stock Items</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: lowStockList.length > 0 ? 'var(--danger-light)' : 'var(--text-primary)', margin: '6px 0 2px' }}>{lowStockList.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Items needing reorder</div>
                </div>
              </div>

              {/* Sub-tab selection and search controls */}
              <div className="card" style={{ padding: '12px 16px', background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${invSubTab === 'ingredients' ? 'btn-gold' : 'btn-ghost'}`}
                    style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                    onClick={() => setInvSubTab('ingredients')}
                  >
                    🧪 Store Ingredients ({allIngs.length})
                  </button>
                  <button
                    className={`btn btn-sm ${invSubTab === 'retail' ? 'btn-gold' : 'btn-ghost'}`}
                    style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                    onClick={() => setInvSubTab('retail')}
                  >
                    🍽️ Menu & Retail Items ({allItems.length})
                  </button>
                  <button
                    className={`btn btn-sm ${invSubTab === 'lowstock' ? 'btn-gold' : 'btn-ghost'}`}
                    style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                    onClick={() => setInvSubTab('lowstock')}
                  >
                    ⚠️ Low Stock Alerts ({lowStockList.length})
                  </button>
                </div>

                <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '340px' }}>
                  <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    className="input"
                    placeholder="Search stock..."
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    style={{ paddingLeft: '34px', width: '100%', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Sub-tab Content: 1) Store Ingredients */}
              {invSubTab === 'ingredients' && renderResponsiveTable(
                ['Ingredient', 'In-Store Qty', 'Unit', 'Cost / Unit', 'Total Asset Value', 'Alert Threshold', 'Status'],
                filteredIngs,
                (ing) => {
                  const isLow = Number(ing.quantity) <= Number(ing.minAlert || 5)
                  return (
                    <tr key={ing.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{ing.name}</td>
                      <td style={{ padding: '14px 20px', fontWeight: '700', color: isLow ? 'var(--danger-light)' : 'var(--text-primary)' }}>
                        {ing.quantity}
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>{ing.unit}</td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {ing.costPerUnit > 0 ? `${formatMoney(ing.costPerUnit)} / ${ing.unit}` : <span style={{ color: 'var(--warning-light)', fontSize: '11px' }}>⚠️ 0.00</span>}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: '700', color: 'var(--gold)', fontSize: '14px' }}>
                        {formatMoney(ing.totalValue || 0)}
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>{ing.minAlert || 5} {ing.unit}</td>
                      <td style={{ padding: '14px 20px' }}>
                        {isLow ? (
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-light)', border: '1px solid rgba(239,68,68,0.3)' }}>
                            ⚠️ LOW
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: 'var(--success-light)', border: '1px solid rgba(16,185,129,0.3)' }}>
                            ✅ OK
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                },
                (ing) => {
                  const isLow = Number(ing.quantity) <= Number(ing.minAlert || 5)
                  return (
                    <div key={ing.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '15px' }}>{ing.name}</span>
                        {isLow ? (
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-light)' }}>
                            ⚠️ LOW
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: 'var(--success-light)' }}>
                            ✅ OK
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>In Store</div>
                          <div style={{ fontWeight: '700', marginTop: '2px', color: isLow ? 'var(--danger-light)' : 'inherit' }}>{ing.quantity} {ing.unit}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Cost / Unit</div>
                          <div style={{ fontWeight: '600', marginTop: '2px' }}>{ing.costPerUnit > 0 ? formatMoney(ing.costPerUnit) : '0 ETB'}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Asset Value</div>
                          <div style={{ fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>{formatMoney(ing.totalValue || 0)}</div>
                        </div>
                      </div>
                    </div>
                  )
                },
                'No ingredients found in store.'
              )}

              {/* Sub-tab Content: 2) Menu & Retail Items */}
              {invSubTab === 'retail' && renderResponsiveTable(
                ['Item & Category', 'Type & Recipe Status', 'Store Stock', 'Bar Stock', 'Unit Cost / Recipe', 'Selling Price'],
                filteredItems,
                (item) => (
                  <tr key={item.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.category?.name || 'Uncategorized'}</div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {item.isRecipe ? (
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.35)' }}>
                          🍹 Made from Ingredients (Prepared)
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                          📦 Direct Retail Stock
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontWeight: '700', color: item.isRecipe ? 'var(--text-muted)' : (item.stockQuantity <= item.lowStockThreshold ? 'var(--danger-light)' : 'var(--text-primary)') }}>
                      {item.isRecipe ? <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '12px' }}>0 (Made on demand)</span> : item.stockQuantity}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>
                      {item.isRecipe ? '-' : (item.barQuantity ?? 0)}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '13px' }}>
                      {item.isRecipe ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <b style={{ color: item.recipeCost ? 'var(--gold)' : 'var(--warning-light)' }}>{formatMoney(item.recipeCost || 0)}</b>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Recipe dynamic cost</span>
                        </div>
                      ) : (
                        <span style={{ color: item.costPrice > 0 ? 'var(--text-secondary)' : 'var(--warning-light)' }}>
                          {item.costPrice > 0 ? formatMoney(item.costPrice) : '⚠️ 0.00'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--gold)', fontWeight: '600' }}>
                      {formatMoney(item.price)}
                    </td>
                  </tr>
                ),
                (item) => (
                  <div key={item.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '15px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.category?.name || 'Uncategorized'}</div>
                      </div>
                      {item.isRecipe ? (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: 'rgba(212,175,55,0.18)', color: 'var(--gold)' }}>
                          🍹 Recipe Item
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                          📦 Retail Stock
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Store / Bar Qty</div>
                        <div style={{ fontWeight: '700', marginTop: '2px' }}>
                          {item.isRecipe ? '0 (Demand)' : `${item.stockQuantity} / ${item.barQuantity ?? 0}`}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Cost / Unit</div>
                        <div style={{ fontWeight: '600', marginTop: '2px', color: item.isRecipe ? 'var(--gold)' : 'inherit' }}>
                          {item.isRecipe ? (item.recipeCost ? formatMoney(item.recipeCost) : '0 ETB') : formatMoney(item.costPrice || 0)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Price</div>
                        <div style={{ fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>{formatMoney(item.price)}</div>
                      </div>
                    </div>
                  </div>
                ),
                'No menu items found.'
              )}

              {/* Sub-tab Content: 3) Low Stock Alerts */}
              {invSubTab === 'lowstock' && renderResponsiveTable(
                ['Item Name', 'Current Stock', 'Alert Threshold', 'Status'],
                filteredLowStock,
                (item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--black-border)', background: 'rgba(230,57,70,0.03)' }}>
                    <td style={{ padding: '16px 20px', fontWeight: '600' }}>{item.name}</td>
                    <td style={{ padding: '16px 20px', color: 'var(--danger-light)', fontWeight: '700', fontSize: '16px' }}>{item.stockQuantity}</td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{item.lowStockThreshold}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '4px 10px', borderRadius: '12px', fontWeight: '700', letterSpacing: '1px' }}>
                        <AlertTriangle size={12}/> LOW STOCK
                      </span>
                    </td>
                  </tr>
                ),
                (item) => (
                  <div key={item.id} className="card" style={{ background: 'rgba(230,57,70,0.02)', border: '1px solid rgba(230,57,70,0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px' }}>{item.name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '3px 8px', borderRadius: '12px', fontWeight: '700' }}>
                        <AlertTriangle size={10}/> LOW STOCK
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(230,57,70,0.05)', paddingTop: '8px' }}>
                      <span>Current Stock: <b style={{ color: 'var(--danger-light)', fontSize: '14px' }}>{item.stockQuantity}</b></span>
                      <span>Alert Threshold: <b>{item.lowStockThreshold}</b></span>
                    </div>
                  </div>
                ),
                '✅ All items have sufficient stock.'
              )}
            </div>
          )
        }

        if (activeTab === 'inventory-logs') return renderResponsiveTable(
          ['Date & Time', 'Item Name', 'Source/Type', 'Action', 'Qty Changed', 'Prev Qty', 'New Qty', 'User'],
          data.inventoryLogs || [],
          (log) => (
            <tr key={log.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--black-border)' }}>
              <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
              </td>
              <td style={{ padding: '16px 20px', fontWeight: '700' }}>{log.itemName}</td>
              <td style={{ padding: '16px 20px' }}>
                <span className="badge badge-outline" style={{ fontSize: '11px' }}>{log.type}</span>
              </td>
              <td style={{ padding: '16px 20px' }}>
                <span className={`badge ${
                  log.action === 'ADD' || log.action === 'INITIAL' ? 'badge-free' : 
                  log.action === 'TRANSFER' ? 'badge-occupied' : 'badge-open'
                }`}>
                  {log.action}
                </span>
              </td>
              <td style={{ padding: '16px 20px', fontWeight: '700', color: (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'var(--text-primary)' }}>
                {(log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}
              </td>
              <td style={{ padding: '16px 20px', color: 'var(--text-muted)' }}>{log.prevQty}</td>
              <td style={{ padding: '16px 20px', fontWeight: '600' }}>{log.newQty}</td>
              <td style={{ padding: '16px 20px', fontWeight: '600' }}>{log.userName}</td>
            </tr>
          ),
          (log) => (
            <div key={log.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px' }}>{log.itemName}</span>
                <span className={`badge ${
                  log.action === 'ADD' || log.action === 'INITIAL' ? 'badge-free' : 
                  log.action === 'TRANSFER' ? 'badge-occupied' : 'badge-open'
                }`} style={{ fontSize: '10px' }}>{log.action}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Type: <b>{log.type}</b></span>
                <span>User: <b>{log.userName}</b></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--black-border)', paddingTop: '8px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  Qty: <b style={{ color: (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'inherit' }}>{(log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}</b> 
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>({log.prevQty} → {log.newQty})</span>
                </div>
              </div>
            </div>
          ),
          'No inventory logs recorded.'
        )

        return null;
      })()}

      <style dangerouslySetInnerHTML={{__html: `
        .table-row-hover { transition: background 0.2s; }
        .table-row-hover:hover { background: rgba(255,255,255,0.02); }
      `}} />
    </div>
  )
}
