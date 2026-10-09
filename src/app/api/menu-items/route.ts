import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, pushMenuItemToCloud } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const items = await prisma.menuItem.findMany({
    include: { category: true, recipes: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  try {
    const { recipes, ...body } = await req.json()

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
    }

    const price = Number(body.price)
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'Valid price is required' }, { status: 400 })
    }

    let categoryId = body.categoryId && typeof body.categoryId === 'string' && body.categoryId.trim()
      ? body.categoryId.trim()
      : null
    if (categoryId) {
      const catExists = await prisma.category.findUnique({ where: { id: categoryId } })
      if (!catExists) categoryId = null
    }

    let parentItemId = body.parentItemId && typeof body.parentItemId === 'string' && body.parentItemId.trim()
      ? body.parentItemId.trim()
      : null
    if (parentItemId) {
      const parentExists = await prisma.menuItem.findUnique({ where: { id: parentItemId } })
      if (!parentExists) parentItemId = null
    }

    let validRecipes: { ingredientId: string; quantity: number }[] = []
    if (Array.isArray(recipes) && recipes.length > 0) {
      const validIngredientIds = new Set(
        (await prisma.ingredient.findMany({ select: { id: true } })).map(i => i.id)
      )
      validRecipes = recipes
        .filter((r: any) => r && r.ingredientId && validIngredientIds.has(r.ingredientId))
        .map((r: any) => ({
          ingredientId: r.ingredientId,
          quantity: Number(r.quantity) || 0
        }))
    }

    const item = await prisma.menuItem.create({
      data: {
        ...body,
        name: body.name.trim(),
        price,
        categoryId,
        parentItemId,
        recipes: validRecipes.length > 0 ? {
          create: validRecipes
        } : undefined
      },
      include: { recipes: true, category: true }
    })

    await pushMenuItemToCloud(item)
    backgroundSync()

    return NextResponse.json(item)
  } catch (err) {
    console.error('[POST /api/menu-items]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

