import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to + 'T23:59:59') }),
  }

  const [payments, orders, orderItems, cancellations, inventory, inventoryLogs] = await Promise.all([
    prisma.payment.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      include: {
        order: {
          include: {
            table: true,
            waiter: { select: { fullName: true } },
            orderItems: { include: { menuItem: { include: { category: true } } } },
          },
        },
        cashier: { select: { fullName: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: 'PAID', ...(from || to ? { createdAt: dateFilter } : {}) },
    }),
    prisma.orderItem.findMany({
      where: { status: { not: 'CANCELLED' }, ...(from || to ? { createdAt: dateFilter } : {}) },
      include: { menuItem: { include: { category: true } } },
    }),
    prisma.cancellation.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      include: {
        orderItem: { include: { menuItem: true, order: { include: { table: true, waiter: { select: { fullName: true } } } } } },
        manager: { select: { fullName: true } },
      },
    }),
    prisma.menuItem.findMany({ include: { category: true }, orderBy: { name: 'asc' } }),
    prisma.inventoryLog.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Total revenue
  const totalRevenue = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100

  // Revenue by payment method
  const revenueByMethod: Record<string, number> = {}
  payments.forEach(p => { revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + p.amount })

  // Profit and Loss calculations from completed payments
  let totalCOGS = 0
  const itemProfitMap: Record<string, {
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
  }> = {}

  const categoryTypeProfitMap: Record<string, {
    category: string
    quantity: number
    revenue: number
    cost: number
    grossProfit: number
    profitMargin: number
  }> = {}

  payments.forEach(p => {
    p.order.orderItems.forEach((oi: any) => {
      if (oi.status === 'CANCELLED') return

      const costPrice = Number(oi.menuItem.costPrice || 0)
      const sellPrice = Number(oi.menuItem.price || 0)
      const qty = Number(oi.quantity || 0)
      const lineCost = qty * costPrice
      const lineRev = qty * sellPrice

      totalCOGS += lineCost

      const rawType = oi.menuItem.category?.type || 'FOOD'
      const typeName = rawType === 'DRINK' ? 'BEVERAGE' : rawType
      const catName = oi.menuItem.category?.name || 'Uncategorized'
      const itemId = oi.menuItemId

      if (!itemProfitMap[itemId]) {
        itemProfitMap[itemId] = {
          id: itemId,
          name: oi.menuItem.name,
          category: catName,
          type: typeName,
          quantity: 0,
          price: sellPrice,
          costPrice,
          revenue: 0,
          totalCost: 0,
          grossProfit: 0,
          profitMargin: 0,
        }
      }
      itemProfitMap[itemId].quantity += qty
      itemProfitMap[itemId].revenue += lineRev
      itemProfitMap[itemId].totalCost += lineCost

      if (!categoryTypeProfitMap[typeName]) {
        categoryTypeProfitMap[typeName] = {
          category: typeName,
          quantity: 0,
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          profitMargin: 0,
        }
      }
      categoryTypeProfitMap[typeName].quantity += qty
      categoryTypeProfitMap[typeName].revenue += lineRev
      categoryTypeProfitMap[typeName].cost += lineCost
    })
  })

  // Format profit by item
  const profitByItem = Object.values(itemProfitMap).map(item => {
    const rev = Math.round(item.revenue * 100) / 100
    const cost = Math.round(item.totalCost * 100) / 100
    const profit = Math.round((rev - cost) * 100) / 100
    const margin = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0
    return {
      ...item,
      revenue: rev,
      totalCost: cost,
      grossProfit: profit,
      profitMargin: margin,
    }
  }).sort((a, b) => b.grossProfit - a.grossProfit)

  // Format profit by category
  const profitByCategory = Object.values(categoryTypeProfitMap).map(cat => {
    const rev = Math.round(cat.revenue * 100) / 100
    const cost = Math.round(cat.cost * 100) / 100
    const profit = Math.round((rev - cost) * 100) / 100
    const margin = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0
    return {
      ...cat,
      revenue: rev,
      cost,
      grossProfit: profit,
      profitMargin: margin,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  totalCOGS = Math.round(totalCOGS * 100) / 100
  const grossProfit = Math.round((totalRevenue - totalCOGS) * 100) / 100
  const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0

  // Best selling items
  const itemSales: Record<string, { 
    name: string; 
    category: string; 
    quantity: number; 
    revenue: number;
    costPrice: number;
    totalCost: number;
    profit: number;
    profitMargin: number;
  }> = {}
  orderItems.forEach(oi => {
    const key = oi.menuItemId
    const costPrice = Number(oi.menuItem.costPrice || 0)
    if (!itemSales[key]) {
      itemSales[key] = { 
        name: oi.menuItem.name, 
        category: oi.menuItem.category?.name || '', 
        quantity: 0, 
        revenue: 0,
        costPrice,
        totalCost: 0,
        profit: 0,
        profitMargin: 0,
      }
    }
    const itemRev = oi.quantity * oi.menuItem.price
    const itemCost = oi.quantity * costPrice
    itemSales[key].quantity += oi.quantity
    itemSales[key].revenue += itemRev
    itemSales[key].totalCost += itemCost
    itemSales[key].profit += (itemRev - itemCost)
    itemSales[key].profitMargin = itemSales[key].revenue > 0 ? Math.round((itemSales[key].profit / itemSales[key].revenue) * 1000) / 10 : 0
  })
  const bestSelling = Object.values(itemSales).sort((a, b) => b.quantity - a.quantity).slice(0, 10)

  // Staff performance
  const staffPerf: Record<string, { name: string; orders: number; revenue: number }> = {}
  payments.forEach(p => {
    const name = p.order.waiter.fullName
    if (!staffPerf[name]) staffPerf[name] = { name, orders: 0, revenue: 0 }
    staffPerf[name].orders++
    staffPerf[name].revenue += p.amount
  })

  // Transactions
  const transactions = payments.map(p => ({
    id: p.id,
    date: p.createdAt,
    amount: p.amount,
    method: p.method,
    cashier: p.cashier?.fullName || 'Unknown',
    waiter: p.order.waiter.fullName,
    table: p.order.table.number,
    items: p.order.orderItems.map((oi: any) => `${oi.quantity}x ${oi.menuItem.name}`).join(', ')
  }))

  // Daily Sales with per-category item breakdown
  const dailyMap: Record<string, {
    date: string; orders: number; revenue: number
    categories: Record<string, { categoryName: string; items: Record<string, { name: string; quantity: number; revenue: number }> }>
  }> = {}

  payments.forEach(p => {
    const d = new Date(p.createdAt).toISOString().split('T')[0]
    if (!dailyMap[d]) dailyMap[d] = { date: d, orders: 0, revenue: 0, categories: {} }
    dailyMap[d].orders++
    dailyMap[d].revenue += p.amount

    p.order.orderItems.forEach((oi: any) => {
      if (oi.status === 'CANCELLED') return
      const catName = oi.menuItem.category?.name || 'Uncategorized'
      if (!dailyMap[d].categories[catName]) dailyMap[d].categories[catName] = { categoryName: catName, items: {} }
      const key = oi.menuItemId
      if (!dailyMap[d].categories[catName].items[key]) {
        dailyMap[d].categories[catName].items[key] = { name: oi.menuItem.name, quantity: 0, revenue: 0 }
      }
      dailyMap[d].categories[catName].items[key].quantity += oi.quantity
      dailyMap[d].categories[catName].items[key].revenue += oi.quantity * oi.menuItem.price
    })
  })

  const dailySales = Object.values(dailyMap)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(d => ({
      ...d,
      categories: Object.values(d.categories).map(cat => ({
        categoryName: cat.categoryName,
        items: Object.values(cat.items).sort((a, b) => b.quantity - a.quantity)
      }))
    }))

  // Low stock items
  const lowStock = inventory.filter(i => i.stockQuantity <= i.lowStockThreshold)

  // Generate deterministic Article Codes (P-0001, P-0002, etc.)
  const sortedInventory = [...inventory].sort((a, b) => a.name.localeCompare(b.name))
  const itemCodeMap = new Map<string, string>()
  sortedInventory.forEach((item, index) => {
    itemCodeMap.set(item.id, `P-${(index + 1).toString().padStart(4, '0')}`)
  })

  // Categorized Sales Report data
  const categoryGroups: Record<string, {
    categoryName: string
    subCategories: Record<string, {
      subCategoryName: string
      articles: Record<string, {
        code: string
        name: string
        quantity: number
        avgAmount: number
        totalAmount: number
      }>
    }>
  }> = {}

  let totalRetailDiscount = 0

  payments.forEach(p => {
    totalRetailDiscount += p.discount || 0
    p.order.orderItems.forEach((oi: any) => {
      if (oi.status === 'CANCELLED') return
      
      const rawType = oi.menuItem.category?.type || 'FOOD'
      const categoryName = rawType === 'DRINK' ? 'BEVERAGE' : rawType
      const subCategoryName = oi.menuItem.category?.name || 'Uncategorized'
      
      if (!categoryGroups[categoryName]) {
        categoryGroups[categoryName] = { categoryName, subCategories: {} }
      }
      
      if (!categoryGroups[categoryName].subCategories[subCategoryName]) {
        categoryGroups[categoryName].subCategories[subCategoryName] = { subCategoryName, articles: {} }
      }
      
      const articleId = oi.menuItemId
      const itemCode = itemCodeMap.get(articleId) || `P-${articleId.slice(-4).toUpperCase()}`
      
      if (!categoryGroups[categoryName].subCategories[subCategoryName].articles[articleId]) {
        categoryGroups[categoryName].subCategories[subCategoryName].articles[articleId] = {
          code: itemCode,
          name: oi.menuItem.name,
          quantity: 0,
          avgAmount: oi.menuItem.price,
          totalAmount: 0
        }
      }
      
      const art = categoryGroups[categoryName].subCategories[subCategoryName].articles[articleId]
      art.quantity += oi.quantity
      art.totalAmount = Math.round(art.quantity * art.avgAmount * 100) / 100
    })
  })

  const formattedCategories = Object.values(categoryGroups).map(cat => {
    const subCategories = Object.values(cat.subCategories).map(sub => {
      const articles = Object.values(sub.articles).sort((a, b) => a.name.localeCompare(b.name))
      const totalQuantity = articles.reduce((sum, a) => sum + a.quantity, 0)
      const totalRevenue = Math.round(articles.reduce((sum, a) => sum + a.totalAmount, 0) * 100) / 100
      
      return {
        subCategoryName: sub.subCategoryName.toUpperCase(),
        articles,
        totalQuantity,
        totalRevenue
      }
    }).sort((a, b) => a.subCategoryName.localeCompare(b.subCategoryName))

    const totalQuantity = subCategories.reduce((sum, s) => sum + s.totalQuantity, 0)
    const totalRevenue = Math.round(subCategories.reduce((sum, s) => sum + s.totalRevenue, 0) * 100) / 100

    return {
      categoryName: cat.categoryName,
      subCategories,
      totalQuantity,
      totalRevenue
    }
  }).sort((a, b) => b.categoryName.localeCompare(a.categoryName))

  const repSubTotal = Math.round(formattedCategories.reduce((sum, c) => sum + c.totalRevenue, 0) * 100) / 100
  const repDiscount = Math.round(totalRetailDiscount * 100) / 100
  const repGrandTotal = Math.round((repSubTotal - repDiscount) * 100) / 100
  const repTax = 0
  const repServiceCharge = 0

  const categorizedReport = {
    categories: formattedCategories,
    subTotal: repSubTotal,
    serviceCharge: repServiceCharge,
    discount: repDiscount,
    tax: repTax,
    grandTotal: repGrandTotal
  }

  return NextResponse.json({
    totalRevenue,
    totalCOGS,
    grossProfit,
    profitMargin,
    profitByCategory,
    profitByItem,
    totalOrders: orders.length,
    revenueByMethod,
    bestSelling,
    staffPerformance: Object.values(staffPerf),
    cancellations,
    inventory,
    lowStock,
    transactions,
    dailySales,
    categorizedReport,
    inventoryLogs,
  })
}
