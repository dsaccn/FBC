import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, deleteFromCloud } from '@/lib/sync-engine'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  // Always mark as pending sync when edited locally so the change propagates to all terminals
  const table = await prisma.table.update({ where: { id }, data: { ...body, pendingSync: !process.env.VERCEL } })
  backgroundSync()
  return NextResponse.json(table)
}

const ARCHIVED_TABLE_ID = '__archived_orders_table__'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const table = await prisma.table.findUnique({ where: { id } })
    if (!table) {
      return NextResponse.json({ success: true })
    }

    // 1. Ensure the archived placeholder table exists for historical records
    await prisma.table.upsert({
      where: { id: ARCHIVED_TABLE_ID },
      update: {},
      create: {
        id: ARCHIVED_TABLE_ID,
        number: 'Archived',
        status: 'FREE',
        pendingSync: false,
      },
    })

    // 2. Reassign all orders belonging to this table to the archived table
    await prisma.order.updateMany({
      where: { tableId: id },
      data: { tableId: ARCHIVED_TABLE_ID },
    })

    // 3. Unlink any tables that were merged with this table
    await prisma.table.updateMany({
      where: { mergedWithId: id },
      data: { mergedWithId: null },
    })

    // 4. Delete the table locally
    await prisma.table.delete({ where: { id } })

    // 5. Replicate changes in Cloud (Neon PostgreSQL)
    // 5a. Ensure archived placeholder table exists in cloud
    await deleteFromCloud(
      `INSERT INTO "Table" (id, number, status, "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ARCHIVED_TABLE_ID, 'Archived', 'FREE']
    )

    // 5b. Unlink merged tables in cloud
    await deleteFromCloud(
      `UPDATE "Table" SET "mergedWithId" = NULL WHERE "mergedWithId" = $1`,
      [id]
    )

    // 5c. Move cloud orders referencing this table to the archived table
    await deleteFromCloud(
      `UPDATE "Order" SET "tableId" = $1 WHERE "tableId" = $2`,
      [ARCHIVED_TABLE_ID, id]
    )

    // 5d. Delete table from cloud
    await deleteFromCloud(`DELETE FROM "Table" WHERE id = $1`, [id])

    backgroundSync()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/tables/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
