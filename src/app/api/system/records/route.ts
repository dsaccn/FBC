import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logDevAction } from '@/lib/dev-audit'

export const dynamic = 'force-dynamic'

// Helper to access Prisma model dynamically
function getModelDelegate(modelName: string): any {
  const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1)
  return (prisma as any)[delegateName]
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const model = searchParams.get('model')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(250, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)))
  const search = searchParams.get('search')?.trim() || ''

  if (!model) {
    return NextResponse.json({ error: 'Missing model parameter' }, { status: 400 })
  }

  const delegate = getModelDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
  }

  try {
    let where: any = {}
    if (!search && model === 'Table') {
      where = {
        id: { notIn: ['__archived_orders_table__', 'tbl_static_delivery', 'tbl_static_takeaway'] },
      }
    }

    if (search) {
      // Dynamic search heuristics for common fields
      if (['User'].includes(model)) {
        where = {
          OR: [
            { username: { contains: search } },
            { fullName: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['LoginAttempt'].includes(model)) {
        where = {
          OR: [
            { username: { contains: search } },
            { reason: { contains: search } },
            { ipAddress: { contains: search } },
            { portal: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['LoginHistory'].includes(model)) {
        where = {
          OR: [
            { username: { contains: search } },
            { fullName: { contains: search } },
            { role: { contains: search } },
            { ipAddress: { contains: search } },
            { status: { contains: search } },
            { portal: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['WasteLog'].includes(model)) {
        where = {
          OR: [
            { itemName: { contains: search } },
            { reason: { contains: search } },
            { loggedBy: { contains: search } },
            { notes: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['MenuItem', 'Category', 'Ingredient'].includes(model)) {
        where = {
          OR: [
            { name: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['Table'].includes(model)) {
        where = {
          OR: [
            { number: { contains: search } },
            { id: { contains: search } },
          ],
        }
      } else if (['Order', 'OrderItem', 'Payment', 'Cancellation', 'InventoryLog', 'DevAuditLog'].includes(model)) {
        where = {
          OR: [
            { id: { contains: search } },
          ],
        }
      }
    }

    const totalCount = await delegate.count({ where }).catch(() => 0)

    // Determine default ordering if createdAt exists
    let orderBy: any = undefined
    try {
      orderBy = { createdAt: 'desc' }
    } catch {
      orderBy = undefined
    }

    const records = await delegate.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: orderBy || undefined,
    }).catch(async () => {
      // Fallback without orderBy if model lacks createdAt
      return delegate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
      })
    })

    return NextResponse.json({
      model,
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      records,
    })
  } catch (err: any) {
    console.error(`[GET /api/system/records ${model}]`, err)
    return NextResponse.json({ error: err.message || 'Database query error' }, { status: 500 })
  }
}

function coerceFieldValues(raw: Record<string, any>, reference?: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue
    if (val === undefined) continue

    // Avoid injecting relations if any
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && !(val instanceof Date)) {
      // Could be relation or JSON
      continue
    }

    const refVal = reference ? reference[key] : undefined

    if (refVal !== undefined && refVal !== null) {
      if (typeof refVal === 'boolean') {
        result[key] = val === true || val === 'true' || val === 1 || val === '1'
        continue
      }
      if (typeof refVal === 'number') {
        const num = Number(val)
        result[key] = isNaN(num) ? val : num
        continue
      }
      if (refVal instanceof Date || (typeof refVal === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(refVal))) {
        result[key] = val ? new Date(val) : null
        continue
      }
    }

    if (typeof val === 'string') {
      const trimmed = val.trim()
      if (trimmed === 'true') {
        result[key] = true
        continue
      }
      if (trimmed === 'false') {
        result[key] = false
        continue
      }
      if (trimmed === 'null' || trimmed === '') {
        result[key] = null
        continue
      }
      if (/^-?\d+(\.\d+)?$/.test(trimmed) && !key.toLowerCase().endsWith('id') && !key.toLowerCase().endsWith('code') && !key.toLowerCase().endsWith('phone')) {
        result[key] = Number(trimmed)
        continue
      }
    }

    result[key] = val
  }
  return result
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { model, data, reason } = await req.json()
    if (!model || !data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Model and data object required' }, { status: 400 })
    }

    const delegate = getModelDelegate(model)
    if (!delegate) {
      return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
    }

    const coercedData = coerceFieldValues(data)
    const createdRecord = await delegate.create({ data: coercedData })

    await logDevAction({
      action: 'CREATE',
      targetTable: model,
      recordId: createdRecord.id || String(Object.values(createdRecord)[0] || ''),
      newState: createdRecord,
      reason: reason || 'Created new record via developer portal',
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({ success: true, record: createdRecord })
  } catch (err: any) {
    console.error('[POST /api/system/records]', err)
    return NextResponse.json({ error: err.message || 'Create record failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { model, id, data, reason } = await req.json()
    if (!model || !id || !data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Model, id, and data required' }, { status: 400 })
    }

    const delegate = getModelDelegate(model)
    if (!delegate) {
      return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
    }

    // Fetch previous state for audit diff
    const previousState = await delegate.findUnique({ where: { id } }).catch(() => null)
    if (!previousState) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const updatePayload = coerceFieldValues(data, previousState)

    const updatedRecord = await delegate.update({
      where: { id },
      data: updatePayload,
    })

    await logDevAction({
      action: 'UPDATE',
      targetTable: model,
      recordId: id,
      previousState,
      newState: updatedRecord,
      reason: reason || 'Updated record via developer portal',
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({ success: true, record: updatedRecord })
  } catch (err: any) {
    console.error('[PATCH /api/system/records]', err)
    return NextResponse.json({ error: err.message || 'Update record failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    let model = searchParams.get('model')
    let id = searchParams.get('id')
    let idsParam = searchParams.get('ids')
    let reason = searchParams.get('reason') || 'Deleted record via developer portal'
    let ids: string[] = []

    // Also check if JSON body was provided
    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      if (body.model) model = body.model
      if (body.id) id = body.id
      if (Array.isArray(body.ids)) ids = body.ids.map((x: any) => String(x).trim()).filter(Boolean)
      if (body.reason) reason = body.reason
    }

    if (idsParam) {
      const parsed = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      ids = Array.from(new Set([...ids, ...parsed]))
    } else if (id && ids.length === 0) {
      ids = [id.trim()]
    }

    if (!model || ids.length === 0) {
      return NextResponse.json({ error: 'Model and id(s) required' }, { status: 400 })
    }

    const delegate = getModelDelegate(model)
    if (!delegate) {
      return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
    }

    // Helper to execute deletions on Neon Cloud PostgreSQL directly
    const deleteFromNeon = async (sql: string, params: any[] = []) => {
      const url = process.env.NEON_DATABASE_URL
      if (!url) return
      try {
        const { Pool } = await import('pg')
        const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
        await p.query(sql, params)
        await p.end().catch(() => {})
      } catch (err: any) {
        console.warn(`[DELETE records] Neon propagation warning for ${model}:`, err?.message)
      }
    }

    // ── Cascading Deletion Preparation for All Models ─────────────────────────
    if (model === 'Order') {
      const ois = await prisma.orderItem.findMany({ where: { orderId: { in: ids } }, select: { id: true, tableId: true } as any }).catch(() => [])
      const oiIds = ois.map((x: any) => x.id)
      if (oiIds.length > 0) {
        await prisma.cancellation.deleteMany({ where: { orderItemId: { in: oiIds } } }).catch(() => {})
      }
      await prisma.payment.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {})
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }).catch(() => {})

      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "Cancellation" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "orderId" = ANY($1))`, [ids])
        await deleteFromNeon(`DELETE FROM "Payment" WHERE "orderId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "OrderItem" WHERE "orderId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "Order" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'OrderItem') {
      await prisma.cancellation.deleteMany({ where: { orderItemId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "Cancellation" WHERE "orderItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "OrderItem" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'Table') {
      const filteredIds = ids.filter(id => !['tbl_static_delivery', 'tbl_static_takeaway', '__archived_orders_table__'].includes(id))
      if (filteredIds.length === 0) {
        return NextResponse.json({ error: 'Cannot delete static system tables' }, { status: 400 })
      }
      ids = filteredIds
      await prisma.order.updateMany({ where: { tableId: { in: ids } }, data: { tableId: '__archived_orders_table__' } }).catch(() => {})
      await prisma.table.updateMany({ where: { mergedWithId: { in: ids } }, data: { mergedWithId: null } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`UPDATE "Order" SET "tableId" = '__archived_orders_table__' WHERE "tableId" = ANY($1)`, [ids])
        await deleteFromNeon(`UPDATE "Table" SET "mergedWithId" = NULL WHERE "mergedWithId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "Table" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'MenuItem') {
      await prisma.menuItem.updateMany({ where: { parentItemId: { in: ids } }, data: { parentItemId: null } }).catch(() => {})
      await prisma.recipe.deleteMany({ where: { menuItemId: { in: ids } } }).catch(() => {})
      await prisma.staffRecipe.deleteMany({ where: { staffMenuItemId: { in: ids } } }).catch(() => {})
      await prisma.staffMenuItem.deleteMany({ where: { linkedMenuItemId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`UPDATE "MenuItem" SET "parentItemId" = NULL WHERE "parentItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "Recipe" WHERE "menuItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffRecipe" WHERE "staffMenuItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffMenuItem" WHERE "linkedMenuItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "MenuItem" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'Category') {
      await prisma.menuItem.updateMany({ where: { categoryId: { in: ids } }, data: { categoryId: null } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`UPDATE "MenuItem" SET "categoryId" = NULL WHERE "categoryId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "Category" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'Ingredient') {
      await prisma.recipe.deleteMany({ where: { ingredientId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "Recipe" WHERE "ingredientId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "Ingredient" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'StaffMember') {
      const sms = await prisma.staffMeal.findMany({ where: { staffMemberId: { in: ids } }, select: { id: true } }).catch(() => [])
      const smIds = sms.map(x => x.id)
      if (smIds.length > 0) {
        await prisma.staffMealItem.deleteMany({ where: { staffMealId: { in: smIds } } }).catch(() => {})
      }
      await prisma.staffMeal.deleteMany({ where: { staffMemberId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "StaffMealItem" WHERE "staffMealId" IN (SELECT id FROM "StaffMeal" WHERE "staffMemberId" = ANY($1))`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffMeal" WHERE "staffMemberId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffMember" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'StaffMenuItem') {
      await prisma.staffMealItem.deleteMany({ where: { staffMenuItemId: { in: ids } } }).catch(() => {})
      await prisma.staffRecipe.deleteMany({ where: { staffMenuItemId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "StaffMealItem" WHERE "staffMenuItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffRecipe" WHERE "staffMenuItemId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffMenuItem" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'StaffIngredient') {
      await prisma.staffRecipe.deleteMany({ where: { staffIngredientId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "StaffRecipe" WHERE "staffIngredientId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffIngredient" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'StaffMeal') {
      await prisma.staffMealItem.deleteMany({ where: { staffMealId: { in: ids } } }).catch(() => {})
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "StaffMealItem" WHERE "staffMealId" = ANY($1)`, [ids])
        await deleteFromNeon(`DELETE FROM "StaffMeal" WHERE id = ANY($1)`, [ids])
      }
    } else if (model === 'WasteLog') {
      const wasteLogs = await prisma.wasteLog.findMany({ where: { id: { in: ids } } }).catch(() => [])
      const itemNames = wasteLogs.map((w: any) => w.itemName).filter(Boolean)

      await prisma.wasteLog.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
      if (itemNames.length > 0) {
        await prisma.inventoryLog.deleteMany({
          where: {
            itemName: { in: itemNames },
            action: { startsWith: 'WASTE' }
          }
        }).catch(() => {})
      }
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "WasteLog" WHERE id = ANY($1)`, [ids])
        if (itemNames.length > 0) {
          await deleteFromNeon(`DELETE FROM "InventoryLog" WHERE "itemName" = ANY($1) AND action LIKE 'WASTE%'`, [itemNames])
        }
      }
    } else if (model === 'InventoryLog') {
      const invLogs = await prisma.inventoryLog.findMany({ where: { id: { in: ids } } }).catch(() => [])
      const wasteItemNames = invLogs
        .filter((l: any) => l.action && typeof l.action === 'string' && l.action.startsWith('WASTE'))
        .map((l: any) => l.itemName)
        .filter(Boolean)

      await prisma.inventoryLog.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
      if (wasteItemNames.length > 0) {
        await prisma.wasteLog.deleteMany({ where: { itemName: { in: wasteItemNames } } }).catch(() => {})
      }
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "InventoryLog" WHERE id = ANY($1)`, [ids])
        if (wasteItemNames.length > 0) {
          await deleteFromNeon(`DELETE FROM "WasteLog" WHERE "itemName" = ANY($1)`, [wasteItemNames])
        }
      }
    } else {
      if (!process.env.VERCEL) {
        await deleteFromNeon(`DELETE FROM "${model}" WHERE id = ANY($1)`, [ids])
      }
    }

    // ── Execute Primary Model Deletion in Current Database ────────────────────
    const previousRecords = await delegate.findMany({ where: { id: { in: ids } } }).catch(() => [])
    const deleteResult = await delegate.deleteMany({ where: { id: { in: ids } } })

    // If orders were deleted, heal table statuses
    if (model === 'Order') {
      const activeTables = await prisma.table.findMany({
        where: { id: { notIn: ['tbl_static_delivery', 'tbl_static_takeaway', '__archived_orders_table__'] } },
        select: { id: true }
      }).catch(() => [])
      for (const t of activeTables) {
        const openCount = await prisma.order.count({ where: { tableId: t.id, status: 'OPEN' } })
        if (openCount === 0) {
          await prisma.table.update({ where: { id: t.id }, data: { status: 'FREE', mergedWithId: null } }).catch(() => {})
        }
      }
      if (!process.env.VERCEL) {
        await deleteFromNeon(`
          UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL 
          WHERE id NOT IN ('tbl_static_delivery', 'tbl_static_takeaway', '__archived_orders_table__')
            AND id NOT IN (SELECT DISTINCT "tableId" FROM "Order" WHERE status = 'OPEN');
        `)
      }
    }

    await logDevAction({
      action: 'DELETE',
      targetTable: model,
      recordId: ids.length === 1 ? ids[0] : `bulk_${ids.length}`,
      previousState: { count: previousRecords.length, sampleIds: ids.slice(0, 5) },
      reason: `${reason} (${deleteResult.count} records)`,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({ success: true, count: deleteResult.count, deletedIds: ids })
  } catch (err: any) {
    console.error('[DELETE /api/system/records]', err)
    return NextResponse.json({ error: err.message || 'Delete record failed' }, { status: 500 })
  }
}
