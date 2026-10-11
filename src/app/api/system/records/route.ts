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
      } else if (['MenuItem', 'Category', 'Ingredient', 'StaffMember', 'StaffMenuItem', 'StaffIngredient'].includes(model)) {
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
    const model = searchParams.get('model')
    const id = searchParams.get('id')
    const reason = searchParams.get('reason') || 'Deleted record via developer portal'

    if (!model || !id) {
      return NextResponse.json({ error: 'Model and id required' }, { status: 400 })
    }

    const delegate = getModelDelegate(model)
    if (!delegate) {
      return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
    }

    const previousState = await delegate.findUnique({ where: { id } }).catch(() => null)
    if (!previousState) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    await delegate.delete({ where: { id } })

    await logDevAction({
      action: 'DELETE',
      targetTable: model,
      recordId: id,
      previousState,
      reason,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({ success: true, deletedId: id })
  } catch (err: any) {
    console.error('[DELETE /api/system/records]', err)
    return NextResponse.json({ error: err.message || 'Delete record failed' }, { status: 500 })
  }
}
