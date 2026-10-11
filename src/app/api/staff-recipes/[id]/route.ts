import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const { quantity } = await req.json()
    const qty = Number(quantity)
    if (!(qty > 0)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    const recipe = await prisma.staffRecipe.update({
      where: { id },
      data: { quantity: qty, pendingSync: !process.env.VERCEL },
      include: { staffIngredient: true },
    })
    return NextResponse.json(recipe)
  } catch (err) {
    console.error('[PATCH /api/staff-recipes/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    await prisma.staffRecipe.delete({ where: { id } })
    await deleteFromCloud(`DELETE FROM "StaffRecipe" WHERE id = $1`, [id])
    backgroundSync()
    return NextResponse.json({ success: true, message: 'Deleted staff recipe line' })
  } catch (err) {
    console.error('[DELETE /api/staff-recipes/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
