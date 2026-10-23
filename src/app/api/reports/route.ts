import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseDateFilter } from '@/lib/date-utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const tz = searchParams.get('tz')

  const dateFilter = parseDateFilter(from, to, tz)

  const [payments, orders, orderItems, cancellations, inventory, inventoryLogs, allIngredients] = await Promise.all([
    prisma.payment.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      include: {
        order: {
          include: {
            table: true,
            waiter: { select: { fullName: true } },
            orderItems: { include: { menuItem: { include: { category: true, recipes: { include: { ingredient: true } } } } } },
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
      include: { menuItem: { include: { category: true, recipes: { include: { ingredient: true } } } } },
    }),
    prisma.cancellation.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      include: {
        orderItem: { include: { menuItem: true, order: { include: { table: true, waiter: { select: { fullName: true } } } } } },
        manager: { select: { fullName: true } },
      },
    }),
    prisma.menuItem.findMany({
      include: {
        category: true,
        recipes: { include: { ingredient: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryLog.findMany({
      where: from || to ? { createdAt: dateFilter } : {},
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
    }),
  ])

  // Helper to compute effective cost price for a menu item
  // If it has a recipe with ingredient costs > 0, sum recipe ingredient costs!
  // If direct costPrice is also set (packaging, cups), add them together so all costs are captured.
  function getItemCost(menuItem: any): { cost: number; isRecipe: boolean; recipeCost: number } {
    if (!menuItem) return { cost: 0, isRecipe: false, recipeCost: 0 }
    let calculatedRecipeCost = 0
    const hasRecipe = Array.isArray(menuItem.recipes) && menuItem.recipes.length > 0
    if (hasRecipe) {
      for (const r of menuItem.recipes) {
        const ingUnitCost = Number(r.ingredient?.costPerUnit || 0)
        calculatedRecipeCost += Number(r.quantity || 0) * ingUnitCost
      }
      calculatedRecipeCost = Math.round(calculatedRecipeCost * 100) / 100
    }

    const directCost = Number(menuItem.costPrice || 0)
    const effectiveCost = calculatedRecipeCost > 0 ? (directCost + calculatedRecipeCost) : directCost
    return {
      cost: Math.round(effectiveCost * 100) / 100,
      isRecipe: hasRecipe,
      recipeCost: calculatedRecipeCost
    }
  }

  // Helper to extract tip from payment notes
  function extractTip(p: any): number {
    const match = p.notes?.match(/\[Tip:\s*([\d.]+)\s*ETB\]/i)
    return match ? parseFloat(match[1]) || 0 : 0
  }

  // Total waiter tips collected across all payments (held for waitstaff)
  const totalTips = Math.round(payments.reduce((sum, p) => sum + extractTip(p), 0) * 100) / 100

  // Total business revenue: restaurant sales excluding waiter tips
  const totalRevenue = Math.round((payments.reduce((sum, p) => sum + Math.max(0, p.amount - extractTip(p)), 0)) * 100) / 100

  // Revenue by payment method (Net of tips)
  const revenueByMethod: Record<string, number> = {}
  payments.forEach(p => { 
    const tip = extractTip(p)
    const net = Math.max(0, p.amount - tip)
    revenueByMethod[p.method] = (revenueByMethod[p.method] || 0) + net 
  })

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
    isRecipe?: boolean
    recipeCost?: number
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

      const { cost: costPrice, isRecipe, recipeCost } = getItemCost(oi.menuItem)
      const sellPrice = Number(oi.menuItem.price || 0)
      const qty = Number(oi.quantity || 0)
      const lineCost = qty * costPrice
      const lineRev = qty * sellPrice

      totalCOGS += lineCost

      const rawType = oi.menuItem.category?.type || 'FOOD'
      const typeName = (rawType === 'DRINK' || rawType === 'DRINKS') ? 'DRINKS' : rawType
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
          isRecipe,
          recipeCost,
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

  // --- Waste & Spoilage Cost Calculations ---
  const ingredientCostMap = new Map<string, number>()
  allIngredients.forEach(ing => {
    ingredientCostMap.set(ing.name.toLowerCase().trim(), Number(ing.costPerUnit || 0))
  })

  const menuItemCostMap = new Map<string, number>()
  inventory.forEach(item => {
    const { cost } = getItemCost(item)
    menuItemCostMap.set(item.name.toLowerCase().trim(), cost)
  })

  let totalWasteCost = 0
  let totalWasteQty = 0

  const wasteLogs = inventoryLogs.filter(
    l => l.action && typeof l.action === 'string' && l.action.startsWith('WASTE')
  )

  const wasteBreakdown = wasteLogs.map(log => {
    const cleanName = log.itemName.toLowerCase().trim()
    let unitCost = 0
    if (log.type === 'INGREDIENT') {
      unitCost = ingredientCostMap.get(cleanName) ?? menuItemCostMap.get(cleanName) ?? 0
    } else {
      unitCost = menuItemCostMap.get(cleanName) ?? ingredientCostMap.get(cleanName) ?? 0
    }

    const qty = Number(log.quantity || 0)
    const lineCost = Math.round(qty * unitCost * 100) / 100
    totalWasteCost += lineCost
    totalWasteQty += qty

    const reason = log.action.replace(/^WASTE:\s*/i, '')

    return {
      id: log.id,
      itemName: log.itemName,
      type: log.type,
      quantity: qty,
      unitCost,
      totalCost: lineCost,
      reason,
      userName: log.userName,
      createdAt: log.createdAt,
    }
  })

  totalWasteCost = Math.round(totalWasteCost * 100) / 100
  totalWasteQty = Math.round(totalWasteQty * 100) / 100
  const netProfit = Math.round((grossProfit - totalWasteCost) * 100) / 100
  const netProfitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0

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
    isRecipe?: boolean;
    recipeCost?: number;
  }> = {}
  orderItems.forEach(oi => {
    const key = oi.menuItemId
    const { cost: costPrice, isRecipe, recipeCost } = getItemCost(oi.menuItem)
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
        isRecipe,
        recipeCost,
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

  // Staff performance (Revenue net of tips, tips tracked separately)
  const staffPerf: Record<string, { name: string; orders: number; revenue: number; tips: number }> = {}
  payments.forEach(p => {
    const name = p.cashier?.fullName || p.order.waiter.fullName
    const tip = extractTip(p)
    const net = Math.max(0, p.amount - tip)
    if (!staffPerf[name]) staffPerf[name] = { name, orders: 0, revenue: 0, tips: 0 }
    staffPerf[name].orders++
    staffPerf[name].revenue = Math.round((staffPerf[name].revenue + net) * 100) / 100
    staffPerf[name].tips = Math.round((staffPerf[name].tips + tip) * 100) / 100
  })

  // Helper to extract verification info from order or notes
  function getTransactionVerification(p: any) {
    let verifiedRef = p.order?.verifiedRef || null
    let verifiedProvider = p.order?.verifiedProvider || null
    let verifiedPayer = p.order?.verifiedPayer || null
    let verifiedReceiver = p.order?.verifiedReceiver || null
    let verifiedAt = p.order?.verifiedAt || null

    if (!verifiedRef && p.notes) {
      const matchRef = p.notes.match(/Ref:\s*([A-Za-z0-9_-]+)/i)
      if (matchRef) verifiedRef = matchRef[1]
      const matchCredited = p.notes.match(/Credited:\s*([^|\]]+)/i)
      if (matchCredited) verifiedReceiver = matchCredited[1].trim()
      const matchPayer = p.notes.match(/Payer:\s*([^|\]]+)/i)
      if (matchPayer) verifiedPayer = matchPayer[1].trim()
      if (p.notes.includes('Telebirr') || p.notes.includes('TELEBIRR')) verifiedProvider = 'TELEBIRR'
      else if (p.notes.includes('CBE')) verifiedProvider = 'CBE'
    }

    const isDigital = p.method === 'Telebirr' || p.method === 'CBE' || p.method === 'CBE Birr' || p.method?.toLowerCase().includes('bank')
    const isVerified = Boolean(verifiedRef)

    return {
      verifiedRef,
      verifiedProvider: verifiedProvider || (isDigital ? p.method.toUpperCase() : null),
      verifiedPayer,
      verifiedReceiver,
      verifiedAt,
      isVerified,
      isDigital,
    }
  }

  // Transactions (Including tip and net amount)
  const transactions = payments.map(p => {
    const ver = getTransactionVerification(p)
    const tip = extractTip(p)
    const netAmount = Math.max(0, Math.round((p.amount - tip) * 100) / 100)
    return {
      id: p.id,
      date: p.createdAt,
      amount: p.amount,
      tip,
      netAmount,
      method: p.method,
      cashier: p.cashier?.fullName || 'Unknown',
      waiter: p.order?.waiter?.fullName || 'Unknown',
      table: p.order?.table?.number || '?',
      items: p.order?.orderItems?.map((oi: any) => `${oi.quantity}x ${oi.menuItem.name}`).join(', ') || '',
      verifiedRef: ver.verifiedRef,
      verifiedProvider: ver.verifiedProvider,
      verifiedPayer: ver.verifiedPayer,
      verifiedReceiver: ver.verifiedReceiver,
      verifiedAt: ver.verifiedAt,
      isVerified: ver.isVerified,
      isDigital: ver.isDigital,
      notes: p.notes,
    }
  })

  // Daily Sales with per-category item breakdown (Revenue net of tips)
  const dailyMap: Record<string, {
    date: string; orders: number; revenue: number
    categories: Record<string, { categoryName: string; items: Record<string, { name: string; quantity: number; revenue: number }> }>
  }> = {}

  payments.forEach(p => {
    const d = new Date(p.createdAt).toISOString().split('T')[0]
    const tip = extractTip(p)
    const net = Math.max(0, p.amount - tip)
    if (!dailyMap[d]) dailyMap[d] = { date: d, orders: 0, revenue: 0, categories: {} }
    dailyMap[d].orders++
    dailyMap[d].revenue = Math.round((dailyMap[d].revenue + net) * 100) / 100

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
      const categoryName = (rawType === 'DRINK' || rawType === 'DRINKS') ? 'DRINKS' : rawType
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

  // Inventory Asset Valuation
  // 1. Raw Ingredients in Store
  const ingredientStockValue = Math.round(
    allIngredients.reduce((sum, ing) => sum + (Number(ing.quantity || 0) * Number(ing.costPerUnit || 0)), 0) * 100
  ) / 100

  // 2. Retail / Standalone Products (items with no recipe)
  const retailStockValue = Math.round(
    inventory
      .filter(item => !item.recipes || item.recipes.length === 0)
      .reduce((sum, item) => {
        const totalUnits = Number(item.stockQuantity || 0) + Number(item.barQuantity || 0)
        return sum + (totalUnits * Number(item.costPrice || 0))
      }, 0) * 100
  ) / 100

  const totalInventoryValue = Math.round((ingredientStockValue + retailStockValue) * 100) / 100

  // Enrich inventory items with isRecipe and effective cost
  const enrichedInventory = inventory.map(item => {
    const { cost: effectiveCost, isRecipe, recipeCost } = getItemCost(item)
    return {
      ...item,
      effectiveCost,
      isRecipe,
      recipeCost,
    }
  })

  // Enrich ingredients with total monetary value
  const enrichedIngredients = allIngredients.map(ing => ({
    ...ing,
    totalValue: Math.round(Number(ing.quantity || 0) * Number(ing.costPerUnit || 0) * 100) / 100,
  }))

  return NextResponse.json({
    totalRevenue,
    totalTips,
    totalCOGS,
    grossProfit,
    profitMargin,
    totalWasteCost,
    totalWasteQty,
    netProfit,
    netProfitMargin,
    wasteBreakdown,
    profitByCategory,
    profitByItem,
    totalOrders: orders.length,
    revenueByMethod,
    bestSelling,
    staffPerformance: Object.values(staffPerf),
    cancellations,
    inventory: enrichedInventory,
    ingredients: enrichedIngredients,
    inventoryValuation: {
      totalValue: totalInventoryValue,
      ingredientValue: ingredientStockValue,
      retailValue: retailStockValue,
    },
    lowStock,
    transactions,
    dailySales,
    categorizedReport,
    inventoryLogs,
  })
}
