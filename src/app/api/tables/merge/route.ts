import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync } from '@/lib/sync-engine'
import crypto from 'crypto'

/**
 * Generate a short, recognizable unique merge credential like "MG-12-8F2A"
 */
function generateMergeCredential(tableNumbers: string[]): string {
  const nums = tableNumbers.join('')
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `MG-${nums}-${randomSuffix}`
}

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

    // Build the full merge cluster: collect all tables already in either table's group
    const existingGroupId = targetTable.mergeGroupId || sourceTable.mergeGroupId
    let clusterTableIds: string[] = []

    if (existingGroupId) {
      const existing = await prisma.table.findMany({ where: { mergeGroupId: existingGroupId } })
      clusterTableIds = existing.map(t => t.id)
      if (!clusterTableIds.includes(sourceTableId)) clusterTableIds.push(sourceTableId)
      if (!clusterTableIds.includes(targetTableId)) clusterTableIds.push(targetTableId)
    } else {
      clusterTableIds = [sourceTableId, targetTableId]
    }

    // Get all tables in the cluster to build labels & credentials
    const clusterTables = await prisma.table.findMany({
      where: { id: { in: clusterTableIds } },
      orderBy: { number: 'asc' },
    })

    const tableNumbers = clusterTables
      .map(t => t.number)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    // Build merged human-readable label: "T1+T2"
    const mergeGroupLabel = tableNumbers.map(n => `T${n}`).join('+')

    // Generate or reuse unique merge credential
    const mergeGroupId = existingGroupId || generateMergeCredential(tableNumbers)

    // Determine host table: prefer targetTable if already a host, otherwise targetTable
    const hostTableId = targetTable.mergeGroupId && !targetTable.mergedWithId ? targetTable.id : targetTableId

    // Consolidate open orders across all tables in the cluster into the host table
    const openOrders = await prisma.order.findMany({
      where: { tableId: { in: clusterTableIds }, status: 'OPEN' },
      include: { orderItems: true },
      orderBy: { createdAt: 'asc' },
    })

    let hostOrderId: string | null = null

    if (openOrders.length > 0) {
      // Pick or create host order
      const hostOrder = openOrders.find(o => o.tableId === hostTableId) || openOrders[0]
      hostOrderId = hostOrder.id

      if (hostOrder.tableId !== hostTableId) {
        await prisma.order.update({
          where: { id: hostOrder.id },
          data: { tableId: hostTableId, pendingSync: !process.env.VERCEL },
        })
      }

      // Reassign order items from all other orders to the host order
      for (const order of openOrders) {
        if (order.id === hostOrderId) continue
        if (order.orderItems.length > 0) {
          await prisma.orderItem.updateMany({
            where: { orderId: order.id },
            data: { orderId: hostOrderId, pendingSync: !process.env.VERCEL },
          })
        }
        await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
      }
    }

    const hasActiveOrders = openOrders.length > 0
    const newStatus = hasActiveOrders ? 'OCCUPIED' : 'FREE'

    // Update all tables in the cluster: set merge group info and point non-host tables to host
    for (const t of clusterTables) {
      await prisma.table.update({
        where: { id: t.id },
        data: {
          mergeGroupId,
          mergeGroupLabel,
          mergedWithId: t.id === hostTableId ? null : hostTableId,
          status: newStatus,
          pendingSync: !process.env.VERCEL,
        },
      })
    }

    // Replicate to Neon Cloud PostgreSQL
    try {
      const url = process.env.NEON_DATABASE_URL
      if (url) {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

        for (const t of clusterTables) {
          await pool.query(
            `UPDATE "Table"
             SET "mergeGroupId" = $1, "mergeGroupLabel" = $2, "mergedWithId" = $3, status = $4
             WHERE id = $5`,
            [mergeGroupId, mergeGroupLabel, t.id === hostTableId ? null : hostTableId, newStatus, t.id]
          ).catch(() => {})
        }

        if (hostOrderId && openOrders.length > 1) {
          for (const order of openOrders) {
            if (order.id === hostOrderId) continue
            await pool.query(`UPDATE "OrderItem" SET "orderId" = $1 WHERE "orderId" = $2`, [hostOrderId, order.id]).catch(() => {})
            await pool.query(`DELETE FROM "Order" WHERE id = $1`, [order.id]).catch(() => {})
          }
          await pool.query(`UPDATE "Order" SET "tableId" = $1 WHERE id = $2`, [hostTableId, hostOrderId]).catch(() => {})
        }

        await pool.end().catch(() => {})
      }
    } catch (cloudErr) {
      console.warn('[Cloud sync merge error]', cloudErr)
    }

    backgroundSync()

    return NextResponse.json({
      success: true,
      message: `Tables combined into ${mergeGroupLabel} [${mergeGroupId}]`,
      mergeGroupId,
      mergeGroupLabel,
      hostTableId,
      combinedNumbers: tableNumbers,
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
    const groupId = currentTable.mergeGroupId

    // Find all tables in the cluster either by mergeGroupId or mergedWithId
    const clusterTables = await prisma.table.findMany({
      where: groupId
        ? {
            OR: [
              { mergeGroupId: groupId },
              { id: hostId },
              { mergedWithId: hostId },
              { id: tableId },
              { mergedWithId: tableId },
            ],
          }
        : {
            OR: [
              { id: hostId },
              { mergedWithId: hostId },
              { id: tableId },
              { mergedWithId: tableId },
            ],
          },
    })

    if (clusterTables.length <= 1 && !currentTable.mergedWithId && !currentTable.mergeGroupId) {
      return NextResponse.json({ error: 'This table is not merged' }, { status: 400 })
    }

    // Identify host table (the one without mergedWithId, or first table)
    const hostTable = clusterTables.find(t => !t.mergedWithId) || clusterTables[0]
    const clusterIds = clusterTables.map(t => t.id)

    // Check if an open order exists in this cluster
    const openOrder = await prisma.order.findFirst({
      where: { tableId: { in: clusterIds }, status: 'OPEN' },
      include: { orderItems: true },
    })

    // If open order exists, firmly anchor it to the host table
    if (openOrder && openOrder.tableId !== hostTable.id) {
      await prisma.order.update({
        where: { id: openOrder.id },
        data: { tableId: hostTable.id, pendingSync: !process.env.VERCEL },
      })
    }

    // Unlink all tables: clear merge fields
    await prisma.table.updateMany({
      where: { id: { in: clusterIds } },
      data: {
        mergedWithId: null,
        mergeGroupId: null,
        mergeGroupLabel: null,
        pendingSync: !process.env.VERCEL,
      },
    })

    // Update statuses:
    // Host table keeps OCCUPIED if there's an open order, all other released tables become FREE!
    for (const t of clusterTables) {
      const isHostWithOrder = t.id === hostTable.id && Boolean(openOrder)
      const correctStatus = isHostWithOrder ? 'OCCUPIED' : 'FREE'
      await prisma.table.update({
        where: { id: t.id },
        data: { status: correctStatus },
      })
    }

    // Sync unmerge to Neon Cloud PostgreSQL
    try {
      const url = process.env.NEON_DATABASE_URL
      if (url) {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

        if (openOrder && openOrder.tableId !== hostTable.id) {
          await pool.query(`UPDATE "Order" SET "tableId" = $1 WHERE id = $2`, [hostTable.id, openOrder.id]).catch(() => {})
        }

        for (const t of clusterTables) {
          const isHostWithOrder = t.id === hostTable.id && Boolean(openOrder)
          const correctStatus = isHostWithOrder ? 'OCCUPIED' : 'FREE'
          await pool.query(
            `UPDATE "Table"
             SET "mergedWithId" = NULL, "mergeGroupId" = NULL, "mergeGroupLabel" = NULL, status = $1
             WHERE id = $2`,
            [correctStatus, t.id]
          ).catch(() => {})
        }

        await pool.end().catch(() => {})
      }
    } catch (cloudErr) {
      console.warn('[Cloud sync unmerge error]', cloudErr)
    }

    backgroundSync()

    const otherNumbers = clusterTables.filter(t => t.id !== hostTable.id).map(t => `T${t.number}`).join(', ')
    const msg = openOrder
      ? `Tables unmerged successfully! Active order remains on Table ${hostTable.number}. Released ${otherNumbers} to FREE.`
      : `Tables unmerged successfully. All tables reset to FREE.`

    return NextResponse.json({
      success: true,
      message: msg,
      hostTableNumber: hostTable.number,
      unmergedTables: clusterTables.map(t => t.number),
    })
  } catch (err: any) {
    console.error('[DELETE /api/tables/merge]', err)
    return NextResponse.json({ error: err.message || 'Failed to unmerge tables' }, { status: 500 })
  }
}
