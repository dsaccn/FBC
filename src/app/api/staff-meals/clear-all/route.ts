import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Delete all staff meal log items first (cascaded), then meals
    await prisma.staffMealItem.deleteMany({})
    await prisma.staffMeal.deleteMany({})
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[clear-all meals] error:', err)
    return NextResponse.json({ error: 'Failed to clear meal logs' }, { status: 500 })
  }
}
