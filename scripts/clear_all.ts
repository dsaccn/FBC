import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import * as fs from 'fs';

// Load .env
if (fs.existsSync('./.env')) {
  const envFile = fs.readFileSync('./.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

async function clearOffline() {
  console.log("\n🧹 Clearing Offline (Local SQLite) database...");
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

  try {
    const cancellations = await prisma.cancellation.deleteMany({});
    console.log(`  ✓ Deleted ${cancellations.count} local cancellations.`);
    
    const payments = await prisma.payment.deleteMany({});
    console.log(`  ✓ Deleted ${payments.count} local payments.`);
    
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`  ✓ Deleted ${orderItems.count} local order items.`);
    
    const orders = await prisma.order.deleteMany({});
    console.log(`  ✓ Deleted ${orders.count} local orders.`);
    
    const delTables = await prisma.table.deleteMany({
      where: {
        OR: [
          { number: { startsWith: 'Delivery:' } },
          { number: { startsWith: 'Takeaway:' } },
          { number: { startsWith: 'DLV-' } },
          { number: 'Archived' },
        ]
      }
    });
    console.log(`  ✓ Removed ${delTables.count} virtual delivery/takeaway tables.`);

    await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null,
      }
    });
    console.log("  ✓ Reset all local tables to FREE.");
  } catch (err) {
    console.error("  ✗ Error clearing local database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

async function clearCloud() {
  if (!process.env.NEON_DATABASE_URL) {
    console.log("\n⚠️ NEON_DATABASE_URL not set in .env. Skipping cloud clean.");
    return;
  }

  console.log("\n☁️  Clearing Online Cloud (Neon PostgreSQL) database...");
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    try {
      const res1 = await client.query('DELETE FROM "Cancellation"');
      console.log(`  ✓ Deleted ${res1.rowCount} cloud cancellations.`);
      
      const res2 = await client.query('DELETE FROM "Payment"');
      console.log(`  ✓ Deleted ${res2.rowCount} cloud payments.`);
      
      const res3 = await client.query('DELETE FROM "OrderItem"');
      console.log(`  ✓ Deleted ${res3.rowCount} cloud order items.`);
      
      const res4 = await client.query('DELETE FROM "Order"');
      console.log(`  ✓ Deleted ${res4.rowCount} cloud orders.`);
      
      const res5 = await client.query(`
        DELETE FROM "Table" 
        WHERE number LIKE 'Delivery:%' 
           OR number LIKE 'Takeaway:%' 
           OR number LIKE 'DLV-%' 
           OR number = 'Archived'
      `);
      console.log(`  ✓ Removed ${res5.rowCount} virtual delivery/takeaway tables from cloud.`);

      await client.query(`UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL`);
      console.log("  ✓ Reset all cloud tables to FREE.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("  ✗ Error clearing cloud database:", err);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("=========================================");
  console.log("   POS DATA CLEANUP (LOCAL & CLOUD)      ");
  console.log("=========================================");
  
  await clearOffline();
  await clearCloud();

  console.log("\n=========================================");
  console.log("✨ All orders and payments cleared successfully!");
  console.log("=========================================\n");
}

main().catch(console.error);
