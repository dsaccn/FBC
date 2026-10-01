const { Client } = require('pg')
const bcrypt = require('bcryptjs')

const url = 'postgresql://neondb_owner:npg_OqYfFNel19nm@ep-late-base-aeh5dxxq-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require'

async function seed() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to Neon PostgreSQL!')

  // Check if admin user exists
  const existing = await client.query(`SELECT id FROM "User" WHERE username = 'admin' LIMIT 1`)
  if (existing.rows.length === 0) {
    const adminHash = await bcrypt.hash('admin123', 10)
    await client.query(
      `INSERT INTO "User" (id, username, "passwordHash", "fullName", role, active, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      ['admin-user-01', 'admin', adminHash, 'Nexora Admin', 'ADMIN', true]
    )
    console.log('✅ Admin user created in Neon: admin / admin123')
  } else {
    console.log('ℹ️ Admin user already exists in Neon')
  }

  await client.end()
  console.log('Seed completed successfully!')
}

seed().catch(err => {
  console.error('Seed error:', err)
  process.exit(1)
})
