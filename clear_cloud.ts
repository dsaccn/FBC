import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const envPath = './.env';
const envFile = fs.readFileSync(envPath, 'utf8');
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

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("Connecting to Neon Database...");
  const client = await pool.connect();
  
  try {
    // Delete in correct order to avoid foreign key constraints
    const res1 = await client.query('DELETE FROM "Cancellation"');
    console.log(`Deleted ${res1.rowCount} cancellations.`);
    
    const res2 = await client.query('DELETE FROM "Payment"');
    console.log(`Deleted ${res2.rowCount} payments.`);
    
    const res3 = await client.query('DELETE FROM "OrderItem"');
    console.log(`Deleted ${res3.rowCount} order items.`);
    
    const res4 = await client.query('DELETE FROM "Order"');
    console.log(`Deleted ${res4.rowCount} orders.`);
    
    // Also reset tables to FREE since all orders are deleted
    await client.query(`UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL`);
    console.log("Reset all tables to FREE.");
    
    console.log("Cloud database cleared successfully.");
  } catch (err) {
    console.error("Error clearing cloud database:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
