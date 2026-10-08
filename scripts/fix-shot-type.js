const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Fix shot category type to DRINK so it gets cost price / bar quantity tracking
  const result = await p.category.updateMany({
    where: { name: 'shot' },
    data: { type: 'DRINK' }
  })
  console.log('Updated shot category:', result.count, 'record(s)')

  // Verify
  const cats = await p.category.findMany()
  console.log('All categories now:', cats.map(c => `${c.name} (${c.type})`).join(', '))
}

main().catch(console.error).finally(() => p.$disconnect())
