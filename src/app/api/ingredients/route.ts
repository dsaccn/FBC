import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { backgroundSync } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(ingredients)
  } catch (err) {
    console.error('[GET /api/ingredients]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ingredient = await prisma.ingredient.create({ data: body })

    // Log initial stock if ingredient was created with stock > 0
    if ((body.quantity ?? 0) > 0) {
      const session = await getSession()
      await prisma.inventoryLog.create({
        data: {
          itemName: ingredient.name,
          type: 'INGREDIENT',
          action: 'INITIAL',
          quantity: body.quantity,
          prevQty: 0,
          newQty: body.quantity,
          userName: session?.fullName ?? 'Unknown',
        },
      })
    }

    backgroundSync()

    return NextResponse.json(ingredient)
  } catch (err) {
    console.error('[POST /api/ingredients]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
