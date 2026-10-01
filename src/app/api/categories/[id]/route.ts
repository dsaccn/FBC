import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const category = await prisma.category.update({ where: { id }, data: body })
    return NextResponse.json(category)
  } catch (err) {
    console.error('[PATCH /api/categories/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}


export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.menuItem.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    })
    await prisma.category.delete({ where: { id } })
    await deleteFromCloud(`UPDATE "MenuItem" SET "categoryId" = NULL WHERE "categoryId" = $1`, [id])
    await deleteFromCloud(`DELETE FROM "Category" WHERE id = $1`, [id])
    backgroundSync()
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[DELETE /api/categories/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
