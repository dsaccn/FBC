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
  Calendar,
  Trash2,
  ChevronDown,
  ChevronRight,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Save,
  Phone,
  CreditCard
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'

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
  totalTips?: number
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
  staffPerformance: { name: string; orders: number; revenue: number; tips?: number }[]
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
  transactions: {
    id: string
    date: string
    amount: number
    tip?: number
    netAmount?: number
    method: string
    cashier: string
    waiter: string
    table: string
    items: string
    verifiedRef?: string | null
    verifiedProvider?: string | null
    verifiedPayer?: string | null
    verifiedReceiver?: string | null
    verifiedAt?: string | null
    isVerified?: boolean
    isDigital?: boolean
    notes?: string | null
  }[]
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
  const [ledgerMethodFilter, setLedgerMethodFilter] = useState<'ALL' | 'Cash' | 'Telebirr' | 'CBE'>('ALL')
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'ALL' | 'VERIFIED' | 'UNVERIFIED'>('ALL')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [quickDateActive, setQuickDateActive] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('all')

  // Official Receiver Account Verification Settings state
  const [telebirrPhone, setTelebirrPhone] = useState('')
  const [cbeAccount, setCbeAccount] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const loadPaymentSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/system/payment-settings')
      if (res.ok) {
        const json = await res.json()
        if (json.settings) {
          setTelebirrPhone(json.settings.telebirrReceiverPhone || '')
          setCbeAccount(json.settings.cbeReceiverAccount || '')
          setMerchantName(json.settings.merchantName || 'Kogna Coffee')
          setSettingsLoaded(true)
        }
      }
    } catch (err) {
      console.warn('[Reports] Failed to load payment settings:', err)
    }
  }, [])

  useEffect(() => {
    loadPaymentSettings()
  }, [loadPaymentSettings])

  const handleSavePaymentSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await fetch('/api/system/payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telebirrReceiverPhone: telebirrPhone,
          cbeReceiverAccount: cbeAccount,
          merchantName,
        }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast.success('Receiver account verification settings saved successfully!')
      } else {
        toast.error(json.error || 'Failed to save receiver settings')
      }
    } catch {
      toast.error('Network error saving receiver settings')
    } finally {
      setSavingSettings(false)
    }
  }

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

  function exportLedgerToExcel() {
    if (!data || !data.transactions) return
    const txs = data.transactions
    const dateLabel = from || to
      ? `from ${from || 'Start'} to ${to || 'End'}`
      : `at the day of ${new Date().toLocaleDateString('en-US')}`

    const tdBase = `border:1px solid #D1D5DB;padding:6px 10px;font-family:system-ui,sans-serif;font-size:10pt;`
    const numTd = `${tdBase}text-align:right;`

    // Segregate by payment channel
    const cashTxs = txs.filter(t => t.method === 'Cash')
    const telebirrTxs = txs.filter(t => t.method.toLowerCase().includes('telebirr'))
    const cbeTxs = txs.filter(t => t.method.toLowerCase().includes('cbe'))
    const otherTxs = txs.filter(t => t.method !== 'Cash' && !t.method.toLowerCase().includes('telebirr') && !t.method.toLowerCase().includes('cbe'))

    const cashTotal = cashTxs.reduce((sum, t) => sum + t.amount, 0)
    const telebirrTotal = telebirrTxs.reduce((sum, t) => sum + t.amount, 0)
    const telebirrVerifiedTotal = telebirrTxs.filter(t => t.isVerified).reduce((sum, t) => sum + t.amount, 0)
    const telebirrUnverifiedTotal = telebirrTotal - telebirrVerifiedTotal

    const cbeTotal = cbeTxs.reduce((sum, t) => sum + t.amount, 0)
    const cbeVerifiedTotal = cbeTxs.filter(t => t.isVerified).reduce((sum, t) => sum + t.amount, 0)
    const cbeUnverifiedTotal = cbeTotal - cbeVerifiedTotal

    const otherTotal = otherTxs.reduce((sum, t) => sum + t.amount, 0)
    const grandTotal = cashTotal + telebirrTotal + cbeTotal + otherTotal

    const totalTipsExcel = txs.reduce((sum, t) => sum + (t.tip || 0), 0)
    const netGrandTotalExcel = Math.max(0, grandTotal - totalTipsExcel)

    // 1. CASH ROWS
    let cashRows = ''
    cashTxs.forEach(t => {
      const d = new Date(t.date)
      const dateStr = d.toLocaleDateString('en-US')
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const tip = t.tip || 0
      const net = t.netAmount !== undefined ? t.netAmount : Math.max(0, t.amount - tip)
      cashRows += `<tr>
        <td style="${tdBase}">${dateStr}</td>
        <td style="${tdBase}">${timeStr}</td>
        <td style="${tdBase}font-weight:600;">Table ${t.table}</td>
        <td style="${tdBase}">${t.cashier}</td>
        <td style="${tdBase}">${t.waiter}</td>
        <td style="${tdBase}font-weight:600;color:#059669;">Cash</td>
        <td style="${tdBase}background-color:#F0FDF4;color:#15803d;font-weight:600;">Cash - Register Settled</td>
        <td style="${tdBase}">${t.items}</td>
        <td style="${numTd}color:#DB2777;font-weight:600;">${tip > 0 ? `+${tip.toFixed(2)}` : '-'}</td>
        <td style="${numTd}">${net.toFixed(2)}</td>
        <td style="${numTd}font-weight:700;">${t.amount.toFixed(2)}</td>
      </tr>`
    })

    // 2. TELEBIRR ROWS
    let telebirrRows = ''
    telebirrTxs.forEach(t => {
      const d = new Date(t.date)
      const dateStr = d.toLocaleDateString('en-US')
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const statusStyle = t.isVerified 
        ? 'background-color:#ECFDF5;color:#047857;font-weight:bold;' 
        : 'background-color:#FEF2F2;color:#B91C1C;font-weight:bold;'
      const statusText = t.isVerified ? '✓ VERIFIED' : '⚠️ UNVERIFIED'
      const refStyle = t.isVerified ? 'font-family:monospace;font-weight:bold;color:#0F172A;' : 'color:#94A3B8;font-style:italic;'
      const tip = t.tip || 0
      const net = t.netAmount !== undefined ? t.netAmount : Math.max(0, t.amount - tip)
      telebirrRows += `<tr>
        <td style="${tdBase}">${dateStr}</td>
        <td style="${tdBase}">${timeStr}</td>
        <td style="${tdBase}font-weight:600;">Table ${t.table}</td>
        <td style="${tdBase}">${t.cashier}</td>
        <td style="${tdBase}">${t.waiter}</td>
        <td style="${tdBase}${refStyle}">${t.verifiedRef || 'None'}</td>
        <td style="${tdBase}">${t.verifiedPayer || '-'}</td>
        <td style="${tdBase}">${t.verifiedReceiver || 'Kogna Coffee'}</td>
        <td style="${tdBase}${statusStyle}">${statusText}</td>
        <td style="${tdBase}">${t.items}</td>
        <td style="${numTd}color:#DB2777;font-weight:600;">${tip > 0 ? `+${tip.toFixed(2)}` : '-'}</td>
        <td style="${numTd}">${net.toFixed(2)}</td>
        <td style="${numTd}font-weight:700;">${t.amount.toFixed(2)}</td>
      </tr>`
    })

    // 3. CBE ROWS
    let cbeRows = ''
    cbeTxs.forEach(t => {
      const d = new Date(t.date)
      const dateStr = d.toLocaleDateString('en-US')
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const statusStyle = t.isVerified 
        ? 'background-color:#ECFDF5;color:#047857;font-weight:bold;' 
        : 'background-color:#FEF2F2;color:#B91C1C;font-weight:bold;'
      const statusText = t.isVerified ? '✓ VERIFIED' : '⚠️ UNVERIFIED'
      const refStyle = t.isVerified ? 'font-family:monospace;font-weight:bold;color:#0F172A;' : 'color:#94A3B8;font-style:italic;'
      const tip = t.tip || 0
      const net = t.netAmount !== undefined ? t.netAmount : Math.max(0, t.amount - tip)
      cbeRows += `<tr>
        <td style="${tdBase}">${dateStr}</td>
        <td style="${tdBase}">${timeStr}</td>
        <td style="${tdBase}font-weight:600;">Table ${t.table}</td>
        <td style="${tdBase}">${t.cashier}</td>
        <td style="${tdBase}">${t.waiter}</td>
        <td style="${tdBase}${refStyle}">${t.verifiedRef || 'None'}</td>
        <td style="${tdBase}">${t.verifiedPayer || '-'}</td>
        <td style="${tdBase}">${t.verifiedReceiver || 'Kogna Coffee'}</td>
        <td style="${tdBase}${statusStyle}">${statusText}</td>
        <td style="${tdBase}">${t.items}</td>
        <td style="${numTd}color:#DB2777;font-weight:600;">${tip > 0 ? `+${tip.toFixed(2)}` : '-'}</td>
        <td style="${numTd}">${net.toFixed(2)}</td>
        <td style="${numTd}font-weight:700;">${t.amount.toFixed(2)}</td>
      </tr>`
    })

    // 4. OTHER ROWS (if any)
    let otherRows = ''
    otherTxs.forEach(t => {
      const d = new Date(t.date)
      const dateStr = d.toLocaleDateString('en-US')
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const tip = t.tip || 0
      const net = t.netAmount !== undefined ? t.netAmount : Math.max(0, t.amount - tip)
      otherRows += `<tr>
        <td style="${tdBase}">${dateStr}</td>
        <td style="${tdBase}">${timeStr}</td>
        <td style="${tdBase}font-weight:600;">Table ${t.table}</td>
        <td style="${tdBase}">${t.cashier}</td>
        <td style="${tdBase}">${t.waiter}</td>
        <td style="${tdBase}">${t.verifiedRef || '-'}</td>
        <td style="${tdBase}">${t.verifiedPayer || '-'}</td>
        <td style="${tdBase}">${t.verifiedReceiver || '-'}</td>
        <td style="${tdBase}">${t.isVerified ? '✓ VERIFIED' : 'Unverified'}</td>
        <td style="${tdBase}">${t.items}</td>
        <td style="${numTd}color:#DB2777;font-weight:600;">${tip > 0 ? `+${tip.toFixed(2)}` : '-'}</td>
        <td style="${numTd}">${net.toFixed(2)}</td>
        <td style="${numTd}font-weight:700;">${t.amount.toFixed(2)}</td>
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
        <p style="text-align:center;font-size:16pt;font-weight:bold;font-family:system-ui,sans-serif;margin-bottom:4px;color:#0F172A;">Kogna Coffee - Transaction & Payment Verification Ledger</p>
        <p style="text-align:center;font-size:10pt;font-family:system-ui,sans-serif;color:#475569;margin-bottom:16px;">
          Settlement Report with Bank Referral Codes & Verification Status (${dateLabel})
        </p>

        <!-- 1. CASH SECTION -->
        <h3 style="font-family:system-ui,sans-serif;color:#065F46;margin-top:20px;margin-bottom:8px;">💵 1. Cash Transactions (${cashTxs.length} orders)</h3>
        <table>
          <thead>
            <tr style="background-color:#065F46;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Date</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Time</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Table</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Cashier</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Waiter</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Method</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Verification Status</th>
              <th style="${tdBase}text-align:left;background-color:#065F46;color:#FFFFFF;">Items Ordered</th>
              <th style="${numTd}background-color:#065F46;color:#FFFFFF;">Tip (ETB)</th>
              <th style="${numTd}background-color:#065F46;color:#FFFFFF;">Net Revenue (ETB)</th>
              <th style="${numTd}background-color:#065F46;color:#FFFFFF;">Total Paid (ETB)</th>
            </tr>
          </thead>
          <tbody>
            ${cashRows || '<tr><td colspan="11" style="text-align:center;padding:12px;color:#94A3B8;">No cash transactions recorded.</td></tr>'}
            <tr style="background-color:#D1FAE5;font-weight:bold;">
              <td colspan="10" style="${tdBase}text-align:right;background-color:#D1FAE5;color:#065F46;font-size:11pt;">Cash Sub-Total (${cashTxs.length} orders):</td>
              <td style="${numTd}background-color:#D1FAE5;color:#065F46;font-size:11pt;">${cashTotal.toFixed(2)} ETB</td>
            </tr>
          </tbody>
        </table>

        <!-- 2. TELEBIRR SECTION -->
        <h3 style="font-family:system-ui,sans-serif;color:#0369A1;margin-top:28px;margin-bottom:8px;">📱 2. Telebirr Transactions (${telebirrTxs.length} orders)</h3>
        <table>
          <thead>
            <tr style="background-color:#0369A1;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Date</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Time</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Table</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Cashier</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Waiter</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Reference Code</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Payer Name</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Credited Receiver</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Verification</th>
              <th style="${tdBase}text-align:left;background-color:#0369A1;color:#FFFFFF;">Items Ordered</th>
              <th style="${numTd}background-color:#0369A1;color:#FFFFFF;">Tip (ETB)</th>
              <th style="${numTd}background-color:#0369A1;color:#FFFFFF;">Net Revenue (ETB)</th>
              <th style="${numTd}background-color:#0369A1;color:#FFFFFF;">Total Paid (ETB)</th>
            </tr>
          </thead>
          <tbody>
            ${telebirrRows || '<tr><td colspan="13" style="text-align:center;padding:12px;color:#94A3B8;">No Telebirr transactions recorded.</td></tr>'}
            <tr style="background-color:#E0F2FE;font-weight:bold;">
              <td colspan="12" style="${tdBase}text-align:right;background-color:#E0F2FE;color:#0369A1;font-size:11pt;">Telebirr Sub-Total (${telebirrTxs.length} orders · Verified: ${telebirrVerifiedTotal.toFixed(2)} ETB | Unverified: ${telebirrUnverifiedTotal.toFixed(2)} ETB):</td>
              <td style="${numTd}background-color:#E0F2FE;color:#0369A1;font-size:11pt;">${telebirrTotal.toFixed(2)} ETB</td>
            </tr>
          </tbody>
        </table>

        <!-- 3. CBE SECTION -->
        <h3 style="font-family:system-ui,sans-serif;color:#854D0E;margin-top:28px;margin-bottom:8px;">🏦 3. CBE Transactions (${cbeTxs.length} orders)</h3>
        <table>
          <thead>
            <tr style="background-color:#854D0E;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Date</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Time</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Table</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Cashier</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Waiter</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Reference Code</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Payer Name</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Credited Receiver</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Verification</th>
              <th style="${tdBase}text-align:left;background-color:#854D0E;color:#FFFFFF;">Items Ordered</th>
              <th style="${numTd}background-color:#854D0E;color:#FFFFFF;">Tip (ETB)</th>
              <th style="${numTd}background-color:#854D0E;color:#FFFFFF;">Net Revenue (ETB)</th>
              <th style="${numTd}background-color:#854D0E;color:#FFFFFF;">Total Paid (ETB)</th>
            </tr>
          </thead>
          <tbody>
            ${cbeRows || '<tr><td colspan="13" style="text-align:center;padding:12px;color:#94A3B8;">No CBE transactions recorded.</td></tr>'}
            <tr style="background-color:#FEF3C7;font-weight:bold;">
              <td colspan="12" style="${tdBase}text-align:right;background-color:#FEF3C7;color:#854D0E;font-size:11pt;">CBE Sub-Total (${cbeTxs.length} orders · Verified: ${cbeVerifiedTotal.toFixed(2)} ETB | Unverified: ${cbeUnverifiedTotal.toFixed(2)} ETB):</td>
              <td style="${numTd}background-color:#FEF3C7;color:#854D0E;font-size:11pt;">${cbeTotal.toFixed(2)} ETB</td>
            </tr>
          </tbody>
        </table>

        ${otherTxs.length > 0 ? `
        <!-- 4. OTHER SECTION -->
        <h3 style="font-family:system-ui,sans-serif;color:#475569;margin-top:28px;margin-bottom:8px;">💳 4. Other Bank Transfers (${otherTxs.length} orders)</h3>
        <table>
          <thead>
            <tr style="background-color:#475569;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Date</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Time</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Table</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Cashier</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Waiter</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Reference Code</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Payer</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Receiver</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Verification</th>
              <th style="${tdBase}text-align:left;background-color:#475569;color:#FFFFFF;">Items Ordered</th>
              <th style="${numTd}background-color:#475569;color:#FFFFFF;">Tip (ETB)</th>
              <th style="${numTd}background-color:#475569;color:#FFFFFF;">Net (ETB)</th>
              <th style="${numTd}background-color:#475569;color:#FFFFFF;">Amount (ETB)</th>
            </tr>
          </thead>
          <tbody>
            ${otherRows}
            <tr style="background-color:#F1F5F9;font-weight:bold;">
              <td colspan="12" style="${tdBase}text-align:right;">Other Transfers Sub-Total:</td>
              <td style="${numTd}">${otherTotal.toFixed(2)} ETB</td>
            </tr>
          </tbody>
        </table>` : ''}

        <!-- 5. GRAND SUMMARY AT THE END -->
        <h3 style="font-family:system-ui,sans-serif;color:#0F172A;margin-top:36px;margin-bottom:8px;">📊 Settlement Summary & Grand Total</h3>
        <table style="max-width:760px;">
          <thead>
            <tr style="background-color:#0F172A;color:#FFFFFF;">
              <th style="${tdBase}text-align:left;background-color:#0F172A;color:#FFFFFF;">Payment Channel</th>
              <th style="${numTd}background-color:#0F172A;color:#FFFFFF;">Total Orders</th>
              <th style="${numTd}background-color:#0F172A;color:#FFFFFF;">Verified Amount</th>
              <th style="${numTd}background-color:#0F172A;color:#FFFFFF;">Unverified Amount</th>
              <th style="${numTd}background-color:#0F172A;color:#FFFFFF;">Total Revenue (ETB)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="${tdBase}font-weight:600;">💵 Cash</td>
              <td style="${numTd}">${cashTxs.length}</td>
              <td style="${numTd}">${cashTotal.toFixed(2)}</td>
              <td style="${numTd}">-</td>
              <td style="${numTd}font-weight:700;">${cashTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="${tdBase}font-weight:600;">📱 Telebirr</td>
              <td style="${numTd}">${telebirrTxs.length}</td>
              <td style="${numTd}color:#047857;font-weight:600;">${telebirrVerifiedTotal.toFixed(2)}</td>
              <td style="${numTd}color:#B91C1C;font-weight:600;">${telebirrUnverifiedTotal.toFixed(2)}</td>
              <td style="${numTd}font-weight:700;">${telebirrTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="${tdBase}font-weight:600;">🏦 CBE (Commercial Bank)</td>
              <td style="${numTd}">${cbeTxs.length}</td>
              <td style="${numTd}color:#047857;font-weight:600;">${cbeVerifiedTotal.toFixed(2)}</td>
              <td style="${numTd}color:#B91C1C;font-weight:600;">${cbeUnverifiedTotal.toFixed(2)}</td>
              <td style="${numTd}font-weight:700;">${cbeTotal.toFixed(2)}</td>
            </tr>
            ${otherTxs.length > 0 ? `
            <tr>
              <td style="${tdBase}font-weight:600;">💳 Other Bank Transfers</td>
              <td style="${numTd}">${otherTxs.length}</td>
              <td style="${numTd}">-</td>
              <td style="${numTd}">-</td>
              <td style="${numTd}font-weight:700;">${otherTotal.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="background-color:#FDF2F8;">
              <td style="${tdBase}font-weight:700;color:#DB2777;">💝 Waiter Tips Pool</td>
              <td style="${numTd}color:#DB2777;">${txs.filter(t => (t.tip || 0) > 0).length}</td>
              <td style="${numTd}color:#DB2777;font-weight:700;">${totalTipsExcel.toFixed(2)}</td>
              <td style="${numTd}">-</td>
              <td style="${numTd}color:#DB2777;font-weight:700;">${totalTipsExcel.toFixed(2)} (Tips)</td>
            </tr>
            <tr style="background-color:#1E293B;color:#FFFFFF;font-weight:bold;font-size:11pt;">
              <td style="${tdBase}background-color:#1E293B;color:#FFFFFF;">🏆 TOTAL BUSINESS REVENUE</td>
              <td style="${numTd}background-color:#1E293B;color:#FFFFFF;">${txs.length}</td>
              <td style="${numTd}background-color:#1E293B;color:#34D399;">${Math.max(0, cashTotal + telebirrVerifiedTotal + cbeVerifiedTotal - totalTipsExcel).toFixed(2)}</td>
              <td style="${numTd}background-color:#1E293B;color:#FCA5A5;">${(telebirrUnverifiedTotal + cbeUnverifiedTotal).toFixed(2)}</td>
              <td style="${numTd}background-color:#1E293B;color:#FCD34D;font-size:12pt;font-weight:900;">${netGrandTotalExcel.toFixed(2)} ETB</td>
            </tr>
            <tr style="background-color:#0F172A;color:#94A3B8;font-size:10pt;">
              <td colspan="4" style="${tdBase}background-color:#0F172A;text-align:right;color:#94A3B8;">Grand Total Settlements (Net Revenue + Waiter Tips):</td>
              <td style="${numTd}background-color:#0F172A;color:#FFFFFF;font-weight:700;">${grandTotal.toFixed(2)} ETB</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Transaction_Ledger_${from || new Date().toISOString().split('T')[0]}.xls`
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
    { id: 'verification-settings', label: 'Receiver Accounts', icon: <ShieldCheck size={15}/> },
    { id: 'best-sellers', label: 'Best Sellers', icon: <Sparkles size={15}/> },
    { id: 'cancellations', label: 'Cancellations', icon: <XCircle size={15}/> },
    { id: 'inventory-logs', label: 'Audit Trail', icon: <RefreshCw size={15}/> }
  ]

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', color: 'var(--text-secondary)' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--gold)', marginBottom: '16px' }} />
        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>Loading Intelligence Data...</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Calculating financial metrics and sales performance</div>
      </div>
    )
  }

  if (!data) return null

  const avgOrderValue = data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0
  const grossProfitVal = data.grossProfit || 0
  const cogsVal = data.totalCOGS || 0
  const marginPct = data.profitMargin ?? 0

  return (
    <div style={{ paddingBottom: '60px', width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
      
      {/* Dynamic responsive CSS rules for mobile screens */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 767px) {
          .desktop-table-view { display: none !important; }
          .mobile-card-view { display: flex !important; }
          .reports-header-box {
            flex-direction: row !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
          }
          .reports-filter-box {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .reports-period-track {
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .reports-custom-date {
            width: 100% !important;
            display: flex !important;
            justify-content: space-between !important;
          }
          .reports-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
          }
          .reports-kpi-card {
            padding: 12px 14px !important;
            min-height: 90px !important;
          }
          .reports-kpi-val {
            font-size: 18px !important;
            margin-top: 4px !important;
          }
          .reports-kpi-sub {
            font-size: 10px !important;
            margin-top: 4px !important;
          }
          .reports-tabs-track {
            display: none !important;
          }
          .reports-mobile-tab-select {
            display: block !important;
            margin-bottom: 20px !important;
          }
        }
        @media (min-width: 768px) {
          .desktop-table-view { display: block !important; }
          .mobile-card-view { display: none !important; }
          .reports-mobile-tab-select { display: none !important; }
          .reports-tabs-track { display: flex !important; }
        }
      `}} />

      {/* ============================================================ */}
      {/* 1. ELEGANT EXECUTIVE HEADER                                  */}
      {/* ============================================================ */}
      <div className="reports-header-box" style={{
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
            <h1 className="font-cinzel" style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 }}>
              Business Intelligence
            </h1>
            <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: '12px', background: 'rgba(180,138,30,0.12)', color: 'var(--gold-dark)', border: '1px solid rgba(180,138,30,0.25)' }}>
              Live
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', margin: 0 }}>
            Real-time financial analytics, product performance, and operational audit
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={triggerSyncAndRefresh}
            disabled={syncing || loading}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid var(--black-border)',
              background: '#FFFFFF',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: syncing ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              transition: 'all 0.15s ease'
            }}
            title="Synchronize with Cloud & Local DB"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} style={{ color: 'var(--gold)' }} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. STREAMLINED PERIOD & DATE FILTER BAR                      */}
      {/* ============================================================ */}
      <div className="reports-filter-box" style={{
        background: '#FFFFFF',
        border: '1px solid var(--black-border)',
        borderRadius: '12px',
        padding: '10px 14px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.03)'
      }}>
        {/* Period Preset Pills */}
        <div className="reports-period-track" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            Period:
          </span>
          <div style={{
            display: 'inline-flex',
            background: 'var(--black-hover)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--black-border)',
            gap: '2px',
            overflowX: 'auto'
          }} className="hide-scrollbar">
            {([
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: 'Month' },
              { id: 'all', label: 'All Time' }
            ] as const).map(p => {
              const isActive = quickDateActive === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuickDate(p.id)}
                  style={{
                    padding: '6px 12px',
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

        {/* Custom Date Range Controls */}
        <div className="reports-custom-date" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--black-hover)',
          padding: '6px 10px',
          borderRadius: '8px',
          border: quickDateActive === 'custom' ? '1px solid var(--gold)' : '1px solid var(--black-border)',
          fontSize: '12px'
        }}>
          <Calendar size={13} style={{ color: quickDateActive === 'custom' ? 'var(--gold)' : 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>Custom:</span>
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
              cursor: 'pointer',
              minWidth: 0,
              maxWidth: '125px'
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
              cursor: 'pointer',
              minWidth: 0,
              maxWidth: '125px'
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
                marginLeft: '2px'
              }}
              title="Reset to All Time"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. MOBILE QUICK-SWITCH DROPDOWN (< 768px)                   */}
      {/* ============================================================ */}
      <div className="reports-mobile-tab-select" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📊 Active Report Section:
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Tap to switch view
          </span>
        </div>
        <select
          value={activeTab}
          onChange={e => setActiveTab(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: '700',
            borderRadius: '8px',
            border: '1.5px solid var(--gold)',
            background: '#FFFFFF',
            color: 'var(--text-primary)',
            outline: 'none'
          }}
        >
          {tabs.map(t => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* ============================================================ */}
      {/* 4. DESKTOP/TABLET CONNECTED TAB NAVIGATION (>= 768px)       */}
      {/* ============================================================ */}
      <div className="reports-tabs-track hide-scrollbar" style={{
        background: 'var(--black-hover)',
        border: '1px solid var(--black-border)',
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '20px',
        display: 'flex',
        overflowX: 'auto',
        gap: '4px'
      }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Executive KPI Metric Cards (Only on Executive Dashboard) */}
          <div className="reports-kpi-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}>
            {/* Metric 1: Total Revenue */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid var(--gold)',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Revenue
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(180,138,30,0.1)', color: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatMoney(data.totalRevenue)}
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                {data.totalOrders} settled orders
              </div>
            </div>

            {/* Metric 2: Total Cost of Goods */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid #E11D48',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    COGS Expense
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(225,29,72,0.1)', color: '#E11D48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: cogsVal > 0 ? '#E11D48' : 'var(--text-primary)', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatMoney(cogsVal)}
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                {data.totalRevenue > 0 ? `${((cogsVal / data.totalRevenue) * 100).toFixed(1)}% of revenue` : '0% cost ratio'}
              </div>
            </div>

            {/* Metric 3: Gross Profit */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid var(--success)',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Gross Profit
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(5,150,105,0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: grossProfitVal >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatMoney(grossProfitVal)}
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                Revenue minus COGS
              </div>
            </div>

            {/* Metric 4: Profit Margin */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid #6366F1',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Profit Margin
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(99,102,241,0.1)', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Percent size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: '#6366F1', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {marginPct.toFixed(1)}%
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                Operational margin return
              </div>
            </div>

            {/* Metric 5: Average Order Value */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid #F59E0B',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Avg Ticket Size
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Receipt size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: '#B45309', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatMoney(avgOrderValue)}
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                Average guest bill
              </div>
            </div>

            {/* Metric 6: Waiter Tips Collected (Excluded from Revenue & Profit) */}
            <div className="reports-kpi-card" style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--black-border)',
              borderTop: '3px solid #EC4899',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '100px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Waiter Tips Collected
                  </span>
                  <span style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'rgba(236,72,153,0.1)', color: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={12}/>
                  </span>
                </div>
                <div className="reports-kpi-val" style={{ fontSize: '20px', fontWeight: '800', color: '#DB2777', marginTop: '6px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatMoney(data.totalTips || 0)}
                </div>
              </div>
              <div className="reports-kpi-sub" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: '500' }}>
                Held for waitstaff (Excluded from revenue & profit)
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '16px' }}>
          
          {/* Chart A: Daily Sales Bar Chart */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} style={{ color: 'var(--gold)' }} />
                  Daily Revenue Trajectory
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Billing volume for the last 14 active days
                </p>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Swipe ↔
              </span>
            </div>

            {data.dailySales.length > 0 ? (
              <div style={{ overflowX: 'auto', paddingBottom: '6px' }} className="hide-scrollbar">
                <div style={{ minWidth: '380px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', height: '180px', display: 'flex', alignItems: 'flex-end', gap: '8px', borderBottom: '1px solid var(--black-border)', paddingBottom: '4px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => {
                      const maxRev = Math.max(...data.dailySales.slice(0, 14).map(d => d.revenue))
                      const heightPct = maxRev > 0 ? Math.max((day.revenue / maxRev) * 100, 8) : 8
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                          <div style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                            {day.revenue > 999 ? `${(day.revenue / 1000).toFixed(1)}k` : day.revenue.toFixed(0)}
                          </div>
                          <div
                            style={{
                              width: '100%',
                              maxWidth: '32px',
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
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    {data.dailySales.slice(0, 14).reverse().map((day, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', fontWeight: '500', color: 'var(--text-muted)' }}>
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No daily revenue activity recorded.
              </div>
            )}
          </div>

          {/* Chart B: Payment Methods Breakdown */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={16} style={{ color: 'var(--gold)' }} />
              Settlement Channels
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              Incoming revenue distributed by payment method
            </p>

            {Object.keys(data.revenueByMethod).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(data.revenueByMethod).map(([method, amount], i) => {
                  const pct = data.totalRevenue > 0 ? (amount / data.totalRevenue) * 100 : 0
                  const color = ['#B48A1E', '#059669', '#2563EB', '#D97706', '#7C3AED'][i % 5]
                  return (
                    <div key={method} style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--black-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{method}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{pct.toFixed(1)}% of total</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatMoney(amount)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
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
            padding: '16px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Financial Split & Cost Absorption
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Material expense absorption vs retained gross profit
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setActiveTab('profit-loss')}
                style={{ fontSize: '11px', padding: '5px 12px', height: '30px' }}
              >
                P&L Statement →
              </button>
            </div>

            {data.totalRevenue > 0 ? (() => {
              const cogsPct = Math.min(100, Math.max(0, (cogsVal / data.totalRevenue) * 100))
              const profitPct = Math.max(0, 100 - cogsPct)
              return (
                <div>
                  <div style={{ height: '16px', borderRadius: '8px', overflow: 'hidden', display: 'flex', background: 'var(--black-hover)', border: '1px solid var(--black-border)', marginBottom: '10px' }}>
                    <div style={{ width: `${cogsPct}%`, background: '#E11D48', transition: 'width 0.3s ease' }} title={`COGS: ${cogsPct.toFixed(1)}%`} />
                    <div style={{ width: `${profitPct}%`, background: '#059669', transition: 'width 0.3s ease' }} title={`Gross Profit: ${profitPct.toFixed(1)}%`} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#E11D48' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>COGS:</span>
                      <b style={{ color: '#E11D48' }}>{formatMoney(cogsVal)}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({cogsPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#059669' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Profit:</span>
                      <b style={{ color: '#059669' }}>{formatMoney(grossProfitVal)}</b>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({profitPct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              )
            })() : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No revenue activity in this period.</div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. TAB 2: PROFIT & LOSS (P&L) STATEMENT                      */}
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

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Profit & Loss Statement (P&L)
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
                  Per-item profitability, recipe costing, and net margin return
                </p>
              </div>
              <button
                className="btn btn-gold btn-sm"
                onClick={exportProfitLossToExcel}
                style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileSpreadsheet size={13} /> Export P&L (.xls)
              </button>
            </div>

            {/* P&L Executive Summary Strip */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)'
            }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Revenue</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>{formatMoney(totalRev)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>COGS Expense</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#E11D48', marginTop: '2px' }}>{formatMoney(totalCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Waste Loss</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: wasteCost > 0 ? '#DC2626' : 'var(--text-muted)', marginTop: '2px' }}>
                  {wasteCost > 0 ? `-${formatMoney(wasteCost)}` : '0.00 ETB'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Operating Profit</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: netProf >= 0 ? '#059669' : '#DC2626', marginTop: '2px' }}>
                  {formatMoney(netProf)}
                </div>
                <div style={{ fontSize: '10px', color: '#059669', fontWeight: '600' }}>{netMargin.toFixed(1)}% Net Margin</div>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '180px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter items..."
                  value={plSearch}
                  onChange={e => setPlSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--black-border)',
                    outline: 'none',
                    background: 'var(--black-hover)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {(['ALL', 'FOOD', 'DRINKS'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPlTypeFilter(t)}
                    style={{
                      padding: '5px 10px',
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

              <select
                value={plSortBy}
                onChange={e => setPlSortBy(e.target.value as any)}
                style={{
                  padding: '5px 8px',
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

            {/* Desktop Table View */}
            <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item / Category</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Qty</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cost</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Cost</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found.</td></tr>
                  ) : filteredItems.map((item, idx) => {
                    const marginColor = item.profitMargin >= 50 ? '#059669' : item.profitMargin >= 25 ? '#D97706' : '#DC2626'
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.6)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category}</div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'var(--black-hover)', color: 'var(--text-secondary)' }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.price)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{item.costPrice > 0 ? formatMoney(item.costPrice) : '0.00'}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.revenue)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#E11D48', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.totalCost)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: item.grossProfit >= 0 ? '#059669' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.grossProfit)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: marginColor }}>{item.profitMargin.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards View (< 768px) */}
            <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: '#FFFFFF', borderRadius: '10px' }}>No items found.</div>
              ) : filteredItems.map(item => {
                const marginColor = item.profitMargin >= 50 ? '#059669' : item.profitMargin >= 25 ? '#D97706' : '#DC2626'
                return (
                  <div key={item.id} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.category} · {item.type}</div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: marginColor, background: `${marginColor}15`, padding: '2px 8px', borderRadius: '6px' }}>
                        {item.profitMargin.toFixed(1)}% Margin
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: 'var(--black-hover)', padding: '8px 10px', borderRadius: '6px', margin: '8px 0', fontSize: '11px' }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Qty:</span> <b>{item.quantity}</b></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Price:</span> <b>{formatMoney(item.price)}</b></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Cost:</span> <b>{formatMoney(item.costPrice)}</b></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--black-border)', paddingTop: '6px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Revenue: <b style={{ color: 'var(--text-primary)' }}>{formatMoney(item.revenue)}</b></span>
                      <span style={{ color: item.grossProfit >= 0 ? '#059669' : '#DC2626', fontWeight: '700' }}>Profit: {formatMoney(item.grossProfit)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 8. TAB 3: DAILY SALES BREAKDOWN                              */}
      {/* ============================================================ */}
      {activeTab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Daily Sales Audit
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
              Day-by-day revenue, ticket counts, and category drill-downs
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Orders</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.dailySales.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No records found.</td></tr>
                ) : data.dailySales.map(day => {
                  const isExpanded = selectedDay === day.date
                  return (
                    <React.Fragment key={day.date}>
                      <tr
                        onClick={() => setSelectedDay(isExpanded ? null : day.date)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--black-border)',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(180,138,30,0.04)' : '#FFFFFF'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                          {day.orders}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(day.revenue)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--gold-dark)' }}>
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--black-border)' }}>
                          <td colSpan={4} style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                              Breakdown for {new Date(day.date).toLocaleDateString()}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                              {day.categories.map(cat => (
                                <div key={cat.categoryName} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '8px', padding: '10px' }}>
                                  <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--text-primary)', borderBottom: '1px solid var(--black-border)', paddingBottom: '4px', marginBottom: '6px' }}>
                                    {cat.categoryName}
                                  </div>
                                  {cat.items.map(it => (
                                    <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>{it.quantity}x {it.name}</span>
                                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(it.revenue)}</b>
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
      {/* 9. TAB 4: CATEGORIZED ARTICLES                               */}
      {/* ============================================================ */}
      {activeTab === 'categorized' && (() => {
        const report = data.categorizedReport
        if (!report || report.categories.length === 0) {
          return (
            <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No categorized sales records found.
            </div>
          )
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Categorized Articles Summary
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
                  Sales vouchers classified by menu hierarchy
                </p>
              </div>
              <button
                className="btn btn-gold btn-sm"
                onClick={exportCategorizedToExcel}
                style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={13} /> Export Excel (.xls)
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#0F172A', color: '#FFFFFF' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Article Code</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Article Name</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Quantity</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Avg Price</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categories.map(cat => (
                    <React.Fragment key={cat.categoryName}>
                      <tr style={{ background: '#1E293B', color: '#FFFFFF' }}>
                        <td colSpan={5} style={{ padding: '8px 16px', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>
                          {cat.categoryName}
                        </td>
                      </tr>
                      {cat.subCategories.map(sub => (
                        <React.Fragment key={sub.subCategoryName}>
                          <tr style={{ background: 'var(--black-hover)', color: 'var(--text-primary)' }}>
                            <td colSpan={5} style={{ padding: '6px 16px 6px 24px', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--black-border)' }}>
                              ↳ {sub.subCategoryName}
                            </td>
                          </tr>
                          {sub.articles.map(art => (
                            <tr key={art.code} style={{ borderBottom: '1px solid var(--black-border)' }}>
                              <td style={{ padding: '8px 16px 8px 32px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{art.code}</td>
                              <td style={{ padding: '8px 16px', fontWeight: '500' }}>{art.name}</td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{art.quantity.toFixed(2)}</td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{art.avgAmount.toFixed(2)}</td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{art.totalAmount.toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#F8FAFC', fontWeight: '600', borderBottom: '1px solid var(--black-border)', fontSize: '12px' }}>
                            <td colSpan={2} style={{ padding: '6px 16px 6px 32px', color: 'var(--text-secondary)' }}>{sub.subCategoryName} Subtotal</td>
                            <td style={{ padding: '6px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sub.totalQuantity.toFixed(2)}</td>
                            <td></td>
                            <td style={{ padding: '6px 16px', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{sub.totalRevenue.toFixed(2)}</td>
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr style={{ background: '#F1F5F9', fontWeight: '700', borderBottom: '2px solid var(--black-border)', fontSize: '12px' }}>
                        <td colSpan={2} style={{ padding: '8px 16px' }}>{cat.categoryName} Total</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cat.totalQuantity.toFixed(2)}</td>
                        <td></td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{cat.totalRevenue.toFixed(2)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Hierarchical Card View (< 768px) */}
            <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '12px' }}>
              {report.categories.map(cat => (
                <div key={cat.categoryName} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: '#0F172A', color: '#FFFFFF', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', textTransform: 'uppercase' }}>{cat.categoryName}</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--gold-light)' }}>{cat.totalRevenue.toFixed(2)} ETB</span>
                  </div>
                  {cat.subCategories.map(sub => (
                    <div key={sub.subCategoryName} style={{ padding: '10px 14px', borderBottom: '1px solid var(--black-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        {sub.subCategoryName}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sub.articles.map(art => (
                          <div key={art.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <div>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{art.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>×{art.quantity.toFixed(0)}</span>
                            </div>
                            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{art.totalAmount.toFixed(2)} ETB</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Total Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px', background: 'var(--black-hover)', borderRadius: '10px', border: '1px solid var(--black-border)' }}>
              <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>Subtotal:</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{report.subTotal.toFixed(2)} ETB</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)', borderTop: '1px solid var(--black-border)', paddingTop: '6px' }}>
                  <span>Grand Total:</span>
                  <span style={{ color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{report.grandTotal.toFixed(2)} ETB</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 10. TAB 5: TRANSACTION HISTORY LEDGER                        */}
      {/* ============================================================ */}
      {activeTab === 'history' && (() => {
        const txs = data.transactions || []

        // Summary calculations
        const tipsTotal = txs.reduce((sum, t) => sum + (t.tip || 0), 0)
        const tipsCount = txs.filter(t => (t.tip || 0) > 0).length

        const cashTxs = txs.filter(t => t.method === 'Cash')
        const telebirrTxs = txs.filter(t => t.method.toLowerCase().includes('telebirr'))
        const cbeTxs = txs.filter(t => t.method.toLowerCase().includes('cbe'))

        const cashTotal = cashTxs.reduce((sum, t) => sum + t.amount, 0)
        const telebirrTotal = telebirrTxs.reduce((sum, t) => sum + t.amount, 0)
        const telebirrVerifiedCount = telebirrTxs.filter(t => t.isVerified).length

        const cbeTotal = cbeTxs.reduce((sum, t) => sum + t.amount, 0)
        const cbeVerifiedCount = cbeTxs.filter(t => t.isVerified).length

        const grandTotal = txs.reduce((sum, t) => sum + t.amount, 0)

        // Filter transactions
        const filteredTxs = txs.filter(t => {
          // Method filter
          if (ledgerMethodFilter === 'Cash' && t.method !== 'Cash') return false
          if (ledgerMethodFilter === 'Telebirr' && !t.method.toLowerCase().includes('telebirr')) return false
          if (ledgerMethodFilter === 'CBE' && !t.method.toLowerCase().includes('cbe')) return false

          // Status filter
          if (ledgerStatusFilter === 'VERIFIED' && !t.isVerified) return false
          if (ledgerStatusFilter === 'UNVERIFIED' && (t.method === 'Cash' || t.isVerified)) return false

          // Search term
          if (ledgerSearch.trim()) {
            const q = ledgerSearch.toLowerCase()
            const matchTable = t.table?.toLowerCase().includes(q)
            const matchCashier = t.cashier?.toLowerCase().includes(q)
            const matchWaiter = t.waiter?.toLowerCase().includes(q)
            const matchRef = t.verifiedRef?.toLowerCase().includes(q)
            const matchPayer = t.verifiedPayer?.toLowerCase().includes(q)
            const matchReceiver = t.verifiedReceiver?.toLowerCase().includes(q)
            const matchItems = t.items?.toLowerCase().includes(q)
            if (!matchTable && !matchCashier && !matchWaiter && !matchRef && !matchPayer && !matchReceiver && !matchItems) {
              return false
            }
          }
          return true
        })

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header + Export to Excel Button + Receiver Accounts Quick Access */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Transaction Ledger & Payment Audit</span>
                  <span style={{ fontSize: '11px', background: 'rgba(180,138,30,0.12)', color: 'var(--gold-dark)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(180,138,30,0.25)', fontWeight: '700' }}>
                    {txs.length} Settled
                  </span>
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
                  Chronological customer payment settlements, bank referral codes, and waiter tip distribution audit
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActiveTab('verification-settings')}
                  style={{
                    fontSize: '12px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: '600'
                  }}
                >
                  <ShieldCheck size={14} style={{ color: 'var(--gold-dark)' }} />
                  <span>Receiver Accounts</span>
                </button>

                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  onClick={exportLedgerToExcel}
                  style={{
                    fontSize: '12px',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: '700',
                    boxShadow: '0 2px 6px rgba(180,138,30,0.25)'
                  }}
                >
                  <Download size={14} />
                  <span>Export Ledger to Excel (.xls)</span>
                </button>
              </div>
            </div>

            {/* Financial Summary Metric Bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px'
            }}>
              {/* Cash Summary */}
              <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderTop: '3px solid #059669', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  💵 Cash Revenue
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(cashTotal)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {cashTxs.length} settled orders
                </div>
              </div>

              {/* Telebirr Summary */}
              <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderTop: '3px solid #0284C7', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📱 Telebirr Revenue
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(telebirrTotal)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {telebirrTxs.length} orders · <b style={{ color: '#059669' }}>{telebirrVerifiedCount} Verified</b>
                </div>
              </div>

              {/* CBE Summary */}
              <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderTop: '3px solid #D97706', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  🏦 CBE Revenue
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(cbeTotal)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {cbeTxs.length} orders · <b style={{ color: '#059669' }}>{cbeVerifiedCount} Verified</b>
                </div>
              </div>

              {/* Waiter Tips Summary Card */}
              <div style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderTop: '3px solid #EC4899', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#EC4899', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  💝 Waiter Tips Pool
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#DB2777', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(tipsTotal)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {tipsCount} tipped orders · (Held for waiters)
                </div>
              </div>

              {/* Grand Total */}
              <div style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(180,138,30,0.06) 100%)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  🏆 Total Settled
                </div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(grandTotal)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {txs.length} total settlements
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid var(--black-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              {/* Channel Filter Pills */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>
                  Channel:
                </span>
                {([
                  { id: 'ALL', label: `All (${txs.length})` },
                  { id: 'Cash', label: `💵 Cash (${cashTxs.length})` },
                  { id: 'Telebirr', label: `📱 Telebirr (${telebirrTxs.length})` },
                  { id: 'CBE', label: `🏦 CBE (${cbeTxs.length})` }
                ] as const).map(p => {
                  const isActive = ledgerMethodFilter === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLedgerMethodFilter(p.id)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        fontWeight: isActive ? '700' : '500',
                        borderRadius: '6px',
                        border: 'none',
                        background: isActive ? '#0F172A' : 'var(--black-hover)',
                        color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {/* Status Filter & Search Input */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={ledgerStatusFilter}
                  onChange={e => setLedgerStatusFilter(e.target.value as any)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    border: '1px solid var(--black-border)',
                    background: '#FFFFFF',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="VERIFIED">✓ Verified Only</option>
                  <option value="UNVERIFIED">⚠️ Unverified Digital</option>
                </select>

                <div style={{ position: 'relative', minWidth: '180px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="Search table, ref, staff..."
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 26px',
                      fontSize: '11px',
                      borderRadius: '6px',
                      border: '1px solid var(--black-border)',
                      background: 'var(--black-hover)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                  {ledgerSearch && (
                    <button
                      type="button"
                      onClick={() => setLedgerSearch('')}
                      style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Table</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Staff</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Items</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Method</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verification & Reference Code</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: '#EC4899', textTransform: 'uppercase' }}>Tip (ETB)</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Settled</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No transactions matching current filters.
                      </td>
                    </tr>
                  ) : filteredTxs.map((tx, idx) => {
                    const isCash = tx.method === 'Cash'
                    const isTele = tx.method.toLowerCase().includes('telebirr')
                    const isCBE = tx.method.toLowerCase().includes('cbe')
                    const methodColor = isCash ? '#059669' : isTele ? '#0284C7' : isCBE ? '#D97706' : '#64748B'
                    const methodBg = isCash ? 'rgba(5,150,105,0.1)' : isTele ? 'rgba(2,132,199,0.1)' : isCBE ? 'rgba(217,119,6,0.1)' : 'rgba(100,116,139,0.1)'
                    const tip = tx.tip || 0
                    const net = tx.netAmount !== undefined ? tx.netAmount : Math.max(0, tx.amount - tip)

                    return (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {new Date(tx.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {new Date(tx.date).toLocaleDateString('en-US')}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: '700' }}>Table {tx.table}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: '600' }}>{tx.waiter}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cashier: {tx.cashier}</div>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: '220px', fontSize: '12px' }}>{tx.items}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: methodBg, color: methodColor }}>
                            {tx.method}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {isCash ? (
                            <span style={{ fontSize: '11px', color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                              💵 Cash - Register Settled
                            </span>
                          ) : tx.isVerified ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '9px', background: '#10B981', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: '800' }}>
                                  ✓ VERIFIED
                                </span>
                                <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)', fontSize: '12px' }}>
                                  {tx.verifiedRef}
                                </span>
                              </div>
                              {(tx.verifiedPayer || tx.verifiedReceiver) && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  {tx.verifiedReceiver ? `Credited: ${tx.verifiedReceiver}` : ''}
                                  {tx.verifiedPayer ? ` · Payer: ${tx.verifiedPayer}` : ''}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '9px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#DC2626', padding: '1px 6px', borderRadius: '3px', fontWeight: '800', width: 'fit-content' }}>
                                ⚠️ UNVERIFIED
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No bank receipt slip linked
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {tip > 0 ? (
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#DB2777', background: 'rgba(236,72,153,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(236,72,153,0.25)' }}>
                              +{tip.toFixed(2)} ETB
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums', fontSize: '14px' }}>
                          <div>{formatMoney(tx.amount)}</div>
                          {tip > 0 && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500' }}>
                              Net: {formatMoney(net)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards View (< 768px) */}
            <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
              {filteredTxs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: '#FFFFFF', borderRadius: '10px' }}>
                  No transactions found.
                </div>
              ) : filteredTxs.map(tx => {
                const isCash = tx.method === 'Cash'
                const isTele = tx.method.toLowerCase().includes('telebirr')
                const isCBE = tx.method.toLowerCase().includes('cbe')
                const methodColor = isCash ? '#059669' : isTele ? '#0284C7' : isCBE ? '#D97706' : '#64748B'
                const methodBg = isCash ? 'rgba(5,150,105,0.1)' : isTele ? 'rgba(2,132,199,0.1)' : isCBE ? 'rgba(217,119,6,0.1)' : 'rgba(100,116,139,0.1)'
                const tip = tx.tip || 0
                const net = tx.netAmount !== undefined ? tx.netAmount : Math.max(0, tx.amount - tip)

                return (
                  <div key={tx.id} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>Table {tx.table}</span>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: methodBg, color: methodColor }}>
                        {tx.method}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 6px 0' }}>
                      {new Date(tx.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · Waiter: {tx.waiter} (Cashier: {tx.cashier})
                    </div>

                    {/* Verification Status Pill on Mobile */}
                    <div style={{ marginBottom: '8px' }}>
                      {isCash ? (
                        <span style={{ fontSize: '10px', color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                          💵 Cash - Register Settled
                        </span>
                      ) : tx.isVerified ? (
                        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '9px', background: '#10B981', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: '800' }}>
                              ✓ VERIFIED
                            </span>
                            <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)', fontSize: '11px' }}>
                              {tx.verifiedRef}
                            </span>
                          </div>
                          {(tx.verifiedPayer || tx.verifiedReceiver) && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {tx.verifiedReceiver ? `Credited: ${tx.verifiedReceiver}` : ''}
                              {tx.verifiedPayer ? ` · Payer: ${tx.verifiedPayer}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '9px', background: '#EF4444', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: '800' }}>
                            ⚠️ UNVERIFIED
                          </span>
                          <span style={{ fontSize: '10px', color: '#DC2626' }}>No slip linked</span>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--black-hover)', padding: '6px 8px', borderRadius: '6px', marginBottom: '8px' }}>
                      {tx.items}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--black-border)', paddingTop: '6px' }}>
                      <div>
                        {tip > 0 ? (
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#DB2777', background: 'rgba(236,72,153,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            💝 Tip: +{tip.toFixed(2)} ETB
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No tip</span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <b style={{ fontSize: '14px', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(tx.amount)}</b>
                        {tip > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Net: {formatMoney(net)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ============================================================ */}
      {/* 11. TAB 6: BEST SELLERS RANKING                              */}
      {/* ============================================================ */}
      {activeTab === 'best-sellers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Top Selling Articles
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
              Popularity rank, revenue contribution, and unit margins
            </p>
          </div>

          {/* Desktop Table View */}
          <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'center', width: '50px', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)' }}>Rank</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item Name</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sold</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revenue</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.bestSelling.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items sold yet.</td></tr>
                ) : data.bestSelling.map((item, idx) => {
                  const margin = item.profitMargin ?? 0
                  const marginColor = margin >= 50 ? '#059669' : margin >= 25 ? '#D97706' : '#DC2626'
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: idx < 3 ? 'var(--gold)' : 'var(--black-hover)',
                          color: idx < 3 ? '#FFFFFF' : 'var(--text-secondary)'
                        }}>
                          {idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: '600' }}>{item.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{item.category}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.revenue)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: (item.profit ?? 0) >= 0 ? '#059669' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{item.profit !== undefined ? formatMoney(item.profit) : '-'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: marginColor }}>{margin.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (< 768px) */}
          <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
            {data.bestSelling.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: '#FFFFFF', borderRadius: '10px' }}>No items sold yet.</div>
            ) : data.bestSelling.map((item, idx) => {
              const margin = item.profitMargin ?? 0
              const marginColor = margin >= 50 ? '#059669' : margin >= 25 ? '#D97706' : '#DC2626'
              return (
                <div key={idx} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: idx < 3 ? 'var(--gold)' : 'var(--black-hover)', color: idx < 3 ? '#FFFFFF' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '11px', flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category} · {item.quantity} units</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gold-dark)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.revenue)}</div>
                    <div style={{ fontSize: '10px', color: marginColor, fontWeight: '700' }}>{margin.toFixed(1)}% margin</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 12. TAB 7: CANCELLATIONS & VOIDS                             */}
      {/* ============================================================ */}
      {activeTab === 'cancellations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Cancellations & Voids
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
              Supervisor authorizations and cancellation rationale
            </p>
          </div>

          {/* Desktop Table View */}
          <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Item</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Table & Waiter</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reason</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Authorized By</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.cancellations.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <CheckCircle2 size={20} style={{ color: 'var(--success)', margin: '0 auto 6px auto', display: 'block' }} />
                      No cancellations recorded in this period.
                    </td>
                  </tr>
                ) : data.cancellations.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--black-border)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: '600', color: '#DC2626' }}>
                      {c.orderItem.quantity}x {c.orderItem.menuItem.name}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: '600' }}>Table {c.orderItem.order.table.number}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Waiter: {c.orderItem.order.waiter.fullName}</div>
                    </td>
                    <td style={{ padding: '10px 16px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{c.reason}"</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', background: 'var(--black-hover)' }}>
                        {c.manager.fullName}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (< 768px) */}
          <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
            {data.cancellations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: '#FFFFFF', borderRadius: '10px' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--success)', margin: '0 auto 6px auto', display: 'block' }} />
                No cancellations recorded in this period.
              </div>
            ) : data.cancellations.map(c => (
              <div key={c.id} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderTop: '2px solid #DC2626', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#DC2626', fontSize: '13px' }}>{c.orderItem.quantity}x {c.orderItem.menuItem.name}</b>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Table {c.orderItem.order.table.number}</span>
                </div>
                <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--text-secondary)', margin: '4px 0' }}>
                  "{c.reason}"
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--black-border)', paddingTop: '4px' }}>
                  <span>Auth: {c.manager.fullName}</span>
                  <span>{new Date(c.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 13. TAB 8: INVENTORY AUDIT TRAIL                             */}
      {/* ============================================================ */}
      {activeTab === 'inventory-logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Inventory Control & Audit Trail
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0 0' }}>
              Historical movements, additions, transfers, and spoilage records
            </p>
          </div>

          {/* Desktop Table View */}
          <div className="desktop-table-view" style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--black-hover)', borderBottom: '1px solid var(--black-border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Article</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delta</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>New Qty</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operator</th>
                </tr>
              </thead>
              <tbody>
                {(data.inventoryLogs || []).length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No logs found.</td></tr>
                ) : (data.inventoryLogs || []).map((log, idx) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--black-border)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(248,250,252,0.5)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: '600' }}>{log.itemName}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'var(--black-hover)' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: log.action.startsWith('WASTE') ? '#DC2626' : '#059669', fontVariantNumeric: 'tabular-nums' }}>
                      {log.action.startsWith('WASTE') ? `-${log.quantity}` : `+${log.quantity}`}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{log.newQty}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{log.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards View (< 768px) */}
          <div className="mobile-card-view" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
            {(data.inventoryLogs || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: '#FFFFFF', borderRadius: '10px' }}>No logs recorded.</div>
            ) : (data.inventoryLogs || []).map(log => (
              <div key={log.id} style={{ background: '#FFFFFF', border: '1px solid var(--black-border)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px' }}>{log.itemName}</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'var(--black-hover)' }}>
                    {log.action}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>Delta: <b style={{ color: log.action.startsWith('WASTE') ? '#DC2626' : '#059669' }}>{log.action.startsWith('WASTE') ? `-${log.quantity}` : `+${log.quantity}`}</b></span>
                  <span>New Qty: <b>{log.newQty}</b></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--black-border)', paddingTop: '4px', marginTop: '6px' }}>
                  <span>User: {log.userName}</span>
                  <span>{new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 15. TAB: OFFICIAL RECEIVER ACCOUNT VERIFICATION SETTINGS     */}
      {/* ============================================================ */}
      {activeTab === 'verification-settings' && (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--black-border)',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 2px 8px rgba(15,23,42,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(180,138,30,0.12)',
                border: '1px solid rgba(180,138,30,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold-dark)'
              }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                  Official Receiver Account Verification
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '2px 0 0 0' }}>
                  Protect your restaurant from payment fraud by registering your official Telebirr and CBE accounts
                </p>
              </div>
            </div>

            <div style={{
              margin: '16px 0',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              fontSize: '13px',
              color: '#1E40AF',
              lineHeight: 1.5
            }}>
              <b>🛡️ Fraud Protection Active:</b> When staff scan customer Telebirr or CBE QR slips, the system automatically checks that the <i>Credited Party Account</i> matches the official accounts configured below. If someone presents a slip paid to a personal number or another restaurant, verification will <b>immediately fail and alert the cashier</b>.
            </div>

            <form onSubmit={handleSavePaymentSettings} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Telebirr Phone */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  <Phone size={14} style={{ color: '#0284C7' }} />
                  <span>Official Telebirr Receiver Phone Number</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 0911234567 or 0966444000"
                  value={telebirrPhone}
                  onChange={e => setTelebirrPhone(e.target.value)}
                  style={{ fontSize: '14px', fontFamily: 'monospace' }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  The merchant or merchant-pay phone number registered to receive customer Telebirr transfers.
                </p>
              </div>

              {/* CBE Account */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  <CreditCard size={14} style={{ color: '#D97706' }} />
                  <span>Official Commercial Bank of Ethiopia (CBE) Account Number</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 1000123456789 (13 digits)"
                  value={cbeAccount}
                  onChange={e => setCbeAccount(e.target.value)}
                  style={{ fontSize: '14px', fontFamily: 'monospace' }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Your restaurant's CBE account number. Matches the receiving account on CBE mobile banking slips and FT codes.
                </p>
              </div>

              {/* Merchant Display Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  🏢 Restaurant / Merchant Business Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Kogna Coffee"
                  value={merchantName}
                  onChange={e => setMerchantName(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </div>

              {/* Status Indicator */}
              <div style={{
                background: (telebirrPhone && cbeAccount) ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${(telebirrPhone && cbeAccount) ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <CheckCircle2 size={18} color={(telebirrPhone && cbeAccount) ? '#059669' : '#D97706'} />
                <div>
                  <div style={{ fontWeight: '700', color: (telebirrPhone && cbeAccount) ? '#059669' : '#B45309' }}>
                    {(telebirrPhone && cbeAccount) ? 'Verification Enforced & Active' : 'Configuration Notice'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {telebirrPhone ? `Telebirr: ${telebirrPhone}` : 'Telebirr phone not set'} · {cbeAccount ? `CBE: ${cbeAccount}` : 'CBE account not set'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={loadPaymentSettings}
                  disabled={savingSettings}
                >
                  Reload
                </button>
                <button
                  type="submit"
                  className="btn btn-gold"
                  disabled={savingSettings}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontWeight: '700' }}
                >
                  <Save size={16} />
                  <span>{savingSettings ? 'Saving...' : 'Save Receiver Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
