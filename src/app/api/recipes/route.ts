import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, pushRecipeToCloud } from '@/lib/sync-engine'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const menuItemId = searchParams.get('menuItemId')
    const recipes = await prisma.recipe.findMany({
      where: menuItemId ? { menuItemId } : {},
      include: { ingredient: true, menuItem: { select: { id: true, name: true } } },
      orderBy: { ingredient: { name: 'asc' } },
    })
    return NextResponse.json(recipes)
  } catch (err) {
    console.error('[GET /api/recipes]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const recipe = await prisma.recipe.create({
      data: body,
      include: { ingredient: true },
    })

    await pushRecipeToCloud(recipe)
    backgroundSync()

    return NextResponse.json(recipe)
  } catch (err: any) {
    console.error('[POST /api/recipes]', err)
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'This ingredient is already in the recipe. Edit the existing line instead.' }, { status: 400 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
