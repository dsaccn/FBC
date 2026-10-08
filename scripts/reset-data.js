const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Starting cleanup process...')

  // 1. Delete Cancellations (references OrderItem)
  const cancellations = await prisma.cancellation.deleteMany({})
  console.log(`Deleted ${cancellations.count} cancellations.`)

  // 2. Delete Payments (references Order)
  const payments = await prisma.payment.deleteMany({})
  console.log(`Deleted ${payments.count} payments.`)

  // 3. Delete OrderItems (references Order)
  const orderItems = await prisma.orderItem.deleteMany({})
  console.log(`Deleted ${orderItems.count} order items.`)

  // 4. Delete Orders
  const orders = await prisma.order.deleteMany({})
  console.log(`Deleted ${orders.count} orders.`)

  // 5. Reset MenuItem stock and bar quantities to 0
  const menuItems = await prisma.menuItem.updateMany({
    data: {
      stockQuantity: 0,
      barQuantity: 0
    }
  })
  console.log(`Reset stock and bar quantities to 0 for ${menuItems.count} menu items.`)

  console.log('🎉 Cleanup successfully completed!')
}

main()
  .catch(e => {
    console.error('❌ Error during cleanup:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
