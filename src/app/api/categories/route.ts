import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { backgroundSync, pushCategoryToCloud } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const categories = await prisma.category.findMany({
    include: { menuItems: { where: { available: true }, orderBy: { name: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  // Post-process sort: Ensure 'bottle drinks' / 'bottle' comes after 'shot' / 'shots'
  // and keep everything else ordered by creation time (ascending).
  categories.sort((a, b) => {
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

  return NextResponse.json(categories)
}

export async function POST(req: Request) {
  const body = await req.json()
  const category = await prisma.category.create({ data: body })
  await pushCategoryToCloud(category)
  backgroundSync()
  return NextResponse.json(category)
}

