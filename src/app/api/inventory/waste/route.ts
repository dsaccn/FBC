import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, pushMenuItemStockToCloud, pushIngredientToCloud } from '@/lib/sync-engine'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || !['ADMIN', 'MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized: Only Admin and Manager can log waste' }, { status: 403 })
    }

    const body = await req.json()
    const { itemType, itemId, location = 'STORE', quantity, reason = 'Expired', notes = '' } = body

    const qty = Number(quantity)
    if (!itemId || isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Valid item and quantity are required' }, { status: 400 })
    }

    const userName = `${session.fullName} (${session.role})`
    const reasonTag = notes ? `${reason} - ${notes}` : reason

    if (itemType === 'INGREDIENT') {
      const ing = await prisma.ingredient.findUnique({ where: { id: itemId } })
      if (!ing) {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
      }

      const prevQty = ing.quantity
      const newQty = Math.max(0, prevQty - qty)
      const costPerUnit = ing.costPerUnit || 0
      const totalCost = Math.round(qty * costPerUnit * 100) / 100

      const updated = await prisma.ingredient.update({
        where: { id: itemId },
        data: { quantity: newQty },
      })

      const log = await prisma.inventoryLog.create({
        data: {
          itemName: ing.name,
          type: 'INGREDIENT',
          action: `WASTE: ${reasonTag}`,
          quantity: qty,
          prevQty,
          newQty,
          userName,
        },
      })

      const wasteLog = await prisma.wasteLog.create({
        data: {
          itemName: ing.name,
          itemType: 'INGREDIENT',
          itemId: ing.id,
          location: null,
          quantity: qty,
          unit: ing.unit || null,
          costPerUnit,
          totalCost,
          reason,
          notes: notes || null,
          loggedBy: userName,
          pendingSync: true,
        },
      }).catch(err => {
        console.warn('Failed to insert wasteLog:', err)
        return null
      })

      await pushIngredientToCloud(updated)
      backgroundSync()

      return NextResponse.json({ success: true, updated, log, wasteLog })
    } else {
      // Menu item (Cakes, Drinks, Store / Bar items)
      const item = await prisma.menuItem.findUnique({ where: { id: itemId } })
      if (!item) {
        return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
      }

      const isBar = location === 'BAR'
      const prevQty = isBar ? item.barQuantity : item.stockQuantity
      const newQty = Math.max(0, prevQty - qty)
      const costPerUnit = item.costPrice || 0
      const totalCost = Math.round(qty * costPerUnit * 100) / 100

      const updated = await prisma.menuItem.update({
        where: { id: itemId },
        data: isBar ? { barQuantity: newQty } : { stockQuantity: newQty },
      })

      const log = await prisma.inventoryLog.create({
        data: {
          itemName: item.name,
          type: isBar ? 'BAR' : 'STORE',
          action: `WASTE: ${reasonTag}`,
          quantity: qty,
          prevQty,
          newQty,
          userName,
        },
      })

      const wasteLog = await prisma.wasteLog.create({
        data: {
          itemName: item.name,
          itemType: 'MENU_ITEM',
          itemId: item.id,
          location: isBar ? 'BAR' : 'STORE',
          quantity: qty,
          unit: null,
          costPerUnit,
          totalCost,
          reason,
          notes: notes || null,
          loggedBy: userName,
          pendingSync: true,
        },
      }).catch(err => {
        console.warn('Failed to insert wasteLog:', err)
        return null
      })

      await pushMenuItemStockToCloud(item.id, updated.stockQuantity, updated.barQuantity)
      backgroundSync()

      return NextResponse.json({ success: true, updated, log, wasteLog })
    }
  } catch (err) {
    console.error('[POST /api/inventory/waste]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session || !['ADMIN', 'MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized: Only Admin and Manager can delete waste logs' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      await prisma.wasteLog.deleteMany({ where: { id } }).catch(() => {})
      await prisma.inventoryLog.deleteMany({ where: { id } }).catch(() => {})
      try {
        const url = process.env.NEON_DATABASE_URL
        if (url) {
          const { Pool } = await import('pg')
          const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
          await p.query('DELETE FROM "WasteLog" WHERE id = $1', [id]).catch(() => {})
          await p.query('DELETE FROM "InventoryLog" WHERE id = $1', [id]).catch(() => {})
          await p.end().catch(() => {})
        }
      } catch {}
      return NextResponse.json({ success: true, deletedId: id })
    } else {
      // Clear ALL waste logs
      await prisma.wasteLog.deleteMany({}).catch(() => {})
      await prisma.inventoryLog.deleteMany({ where: { action: { startsWith: 'WASTE' } } }).catch(() => {})
      try {
        const url = process.env.NEON_DATABASE_URL
        if (url) {
          const { Pool } = await import('pg')
          const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
          await p.query('DELETE FROM "WasteLog"').catch(() => {})
          await p.query("DELETE FROM \"InventoryLog\" WHERE action LIKE 'WASTE%'").catch(() => {})
          await p.end().catch(() => {})
        }
      } catch {}
      return NextResponse.json({ success: true, message: 'All waste logs cleared' })
    }
  } catch (err: any) {
    console.error('[DELETE /api/inventory/waste]', err)
    return NextResponse.json({ error: err.message || 'Failed to delete waste logs' }, { status: 500 })
  }
}

