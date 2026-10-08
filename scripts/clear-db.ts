import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Clearing database...')

  // Clear transactional data (Reports)
  await prisma.payment.deleteMany({})
  await prisma.cancellation.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  console.log('✅ Cleared all orders and payments (Reports)')

  // Clear catalog data (Menu)
  await prisma.recipe.deleteMany({})
  await prisma.menuItem.deleteMany({})
  await prisma.ingredient.deleteMany({})
  await prisma.category.deleteMany({})
  console.log('✅ Cleared all menu items, recipes, ingredients, and categories')

  console.log('🎉 Database cleared! Users and Tables were kept.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
