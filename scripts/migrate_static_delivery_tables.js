const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function migrate() {
  console.log('--- Migrating to Static Delivery & Takeaway Tables ---')

  // 1. Create or ensure static 'Delivery' table
  let deliveryTable = await prisma.table.findUnique({ where: { number: 'Delivery' } })
  if (!deliveryTable) {
    deliveryTable = await prisma.table.create({
      data: {
        id: 'tbl_static_delivery',
        number: 'Delivery',
        status: 'FREE',
        pendingSync: true,
      },
    })
    console.log('Created static Delivery table:', deliveryTable.id)
  } else {
    console.log('Static Delivery table already exists:', deliveryTable.id)
  }

  // 2. Create or ensure static 'Takeaway' table
  let takeawayTable = await prisma.table.findUnique({ where: { number: 'Takeaway' } })
  if (!takeawayTable) {
    takeawayTable = await prisma.table.create({
      data: {
        id: 'tbl_static_takeaway',
        number: 'Takeaway',
        status: 'FREE',
        pendingSync: true,
      },
    })
    console.log('Created static Takeaway table:', takeawayTable.id)
  } else {
    console.log('Static Takeaway table already exists:', takeawayTable.id)
  }

  // 3. Find any virtual delivery/takeaway tables (exclude the static ones)
  const virtualTables = await prisma.table.findMany({
    where: {
      AND: [
        { id: { notIn: [deliveryTable.id, takeawayTable.id] } },
        {
          OR: [
            { number: { startsWith: 'Delivery:' } },
            { number: { startsWith: 'Takeaway:' } },
            { number: { startsWith: 'DELIVERY' } },
            { number: { startsWith: 'TAKEAWAY' } },
          ],
        },
      ],
    },
    include: {
      orders: {
        include: {
          orderItems: true,
        },
      },
    },
  })

  console.log(`Found ${virtualTables.length} virtual tables to migrate and clean up.`)

  for (const vt of virtualTables) {
    const isTakeaway = vt.number.toLowerCase().startsWith('takeaway')
    const targetTableId = isTakeaway ? takeawayTable.id : deliveryTable.id
    const tableName = vt.number

    // Extract customer name & phone
    let cleanName = tableName.replace(/^(Delivery:|Takeaway:)\s*/i, '').replace(/#.*$/, '').trim()
    let phone = ''
    const phoneMatch = cleanName.match(/\(([^)]+)\)/)
    if (phoneMatch) {
      phone = phoneMatch[1]
      cleanName = cleanName.replace(/\([^)]+\)/, '').trim()
    }
    const codeMatch = tableName.match(/(#\d+-\d+|#\d+)/)
    const code = codeMatch ? codeMatch[1] : ''

    console.log(`Migrating table '${tableName}' (${vt.id}) -> Target: ${isTakeaway ? 'Takeaway' : 'Delivery'}`)

    for (const order of vt.orders) {
      // Re-point order to the static table
      await prisma.order.update({
        where: { id: order.id },
        data: { tableId: targetTableId },
      })

      // Ensure first orderItem carries the metadata note if not already present
      if (order.orderItems.length > 0) {
        const firstItem = order.orderItems[0]
        let currentNote = firstItem.notes || ''
        if (!currentNote.includes('👤') && cleanName) {
          const metaTag = [
            cleanName ? `👤 ${cleanName}` : '',
            phone ? `📞 ${phone}` : '',
            code ? `${code}` : '',
          ].filter(Boolean).join(' | ')

          const newNote = currentNote ? `[${metaTag}] ${currentNote}` : `[${metaTag}]`
          await prisma.orderItem.update({
            where: { id: firstItem.id },
            data: { notes: newNote },
          })
        }
      }
    }

    // Now safe to delete the old virtual table
    await prisma.table.delete({ where: { id: vt.id } })
    console.log(`Deleted virtual table '${tableName}' (${vt.id})`)
  }

  // Count final tables locally
  const remainingTables = await prisma.table.findMany({ select: { id: true, number: true, status: true } })
  console.log('--- Final Tables in Local SQLite ---')
  console.table(remainingTables)

  // 4. Also guarantee static tables on Neon Cloud Postgres if configured
  const fs = require('fs')
  try {
    const env = fs.readFileSync('.env', 'utf8')
    const match = env.match(/NEON_DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/)
    const neonUrl = match ? match[1] : process.env.NEON_DATABASE_URL

    if (neonUrl) {
      const { Pool } = require('pg')
      const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 5000 })
      console.log('Connecting to Neon PostgreSQL Cloud...')
      
      await pool.query(`
        INSERT INTO "Table" (id, number, status, "pendingSync", "createdAt") 
        VALUES ('tbl_static_delivery', 'Delivery', 'FREE', false, NOW()) 
        ON CONFLICT (id) DO NOTHING;
      `)
      await pool.query(`
        INSERT INTO "Table" (id, number, status, "pendingSync", "createdAt") 
        VALUES ('tbl_static_takeaway', 'Takeaway', 'FREE', false, NOW()) 
        ON CONFLICT (id) DO NOTHING;
      `)

      // Re-point any orders on Neon from the deleted virtual tables
      await pool.query(`
        UPDATE "Order" SET "tableId" = 'tbl_static_delivery' 
        WHERE "tableId" = 'cmv2fkk4c000988lo8j2edj41';
      `)
      await pool.query(`
        UPDATE "Order" SET "tableId" = 'tbl_static_takeaway' 
        WHERE "tableId" = 'cmv2fl69f000e88loewatedzj';
      `)

      // Delete the two virtual tables on Neon if present
      await pool.query(`
        DELETE FROM "Table" WHERE id IN ('cmv2fkk4c000988lo8j2edj41', 'cmv2fl69f000e88loewatedzj');
      `)

      console.log('Successfully updated Neon cloud database tables!')
      await pool.end()
    }
  } catch (err) {
    console.warn('Neon cloud sync skipped/failed:', err.message)
  }
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
