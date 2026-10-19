import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, pushCategoryToCloud } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const fetchCats = async () => {
    const cats = await prisma.category.findMany({
      include: { menuItems: { where: { available: true }, orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })

    // Post-process sort: Ensure 'bottle drinks' / 'bottle' comes after 'shot' / 'shots'
    // and keep everything else ordered by creation time (ascending).
    cats.sort((a, b) => {
      const nameA = a.name.toLowerCase()
      const nameB = b.name.toLowerCase()
      const isAShot = nameA.includes('shot')
      const isABottle = nameA.includes('bottle')
      const isBShot = nameB.includes('shot')
      const isBBottle = nameB.includes('bottle')

      if (isAShot && isBBottle) return -1
      if (isABottle && isBShot) return 1

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return cats
  }

  try {
    const categories = await fetchCats()
    return NextResponse.json(categories, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (err: any) {
    console.warn('[GET /api/categories] Initial query failed, retrying once:', err?.message)
    try {
      await new Promise(r => setTimeout(r, 600))
      const categories = await fetchCats()
      return NextResponse.json(categories, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      })
    } catch (retryErr) {
      console.error('[GET /api/categories] Fatal query error:', retryErr)
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const category = await prisma.category.create({ data: body })
  await pushCategoryToCloud(category)
  backgroundSync()
  return NextResponse.json(category)
}

