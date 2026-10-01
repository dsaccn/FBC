import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

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
      backgroundSync()
    }

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
