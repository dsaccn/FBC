import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import FuturisticMenuClient, {
  MenuItemData,
  CategoryData,
} from './FuturisticMenuClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Kogna Coffee | Digital Futuristic Menu',
  description: 'Digital live table menu for Kogna Coffee.',
}

export default async function MenuPage() {
  let items: MenuItemData[] = []
  let categories: CategoryData[] = []

  try {
    const rawCategories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    })

    categories = rawCategories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }))

    const rawItems = await prisma.menuItem.findMany({
      where: { available: true },
      include: { category: true },
      orderBy: { name: 'asc' },
    })

    items = rawItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      available: item.available,
      categoryId: item.categoryId,
      categoryName: item.category?.name,
      categoryType: item.category?.type,
    }))
  } catch (err) {
    console.error('Error fetching menu items for /menu:', err)
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#05070B] text-[#00F0FF] flex items-center justify-center font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00F0FF] animate-ping" />
            <span>CALIBRATING QUANTUM MENU MATRIX...</span>
          </div>
        </div>
      }
    >
      <FuturisticMenuClient items={items} categories={categories} />
    </Suspense>
  )
}
