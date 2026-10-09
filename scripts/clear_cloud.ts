import { Pool } from 'pg';
import * as fs from 'fs';

const envPath = './.env';
if (fs.existsSync(envPath)) {
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
}

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("☁️  Connecting to Neon Database...");
  const client = await pool.connect();
  
  try {
    const res1 = await client.query('DELETE FROM "Cancellation"');
    console.log(`  ✓ Deleted ${res1.rowCount} cancellations.`);
    
    const res2 = await client.query('DELETE FROM "Payment"');
    console.log(`  ✓ Deleted ${res2.rowCount} payments.`);
    
    const res3 = await client.query('DELETE FROM "OrderItem"');
    console.log(`  ✓ Deleted ${res3.rowCount} order items.`);
    
    const res4 = await client.query('DELETE FROM "Order"');
    console.log(`  ✓ Deleted ${res4.rowCount} orders.`);

    const res5 = await client.query('DELETE FROM "ShiftLog"');
    console.log(`  ✓ Deleted ${res5.rowCount} shift logs.`);

    const res6 = await client.query('DELETE FROM "InventoryLog"');
    console.log(`  ✓ Deleted ${res6.rowCount} inventory logs.`);

    await client.query('DELETE FROM "StaffMealItem"');
    await client.query('DELETE FROM "StaffMeal"');
    await client.query('DELETE FROM "StaffRecipe"');
    await client.query('DELETE FROM "StaffMenuItem"');
    await client.query('DELETE FROM "StaffIngredient"');

    const res7 = await client.query('DELETE FROM "Recipe"');
    console.log(`  ✓ Deleted ${res7.rowCount} recipes.`);

    await client.query('UPDATE "MenuItem" SET "parentItemId" = NULL');

    const res8 = await client.query('DELETE FROM "MenuItem"');
    console.log(`  ✓ Deleted ${res8.rowCount} menu items.`);

    const res9 = await client.query('DELETE FROM "Category"');
    console.log(`  ✓ Deleted ${res9.rowCount} categories.`);

    const res10 = await client.query('DELETE FROM "Ingredient"');
    console.log(`  ✓ Deleted ${res10.rowCount} ingredients.`);
    
    const res11 = await client.query(`
      DELETE FROM "Table" 
      WHERE number LIKE 'Delivery:%' 
         OR number LIKE 'Takeaway:%' 
         OR number LIKE 'DLV-%' 
         OR number = 'Archived'
    `);
    console.log(`  ✓ Removed ${res11.rowCount} virtual delivery/takeaway tables.`);

    await client.query(`UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL`);
    console.log("  ✓ Reset all tables to FREE.");
    
    console.log("✨ Cloud database cleared successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
