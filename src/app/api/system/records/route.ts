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

    if (ids.length === 1) {
      const singleId = ids[0]
      const previousState = await delegate.findUnique({ where: { id: singleId } }).catch(() => null)
      if (!previousState) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 })
      }

      await delegate.delete({ where: { id: singleId } })

      // Cascade deletions between WasteLog and InventoryLog to keep both in sync
      if (model === 'WasteLog') {
        await prisma.inventoryLog.deleteMany({ where: { id: singleId } }).catch(() => {})
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
            await p.query('DELETE FROM "WasteLog" WHERE id = $1', [singleId]).catch(() => {})
            await p.query('DELETE FROM "InventoryLog" WHERE id = $1', [singleId]).catch(() => {})
            await p.end().catch(() => {})
          }
        } catch {}
      } else if (model === 'InventoryLog') {
        await prisma.wasteLog.deleteMany({ where: { id: singleId } }).catch(() => {})
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
            await p.query('DELETE FROM "InventoryLog" WHERE id = $1', [singleId]).catch(() => {})
            await p.query('DELETE FROM "WasteLog" WHERE id = $1', [singleId]).catch(() => {})
            await p.end().catch(() => {})
          }
        } catch {}
      }

      await logDevAction({
        action: 'DELETE',
        targetTable: model,
        recordId: singleId,
        previousState,
        reason,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      })

      return NextResponse.json({ success: true, deletedId: singleId, count: 1 })
    } else {
      // Bulk delete
      const previousRecords = await delegate.findMany({ where: { id: { in: ids } } }).catch(() => [])
      const deleteResult = await delegate.deleteMany({ where: { id: { in: ids } } })

      if (model === 'WasteLog') {
        await prisma.inventoryLog.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
            await p.query('DELETE FROM "WasteLog" WHERE id = ANY($1)', [ids]).catch(() => {})
            await p.query('DELETE FROM "InventoryLog" WHERE id = ANY($1)', [ids]).catch(() => {})
            await p.end().catch(() => {})
          }
        } catch {}
      } else if (model === 'InventoryLog') {
        await prisma.wasteLog.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
        try {
          const url = process.env.NEON_DATABASE_URL
          if (url) {
            const { Pool } = await import('pg')
            const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
            await p.query('DELETE FROM "InventoryLog" WHERE id = ANY($1)', [ids]).catch(() => {})
            await p.query('DELETE FROM "WasteLog" WHERE id = ANY($1)', [ids]).catch(() => {})
            await p.end().catch(() => {})
          }
        } catch {}
      }

      await logDevAction({
        action: 'DELETE',
        targetTable: model,
        recordId: `bulk_${ids.length}`,
        previousState: { count: previousRecords.length, sampleIds: ids.slice(0, 5) },
        reason: `${reason} (${deleteResult.count} records)`,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      })

      return NextResponse.json({ success: true, count: deleteResult.count, deletedIds: ids })
    }
  } catch (err: any) {
    console.error('[DELETE /api/system/records]', err)
    return NextResponse.json({ error: err.message || 'Delete record failed' }, { status: 500 })
  }
}
