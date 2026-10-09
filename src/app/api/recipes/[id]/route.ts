import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, deleteFromCloud, pushRecipeToCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const recipe = await prisma.recipe.update({ where: { id }, data: body, include: { ingredient: true } })
    await pushRecipeToCloud(recipe)
    backgroundSync()
    return NextResponse.json(recipe)
  } catch (err) {
    console.error('[PATCH /api/recipes/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.recipe.delete({ where: { id } })
    await deleteFromCloud(`DELETE FROM "Recipe" WHERE id = $1`, [id])
    backgroundSync()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/recipes/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
