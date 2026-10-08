const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Updating low stock thresholds to 10...')

  const menuItems = await prisma.menuItem.updateMany({
    data: { lowStockThreshold: 10 }
  })
  console.log(`Updated ${menuItems.count} menu items to have a low stock threshold of 10.`)

  const ingredients = await prisma.ingredient.updateMany({
    data: { minThreshold: 10 }
  })
  console.log(`Updated ${ingredients.count} ingredients to have a minimum threshold of 10.`)

  console.log('Done!')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
