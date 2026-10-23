// ONE-TIME RECOVERY SCRIPT — run with: node recover-delivery.js
// Moves delivery items back from the merged Table 10 order into separate delivery orders.
const { PrismaClient } = require('./node_modules/@prisma/client')
const prisma = new PrismaClient()

const MERGED_ORDER_ID = 'cmvkwf3ai000apxhxzunrct4h'
const DELIVERY_TABLE_ID = 'tbl_static_delivery'

async function main() {
  const merged = await prisma.order.findUnique({
    where: { id: MERGED_ORDER_ID },
    include: {
      orderItems: {
        where: { status: { not: 'CANCELLED' } },
        include: { menuItem: { select: { name: true, price: true, id: true } } }
      }
    }
  })

  if (!merged) { console.log('Merged order not found — already recovered?'); return }

  const deliveryItems = merged.orderItems.filter(i => i.notes && i.notes.includes('👤'))
  console.log('Delivery items found on Table 10:', deliveryItems.length)
  if (deliveryItems.length === 0) { console.log('Nothing to restore.'); return }

  // Group items by their embedded #HHMM-xxx order key
  const groups = new Map()
  for (const item of deliveryItems) {
    const match = item.notes.match(/#(\d{4}-\d{3})/)
    const key = match ? match[1] : 'ungrouped'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  console.log('Delivery customer groups:', [...groups.keys()])

  let restored = 0
  for (const [key, items] of groups) {
    const newOrder = await prisma.order.create({
      data: {
        tableId: DELIVERY_TABLE_ID,
        waiterId: merged.waiterId,
        status: 'OPEN',
        pendingSync: true,
      }
    })

    for (const item of items) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { orderId: newOrder.id, pendingSync: true }
      })
    }

    const total = items.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const nameMatch = items[0].notes.match(/👤\s*([^|\\]]+)/)
    const name = nameMatch ? nameMatch[1].trim() : key
    console.log('✅ Restored: ' + name + ' — ' + items.length + ' item(s), ' + total + ' ETB → order ' + newOrder.id.slice(-8))
    restored++
  }

  // Clear merge group flags from both tables
  await prisma.table.updateMany({
    where: { OR: [{ id: DELIVERY_TABLE_ID }, { number: '10' }] },
    data: { mergeGroupId: null, mergeGroupLabel: null, mergedWithId: null }
  })

  // Delete the two empty delivery shell orders left over from the merge
  await prisma.order.deleteMany({
    where: {
      tableId: DELIVERY_TABLE_ID,
      status: 'OPEN',
      orderItems: { none: {} }
    }
  })

  console.log('\nDone — ' + restored + ' delivery orders restored. Table 10 and Delivery unlinked.')
  console.log('Refresh the Orders page to see them.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
