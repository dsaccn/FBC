import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  // Always mark as pending sync when edited so the change propagates to all terminals
  const table = await prisma.table.update({ where: { id }, data: { ...body, pendingSync: true } })
  backgroundSync()
  return NextResponse.json(table)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.table.delete({ where: { id } })
  await deleteFromCloud(`DELETE FROM "Table" WHERE id = $1`, [id])
  backgroundSync()
  return NextResponse.json({ success: true })
}
