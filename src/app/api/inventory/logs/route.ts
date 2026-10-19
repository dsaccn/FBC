import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const logs = await prisma.inventoryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return NextResponse.json(logs, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (err: any) {
    console.warn('[GET /api/inventory/logs] Initial query failed, retrying once:', err?.message)
    try {
      await new Promise(r => setTimeout(r, 600))
      const logs = await prisma.inventoryLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json(logs, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      })
    } catch (retryErr) {
      console.error('[GET /api/inventory/logs] Fatal query error:', retryErr)
      return NextResponse.json({ error: String(retryErr) }, { status: 500 })
    }
  }
}
