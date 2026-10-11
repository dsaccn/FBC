const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')
const fs = require('fs')

async function cleanup() {
  const prisma = new PrismaClient()

  console.log('--- Cleaning up local SQLite ---')
  const localTables = await prisma.table.findMany()
  console.log('Current local tables:', localTables.map(t => ({ id: t.id, number: t.number })))

  // Identify junk delivery/takeaway tables (e.g. "Delivery: glameur #0629-847", "Takeaway: cbe #0629-699")
  const junkTables = localTables.filter(t => {
    const num = t.number.toLowerCase()
    return (
      num.startsWith('delivery:') ||
      num.startsWith('takeaway:') ||
      num.startsWith('dlv-') ||
      (num.startsWith('delivery') && t.id !== 'tbl_static_delivery') ||
      (num.startsWith('takeaway') && t.id !== 'tbl_static_takeaway')
    )
  })

  console.log('Found junk tables to remove:', junkTables.map(t => ({ id: t.id, number: t.number })))

  // Ensure tbl_static_delivery and tbl_static_takeaway exist
  await prisma.table.upsert({
    where: { id: 'tbl_static_delivery' },
    update: { number: 'Delivery', status: 'FREE' },
    create: { id: 'tbl_static_delivery', number: 'Delivery', status: 'FREE', pendingSync: false }
  })
  await prisma.table.upsert({
    where: { id: 'tbl_static_takeaway' },
    update: { number: 'Takeaway', status: 'FREE' },
    create: { id: 'tbl_static_takeaway', number: 'Takeaway', status: 'FREE', pendingSync: false }
  })

  for (const jt of junkTables) {
    const targetId = jt.number.toLowerCase().includes('takeaway') ? 'tbl_static_takeaway' : 'tbl_static_delivery'
    const updatedOrders = await prisma.order.updateMany({
      where: { tableId: jt.id },
      data: { tableId: targetId }
    })
    console.log(`Reassigned ${updatedOrders.count} orders from ${jt.number} (${jt.id}) to ${targetId}`)
    await prisma.table.delete({ where: { id: jt.id } })
    console.log(`Deleted junk table ${jt.id} (${jt.number})`)
  }

  // Also reset status of tbl_static_delivery and tbl_static_takeaway to FREE
  await prisma.table.updateMany({
    where: { id: { in: ['tbl_static_delivery', 'tbl_static_takeaway'] } },
    data: { status: 'FREE', pendingSync: false }
  })

  const remainingLocal = await prisma.table.findMany()
  console.log('Remaining local tables:', remainingLocal.map(t => ({ id: t.id, number: t.number, status: t.status })))

  // Now clean up Neon PostgreSQL
  console.log('\n--- Cleaning up Neon PostgreSQL ---')
  const env = fs.readFileSync('.env', 'utf8')
  const match = env.match(/NEON_DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/)
  const neonUrl = match ? match[1] : process.env.NEON_DATABASE_URL

  if (neonUrl) {
    try {
      const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 10000 })
      
      // Ensure static tables exist in Neon
      await pool.query(`
        INSERT INTO "Table" (id, number, status, "pendingSync", "createdAt")
        VALUES ('tbl_static_delivery', 'Delivery', 'FREE', false, NOW())
        ON CONFLICT (id) DO UPDATE SET number = 'Delivery', status = 'FREE', "pendingSync" = false;
        
        INSERT INTO "Table" (id, number, status, "pendingSync", "createdAt")
        VALUES ('tbl_static_takeaway', 'Takeaway', 'FREE', false, NOW())
        ON CONFLICT (id) DO UPDATE SET number = 'Takeaway', status = 'FREE', "pendingSync" = false;
      `)

      const { rows: cloudTables } = await pool.query('SELECT id, number, status FROM "Table"')
      console.log('Current Neon tables:', cloudTables)

      const cloudJunk = cloudTables.filter(t => {
        const num = (t.number || '').toLowerCase()
        return (
          num.startsWith('delivery:') ||
          num.startsWith('takeaway:') ||
          num.startsWith('dlv-') ||
          (num.startsWith('delivery') && t.id !== 'tbl_static_delivery') ||
          (num.startsWith('takeaway') && t.id !== 'tbl_static_takeaway')
        )
      })

      console.log('Found Neon junk tables to remove:', cloudJunk)

      for (const jt of cloudJunk) {
        const targetId = jt.number.toLowerCase().includes('takeaway') ? 'tbl_static_takeaway' : 'tbl_static_delivery'
        const res = await pool.query('UPDATE "Order" SET "tableId" = $1 WHERE "tableId" = $2', [targetId, jt.id])
        console.log(`Neon: Reassigned ${res.rowCount} orders from ${jt.number} to ${targetId}`)
        await pool.query('DELETE FROM "Table" WHERE id = $1', [jt.id])
        console.log(`Neon: Deleted table ${jt.id} (${jt.number})`)
      }

      await pool.query(`
        UPDATE "Table" SET status = 'FREE', "pendingSync" = false 
        WHERE id IN ('tbl_static_delivery', 'tbl_static_takeaway');
      `)

      const { rows: finalCloud } = await pool.query('SELECT id, number, status FROM "Table"')
      console.log('Final Neon tables:', finalCloud)

      await pool.end()
    } catch (err) {
      console.error('Neon cleanup warning:', err.message)
    }
  }

  await prisma.$disconnect()
  console.log('\nCleanup finished successfully!')
}

cleanup().catch(console.error)
