import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const { name, mealType, linkedMenuItemId } = await req.json()

    const item = await prisma.staffMenuItem.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        mealType: mealType !== undefined ? mealType.toUpperCase() : undefined,
        linkedMenuItemId: linkedMenuItemId !== undefined ? (linkedMenuItemId || null) : undefined,
      }
    })
    return NextResponse.json(item)
  } catch (err) {
    console.error('[PATCH /api/staff-menu-items/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    // Check if any meal logs reference this item
    const usageCount = await prisma.staffMealItem.count({
      where: { staffMenuItemId: id }
    })

    if (usageCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete this menu item because it is referenced in logged staff meals' },
        { status: 400 }
      )
    }

    await prisma.staffRecipe.deleteMany({ where: { staffMenuItemId: id } })
    await prisma.staffMenuItem.delete({
      where: { id }
    })
    await deleteFromCloud(`DELETE FROM "StaffRecipe" WHERE "staffMenuItemId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "StaffMenuItem" WHERE id = $1`, [id])
    backgroundSync()
    return NextResponse.json({ success: true, message: 'Deleted staff menu item' })
  } catch (err) {
    console.error('[DELETE /api/staff-menu-items/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
