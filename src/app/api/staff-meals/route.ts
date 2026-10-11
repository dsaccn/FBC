import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const staffMemberId = url.searchParams.get('staffMemberId')
    const mealType = url.searchParams.get('mealType')

    const where: any = {}

    if (from || to) {
      where.servedAt = {}
      if (from) {
        where.servedAt.gte = new Date(from + 'T00:00:00')
      }
      if (to) {
        where.servedAt.lte = new Date(to + 'T23:59:59.999')
      }
    }

    if (staffMemberId) {
      where.staffMemberId = staffMemberId
    }

    if (mealType) {
      where.mealType = mealType.toUpperCase()
    }

    const meals = await prisma.staffMeal.findMany({
      where,
      include: {
        staffMember: true,
        items: {
          include: {
            staffMenuItem: true
          }
        }
      },
      orderBy: { servedAt: 'desc' }
    })

    const formatted = meals.map(m => ({
      id: m.id,
      staffMember: {
        id: m.staffMember.id,
        name: m.staffMember.name,
        role: m.staffMember.role,
        shift: m.staffMember.shift
      },
      mealType: m.mealType,
      servedAt: m.servedAt.toISOString(),
      items: m.items.map(i => ({
        id: i.staffMenuItem.id,
        name: i.staffMenuItem.name,
        quantity: i.quantity
      }))
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('[GET /api/staff-meals]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })


  try {
    const { staffMemberId, mealType, staffMenuItemId, servedAt } = await req.json()

    if (!staffMemberId || !mealType || !staffMenuItemId) {
      return NextResponse.json(
        { error: 'Staff member, meal type, and food item are required' },
        { status: 400 }
      )
    }

    const dateToUse = servedAt ? new Date(servedAt) : new Date()

    const isOfflineLocal = !process.env.VERCEL

    const newMeal = await prisma.$transaction(async (tx) => {
      const meal = await tx.staffMeal.create({
        data: {
          staffMemberId,
          mealType: mealType.toUpperCase(),
          servedAt: dateToUse,
          pendingSync: isOfflineLocal,
        },
        include: {
          staffMember: true
        }
      })

      const mealItem = await tx.staffMealItem.create({
        data: {
          staffMealId: meal.id,
          staffMenuItemId,
          quantity: 1,
          pendingSync: isOfflineLocal,
        },
        include: {
          staffMenuItem: true
        }
      })

      // Auto-deduct staff inventory: for each ingredient in this food's recipe,
      // subtract (per-serving amount × meal quantity) from staff stock.
      const recipes = await tx.staffRecipe.findMany({ where: { staffMenuItemId } })
      for (const r of recipes) {
        await tx.staffIngredient.update({
          where: { id: r.staffIngredientId },
          data: {
            quantity: { decrement: r.quantity * mealItem.quantity },
            pendingSync: isOfflineLocal,
          },
        })
      }

      return {
        id: meal.id,
        staffMember: {
          id: meal.staffMember.id,
          name: meal.staffMember.name,
          role: meal.staffMember.role,
          shift: meal.staffMember.shift
        },
        mealType: meal.mealType,
        servedAt: meal.servedAt.toISOString(),
        items: [{
          id: mealItem.staffMenuItem.id,
          name: mealItem.staffMenuItem.name,
          quantity: mealItem.quantity
        }]
      }
    })

    backgroundSync()
    return NextResponse.json(newMeal)
  } catch (err) {
    console.error('[POST /api/staff-meals]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
