const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Update ALL items — sets costPrice to 0 for any that are null
  const all = await p.menuItem.findMany({ select: { id: true, costPrice: true } })
  let count = 0
  for (const item of all) {
    if (item.costPrice === null || item.costPrice === undefined) {
      await p.menuItem.update({ where: { id: item.id }, data: { costPrice: 0 } })
      count++
    }
  }
  console.log('Backfilled', count, 'items with costPrice = 0')
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect())
