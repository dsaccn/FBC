import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { recipes, ...body } = await req.json()

    // Fetch current item so we can compare quantities
    const before = await prisma.menuItem.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    // Sanitize and validate category foreign key
    let categoryId = body.categoryId !== undefined
      ? (body.categoryId && typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null)
      : undefined
    if (categoryId) {
      const catExists = await prisma.category.findUnique({ where: { id: categoryId } })
      if (!catExists) categoryId = null
    }

    // Sanitize and validate parentItem foreign key (must exist and cannot reference itself)
    let parentItemId = body.parentItemId !== undefined
      ? (body.parentItemId && typeof body.parentItemId === 'string' && body.parentItemId.trim() && body.parentItemId.trim() !== id ? body.parentItemId.trim() : null)
      : undefined
    if (parentItemId) {
      const parentExists = await prisma.menuItem.findUnique({ where: { id: parentItemId } })
      if (!parentExists) parentItemId = null
    }

    // Sanitize and validate recipe ingredients
    let recipeUpdate: any = undefined
    if (recipes !== undefined && Array.isArray(recipes)) {
      const validIngredientIds = new Set(
        (await prisma.ingredient.findMany({ select: { id: true } })).map(i => i.id)
      )
      const validRecipes = recipes
        .filter((r: any) => r && r.ingredientId && validIngredientIds.has(r.ingredientId))
        .map((r: any) => ({
          ingredientId: r.ingredientId,
          quantity: Number(r.quantity) || 0
        }))
      recipeUpdate = {
        deleteMany: {},
        create: validRecipes
      }
    }

    const updateData: any = { ...body }
    if (categoryId !== undefined) updateData.categoryId = categoryId
    if (parentItemId !== undefined) updateData.parentItemId = parentItemId
    if (recipeUpdate !== undefined) updateData.recipes = recipeUpdate
    else delete updateData.recipes

    const item = await prisma.menuItem.update({
      where: { id },
      data: updateData,
      include: { recipes: true }
    })

    // Log any stock changes
    if (before) {
      const session = await getSession()
      const userName = session?.fullName ?? 'Unknown'

      if (body.stockQuantity !== undefined && body.stockQuantity !== before.stockQuantity) {
        await prisma.inventoryLog.create({
          data: {
            itemName: item.name,
            type: 'STORE',
            action: 'SET',
            quantity: Math.abs(body.stockQuantity - before.stockQuantity),
            prevQty: before.stockQuantity,
            newQty: body.stockQuantity,
            userName,
          },
        })
        backgroundSync()
      }

      if (body.barQuantity !== undefined && body.barQuantity !== before.barQuantity) {
        await prisma.inventoryLog.create({
          data: {
            itemName: item.name,
            type: 'BAR',
            action: 'SET',
            quantity: Math.abs(body.barQuantity - before.barQuantity),
            prevQty: before.barQuantity,
            newQty: body.barQuantity,
            userName,
          },
        })
        backgroundSync()
      }
    }

    return NextResponse.json(item)
  } catch (err) {
    console.error('[PATCH /api/menu-items/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // First remove cancellations linked to order items of this menu item
    await prisma.cancellation.deleteMany({
      where: { orderItem: { menuItemId: id } },
    })

    // Then remove order items that reference this menu item
    await prisma.orderItem.deleteMany({ where: { menuItemId: id } })

    // Now safe to delete the menu item itself
    await prisma.menuItem.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/menu-items/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
