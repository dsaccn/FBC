const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const prisma = new PrismaClient();
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const models = [
    'User',
    'Category',
    'MenuItem',
    'Ingredient',
    'Recipe',
    'Table',
    'Order',
    'OrderItem',
    'Payment',
    'Cancellation',
    'WasteLog',
    'InventoryLog',
    'StaffMember',
    'StaffMenuItem',
    'StaffIngredient',
    'StaffRecipe',
    'StaffMeal',
    'StaffMealItem'
  ];

  console.log('Comparing Local SQLite vs Cloud Neon:');
  console.log('--------------------------------------------------');
  console.log('Model'.padEnd(20) + 'Local SQLite'.padEnd(15) + 'Cloud Neon');
  console.log('--------------------------------------------------');

  for (const m of models) {
    let localCount = 0;
    let cloudCount = 0;
    try {
      const delegate = prisma[m.charAt(0).toLowerCase() + m.slice(1)];
      if (delegate) localCount = await delegate.count();
    } catch (e) {
      localCount = 'Err: ' + e.message;
    }

    try {
      const res = await pool.query(`SELECT COUNT(*)::int as count FROM "${m}"`);
      cloudCount = res.rows[0].count;
    } catch (e) {
      cloudCount = 'Err: ' + e.message;
    }

    console.log(m.padEnd(20) + String(localCount).padEnd(15) + String(cloudCount));
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
