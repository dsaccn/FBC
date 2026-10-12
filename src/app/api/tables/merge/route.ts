import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'

export async function POST(req: Request) {
  try {
    const { sourceTableId, targetTableId } = await req.json()

    if (!sourceTableId || !targetTableId || sourceTableId === targetTableId) {
      return NextResponse.json({ error: 'Two distinct table IDs are required' }, { status: 400 })
    }

    const [sourceTable, targetTable] = await Promise.all([
      prisma.table.findUnique({ where: { id: sourceTableId } }),
      prisma.table.findUnique({ where: { id: targetTableId } }),
    ])

    if (!sourceTable || !targetTable) {
      return NextResponse.json({ error: 'One or both tables not found' }, { status: 404 })
    }

    // Check for open orders on both tables
    const [orderSource, orderTarget] = await Promise.all([
      prisma.order.findFirst({
        where: { tableId: sourceTableId, status: 'OPEN' },
        include: { orderItems: true },
      }),
      prisma.order.findFirst({
        where: { tableId: targetTableId, status: 'OPEN' },
        include: { orderItems: true },
      }),
    ])

    // If both tables have open orders, merge source order items into target order
    if (orderSource && orderTarget) {
      if (orderSource.orderItems.length > 0) {
        await prisma.orderItem.updateMany({
          where: { orderId: orderSource.id },
          data: { orderId: orderTarget.id, pendingSync: !process.env.VERCEL },
        })
      }
      // Remove now-empty source order
      await prisma.order.delete({ where: { id: orderSource.id } }).catch(() => {})
    } else if (orderSource && !orderTarget) {
      // Reassign open order from source table to target table
      await prisma.order.update({
        where: { id: orderSource.id },
        data: { tableId: targetTableId, pendingSync: !process.env.VERCEL },
      })
    }

    const hasActiveOrders = Boolean(orderSource || orderTarget)
    const newStatus = hasActiveOrders ? 'OCCUPIED' : 'FREE'

    // Link source table to target table
    await prisma.table.update({
      where: { id: sourceTableId },
      data: {
        mergedWithId: targetTableId,
        status: newStatus,
        pendingSync: !process.env.VERCEL,
      },
    })

    await prisma.table.update({
      where: { id: targetTableId },
      data: {
        status: newStatus,
        pendingSync: !process.env.VERCEL,
      },
    })

    // Replicate changes to Neon Cloud PostgreSQL if available
    try {
      const url = process.env.NEON_DATABASE_URL
      if (url) {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

        await pool.query(
          `UPDATE "Table" SET "mergedWithId" = $1, status = $2 WHERE id = $3`,
          [targetTableId, newStatus, sourceTableId]
        ).catch(() => {})

        await pool.query(
          `UPDATE "Table" SET status = $1 WHERE id = $2`,
          [newStatus, targetTableId]
        ).catch(() => {})

        if (orderSource && orderTarget) {
          await pool.query(
            `UPDATE "OrderItem" SET "orderId" = $1 WHERE "orderId" = $2`,
            [orderTarget.id, orderSource.id]
          ).catch(() => {})
          await pool.query(`DELETE FROM "Order" WHERE id = $1`, [orderSource.id]).catch(() => {})
        } else if (orderSource && !orderTarget) {
          await pool.query(
            `UPDATE "Order" SET "tableId" = $1 WHERE id = $2`,
            [targetTableId, orderSource.id]
          ).catch(() => {})
        }

        await pool.end().catch(() => {})
      }
    } catch (cloudErr) {
      console.warn('[Cloud sync merge error]', cloudErr)
    }

    backgroundSync()

    return NextResponse.json({
      success: true,
      message: `Table ${sourceTable.number} merged into Table ${targetTable.number}`,
      sourceTableId,
      targetTableId,
    })
  } catch (err: any) {
    console.error('[POST /api/tables/merge]', err)
    return NextResponse.json({ error: err.message || 'Failed to merge tables' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')

    if (!tableId) {
      return NextResponse.json({ error: 'tableId is required' }, { status: 400 })
    }

    const currentTable = await prisma.table.findUnique({ where: { id: tableId } })
    if (!currentTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const hostId = currentTable.mergedWithId || currentTable.id

    // Find all tables that were merged in this cluster
    const clusterTables = await prisma.table.findMany({
      where: {
        OR: [
          { id: hostId },
          { mergedWithId: hostId },
          { id: tableId },
          { mergedWithId: tableId },
        ],
      },
    })

    // Unlink all of them
    await prisma.table.updateMany({
      where: { id: { in: clusterTables.map(t => t.id) } },
      data: { mergedWithId: null, pendingSync: !process.env.VERCEL },
    })

    // Recalculate status based on whether open orders exist
    for (const t of clusterTables) {
      const openOrder = await prisma.order.findFirst({
        where: { tableId: t.id, status: 'OPEN' },
      })
      await prisma.table.update({
        where: { id: t.id },
        data: { status: openOrder ? 'OCCUPIED' : 'FREE' },
      })
    }

    // Sync to Neon Cloud PostgreSQL
    try {
      const url = process.env.NEON_DATABASE_URL
      if (url) {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
        for (const t of clusterTables) {
          const openOrder = await prisma.order.findFirst({
            where: { tableId: t.id, status: 'OPEN' },
          })
          await pool.query(
            `UPDATE "Table" SET "mergedWithId" = NULL, status = $1 WHERE id = $2`,
            [openOrder ? 'OCCUPIED' : 'FREE', t.id]
          ).catch(() => {})
        }
        await pool.end().catch(() => {})
      }
    } catch (cloudErr) {
      console.warn('[Cloud sync unmerge error]', cloudErr)
    }

    backgroundSync()

    return NextResponse.json({
      success: true,
      message: 'Tables unmerged successfully',
    })
  } catch (err: any) {
    console.error('[DELETE /api/tables/merge]', err)
    return NextResponse.json({ error: err.message || 'Failed to unmerge tables' }, { status: 500 })
  }
}
