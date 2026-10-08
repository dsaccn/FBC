const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Starting offline database cleanup...')

  try {
    // 1. Delete Cancellations
    const cancellations = await prisma.cancellation.deleteMany({})
    console.log(`✓ Deleted ${cancellations.count} cancellations.`)

    // 2. Delete Payments
    const payments = await prisma.payment.deleteMany({})
    console.log(`✓ Deleted ${payments.count} payments.`)

    // 3. Delete OrderItems
    const orderItems = await prisma.orderItem.deleteMany({})
    console.log(`✓ Deleted ${orderItems.count} order items.`)

    // 4. Delete Orders
    const orders = await prisma.order.deleteMany({})
    console.log(`✓ Deleted ${orders.count} orders.`)

    // 5. Delete Shift Logs (transactional history)
    const shiftLogs = await prisma.shiftLog.deleteMany({})
    console.log(`✓ Deleted ${shiftLogs.count} shift logs.`)

    // 6. Reset all tables to FREE status and clear merge links
    const tables = await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null
      }
    })
    console.log(`✓ Reset ${tables.count} tables to FREE.`)

    console.log('\n🎉 Successfully cleared all transactions, sales, and table statuses!')
    console.log('Menu items, ingredients, and current stock quantities remain untouched.')
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
