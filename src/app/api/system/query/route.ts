import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logDevAction } from '@/lib/dev-audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { query, allowWrite, reason } = await req.json()
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 })
    }

    const trimmed = query.trim()
    const isMutation = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)/i.test(trimmed)

    if (isMutation && !allowWrite) {
      return NextResponse.json({
        error: 'Execution Blocked: This query modifies data. Please toggle "Enable Write Mode" to proceed.',
        isBlockedMutation: true,
      }, { status: 400 })
    }

    const startTime = performance.now()
    const results: any = await prisma.$queryRawUnsafe(trimmed)
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2))

    if (isMutation) {
      await logDevAction({
        action: 'SQL_QUERY',
        targetTable: 'RAW_SQL',
        newState: { query: trimmed },
        reason: reason || 'Raw SQL mutation executed in developer console',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      })
    }

    return NextResponse.json({
      success: true,
      durationMs,
      rowCount: Array.isArray(results) ? results.length : 1,
      results,
    })
  } catch (err: any) {
    console.error('[POST /api/system/query]', err)
    return NextResponse.json({ error: err.message || 'SQL execution failed' }, { status: 500 })
  }
}
