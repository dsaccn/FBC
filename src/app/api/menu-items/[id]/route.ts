import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

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

    // 1. Unlink child menu items that reference this item as parent
    await prisma.menuItem.updateMany({
      where: { parentItemId: id },
      data: { parentItemId: null },
    })

    // 2. Unlink staff menu items that reference this menu item
    await prisma.staffMenuItem.updateMany({
      where: { linkedMenuItemId: id },
      data: { linkedMenuItemId: null },
    })

    // 3. Remove cancellations linked to order items of this menu item
    await prisma.cancellation.deleteMany({
      where: { orderItem: { menuItemId: id } },
    })

    // 4. Remove order items that reference this menu item
    await prisma.orderItem.deleteMany({ where: { menuItemId: id } })

    // 5. Remove recipes referencing this menu item
    await prisma.recipe.deleteMany({ where: { menuItemId: id } })

    // 6. Safe to delete the menu item itself
    await prisma.menuItem.delete({ where: { id } })

    // Also delete from Neon immediately so the next pull doesn't resurrect it.
    // If offline, deleteFromCloud is a no-op; the push-diff in syncToCloud will
    // reconcile on the next successful sync.
    await deleteFromCloud(`UPDATE "MenuItem" SET "parentItemId" = NULL WHERE "parentItemId" = $1`, [id])
    await deleteFromCloud(`UPDATE "StaffMenuItem" SET "linkedMenuItemId" = NULL WHERE "linkedMenuItemId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Cancellation" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "menuItemId" = $1)`, [id])
    await deleteFromCloud(`DELETE FROM "OrderItem" WHERE "menuItemId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Recipe" WHERE "menuItemId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "MenuItem" WHERE id = $1`, [id])

    // Kick off a background sync to clean up any remaining cloud references
    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/menu-items/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
