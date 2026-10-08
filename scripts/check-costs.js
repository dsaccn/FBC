const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Show all drink categories and a sample drink's data
  const cats = await p.category.findMany()
  console.log('All categories:', JSON.stringify(cats, null, 2))

  const drinks = await p.menuItem.findMany({
    where: { category: { type: 'DRINK' } },
    select: { id: true, name: true, costPrice: true, category: { select: { name: true, type: true } } },
    take: 3
  })
  console.log('\nSample drinks:', JSON.stringify(drinks, null, 2))
}

main().catch(console.error).finally(() => p.$disconnect())
