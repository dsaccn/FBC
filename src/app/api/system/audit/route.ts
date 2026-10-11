import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '30', 10)))
  const table = searchParams.get('table') || ''

  try {
    const where: any = {}
    if (table) where.targetTable = table

    const [totalCount, logs] = await Promise.all([
      prisma.devAuditLog.count({ where }),
      prisma.devAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
    ])

    return NextResponse.json({
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      logs,
    })
  } catch (err: any) {
    console.error('[GET /api/system/audit]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
