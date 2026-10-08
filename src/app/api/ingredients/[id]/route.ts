import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, deleteFromCloud, pushIngredientToCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    // Normalize numeric fields if provided
    if (body.quantity !== undefined && body.quantity !== null) {
      body.quantity = Number(body.quantity)
    }
    if (body.minThreshold !== undefined && body.minThreshold !== null) {
      body.minThreshold = Number(body.minThreshold)
    }
    if (body.costPerUnit !== undefined && body.costPerUnit !== null) {
      body.costPerUnit = Number(body.costPerUnit)
    }

    // Fetch current ingredient to compare quantity
    const before = await prisma.ingredient.findUnique({ where: { id } })
    const ingredient = await prisma.ingredient.update({ where: { id }, data: body })

    // Log if quantity changed
    if (before && body.quantity !== undefined && body.quantity !== before.quantity) {
      const session = await getSession()
      await prisma.inventoryLog.create({
        data: {
          itemName: ingredient.name,
          type: 'INGREDIENT',
          action: body.quantity > before.quantity ? 'ADD' : 'SET',
          quantity: Math.abs(body.quantity - before.quantity),
          prevQty: before.quantity,
          newQty: body.quantity,
          userName: session?.fullName ?? 'Unknown',
        },
      })
    }

    // Immediately push to Neon cloud so cloud has fresh stock right away
    await pushIngredientToCloud(ingredient)

    backgroundSync()

    return NextResponse.json(ingredient)
  } catch (err) {
    console.error('[PATCH /api/ingredients/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Remove from all recipes first
    await prisma.recipe.deleteMany({ where: { ingredientId: id } })
    await prisma.ingredient.delete({ where: { id } })

    // Delete from Neon immediately so the pull doesn't resurrect it
    await deleteFromCloud(`DELETE FROM "Recipe" WHERE "ingredientId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Ingredient" WHERE id = $1`, [id])
    backgroundSync()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/ingredients/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
