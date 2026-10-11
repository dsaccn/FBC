import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Recipe = mapping of a staff food menu item to the raw staff ingredients
// (and per-serving amounts) consumed when that meal is logged.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const staffMenuItemId = url.searchParams.get('staffMenuItemId')

    const recipes = await prisma.staffRecipe.findMany({
      where: staffMenuItemId ? { staffMenuItemId } : undefined,
      include: { staffIngredient: true },
    })
    return NextResponse.json(recipes)
  } catch (err) {
    console.error('[GET /api/staff-recipes]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { staffMenuItemId, staffIngredientId, quantity } = await req.json()
    if (!staffMenuItemId || !staffIngredientId || quantity === undefined) {
      return NextResponse.json(
        { error: 'Food item, ingredient and quantity are required' },
        { status: 400 }
      )
    }
    const qty = Number(quantity)
    if (!(qty > 0)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    // Upsert so re-adding the same ingredient updates the amount instead of erroring.
    const isOfflineLocal = !process.env.VERCEL
    const recipe = await prisma.staffRecipe.upsert({
      where: { staffMenuItemId_staffIngredientId: { staffMenuItemId, staffIngredientId } },
      update: { quantity: qty, pendingSync: isOfflineLocal },
      create: { staffMenuItemId, staffIngredientId, quantity: qty, pendingSync: isOfflineLocal },
      include: { staffIngredient: true },
    })
    return NextResponse.json(recipe)
  } catch (err) {
    console.error('[POST /api/staff-recipes]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
