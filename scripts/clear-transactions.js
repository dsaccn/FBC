const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Clearing transaction and order data...')

  // The order of deletion is important due to foreign key constraints.
  // We must delete children first, then parents.
  
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

  console.log('All transaction and order data has been successfully cleared.')
}

main()
  .catch(e => {
    console.error('Error clearing data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
