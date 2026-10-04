import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const items = await prisma.staffMenuItem.findMany({
      orderBy: { name: 'asc' }
    })
    return NextResponse.json(items)
  } catch (err) {
    console.error('[GET /api/staff-menu-items]', err)
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
    const { name, mealType, linkedMenuItemId } = await req.json()
    if (!name || !mealType) {
      return NextResponse.json({ error: 'Name and meal type are required' }, { status: 400 })
    }

    const item = await prisma.staffMenuItem.create({
      data: {
        name,
        mealType: mealType.toUpperCase(),
        linkedMenuItemId: linkedMenuItemId || null
      }
    })
    return NextResponse.json(item)
  } catch (err) {
    console.error('[POST /api/staff-menu-items]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
