const { Pool } = require('pg')
const fs = require('fs')

async function resetNeonPending() {
  const env = fs.readFileSync('.env', 'utf8')
  const match = env.match(/NEON_DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/)
  const neonUrl = match ? match[1] : process.env.NEON_DATABASE_URL

  const pool = new Pool({ connectionString: neonUrl })
  console.log('Connecting to Neon PostgreSQL...')

  const r1 = await pool.query('UPDATE "Order" SET "pendingSync" = false WHERE "pendingSync" = true')
  const r2 = await pool.query('UPDATE "OrderItem" SET "pendingSync" = false WHERE "pendingSync" = true')
  const r3 = await pool.query('UPDATE "Payment" SET "pendingSync" = false WHERE "pendingSync" = true')
  const r4 = await pool.query('UPDATE "Table" SET "pendingSync" = false WHERE "pendingSync" = true')
  const r5 = await pool.query('UPDATE "Cancellation" SET "pendingSync" = false WHERE "pendingSync" = true').catch(() => ({ rowCount: 0 }))
  const r6 = await pool.query('UPDATE "InventoryLog" SET "pendingSync" = false WHERE "pendingSync" = true').catch(() => ({ rowCount: 0 }))

  console.log(`Updated Orders: ${r1.rowCount}, OrderItems: ${r2.rowCount}, Payments: ${r3.rowCount}, Tables: ${r4.rowCount}, Cancellations: ${r5.rowCount}, InventoryLogs: ${r6.rowCount}`)

  const check = await pool.query(`
    SELECT 
      (SELECT count(*) FROM "Order" WHERE "pendingSync" = true) as orders,
      (SELECT count(*) FROM "OrderItem" WHERE "pendingSync" = true) as order_items,
      (SELECT count(*) FROM "Payment" WHERE "pendingSync" = true) as payments,
      (SELECT count(*) FROM "Table" WHERE "pendingSync" = true) as tables
  `)
  console.log('Neon Pending counts after reset:', check.rows[0])

  await pool.end()
}

resetNeonPending().catch(console.error)
