import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, pushMenuItemStockToCloud, pushIngredientStockToCloud } from '@/lib/sync-engine'

export async function POST(req: Request) {
  try {
    const { menuItemId, ingredientId, quantity } = await req.json()
    const transferQty = Number(quantity)

    if ((!menuItemId && !ingredientId) || !transferQty || isNaN(transferQty) || transferQty <= 0) {
      return NextResponse.json({ error: 'Invalid transfer details' }, { status: 400 })
    }

    const session = await getSession()
    const userName = session?.fullName ?? 'Unknown'

    // Transfer Ingredient from Store to Bar
    if (ingredientId) {
      const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } })
      if (!ing) {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
      }

      if (ing.quantity < transferQty) {
        return NextResponse.json({ error: `Insufficient stock in store (${ing.quantity} ${ing.unit} available)` }, { status: 400 })
      }

      const updated = await prisma.ingredient.update({
        where: { id: ingredientId },
        data: {
          quantity: { decrement: transferQty },
          barQuantity: { increment: transferQty },
        },
      })

      await prisma.inventoryLog.create({
        data: {
          itemName: ing.name,
          type: 'INGREDIENT',
          action: 'TRANSFER',
          quantity: transferQty,
          prevQty: ing.quantity,
          newQty: ing.quantity - transferQty,
          userName,
        },
      })

      await pushIngredientStockToCloud(ingredientId, updated.quantity, updated.barQuantity)
      backgroundSync()

      return NextResponse.json(updated)
    }

    // Transfer MenuItem from Store to Bar
    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.stockQuantity < transferQty) {
      return NextResponse.json({ error: 'Insufficient stock in store' }, { status: 400 })
    }

    // Deduct from store, add to bar
    const updated = await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        stockQuantity: { decrement: transferQty },
        barQuantity: { increment: transferQty },
      },
    })

    // Log the transfer
    await prisma.inventoryLog.create({
      data: {
        itemName: item.name,
        type: 'STORE',
        action: 'TRANSFER',
        quantity: transferQty,
        prevQty: item.stockQuantity,
        newQty: item.stockQuantity - transferQty,
        userName,
      },
    })

    await pushMenuItemStockToCloud(menuItemId, updated.stockQuantity, updated.barQuantity)
    backgroundSync()

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[POST /api/inventory/transfer]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
