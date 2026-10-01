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
    const { name, role, shift, active } = await req.json()

    const staff = await prisma.staffMember.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        role: role !== undefined ? role : undefined,
        shift: shift !== undefined ? shift : undefined,
        active: active !== undefined ? active : undefined,
      }
    })
    return NextResponse.json(staff)
  } catch (err) {
    console.error('[PATCH /api/staff-members/[id]]', err)
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
    // Check if the staff member is associated with any meals
    const mealsCount = await prisma.staffMeal.count({
      where: { staffMemberId: id }
    })

    if (mealsCount > 0) {
      // Deactivate instead of deleting if meals exist, to prevent breaking foreign keys
      const staff = await prisma.staffMember.update({
        where: { id },
        data: { active: false }
      })
      await deleteFromCloud(`UPDATE "StaffMember" SET active = false WHERE id = $1`, [id])
      backgroundSync()
      return NextResponse.json({ success: true, message: 'Deactivated staff member (meals exist)', staff })
    } else {
      // Hard delete if no meals logged yet
      await prisma.staffMember.delete({
        where: { id }
      })
      await deleteFromCloud(`DELETE FROM "StaffMember" WHERE id = $1`, [id])
      backgroundSync()
      return NextResponse.json({ success: true, message: 'Deleted staff member' })
    }
  } catch (err) {
    console.error('[DELETE /api/staff-members/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
