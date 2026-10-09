import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  console.log("🧹 Clearing Offline (Local SQLite) database...");
  try {
    const cancellations = await prisma.cancellation.deleteMany({});
    console.log(`  ✓ Deleted ${cancellations.count} cancellations.`);
    
    const payments = await prisma.payment.deleteMany({});
    console.log(`  ✓ Deleted ${payments.count} payments.`);
    
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`  ✓ Deleted ${orderItems.count} order items.`);
    
    const orders = await prisma.order.deleteMany({});
    console.log(`  ✓ Deleted ${orders.count} orders.`);

    const shiftLogs = await prisma.shiftLog.deleteMany({});
    console.log(`  ✓ Deleted ${shiftLogs.count} shift logs.`);

    const invLogs = await prisma.inventoryLog.deleteMany({});
    console.log(`  ✓ Deleted ${invLogs.count} inventory logs.`);

    await prisma.staffMealItem.deleteMany({});
    await prisma.staffMeal.deleteMany({});
    await prisma.staffRecipe.deleteMany({});
    await prisma.staffMenuItem.deleteMany({});
    await prisma.staffIngredient.deleteMany({});

    const recipes = await prisma.recipe.deleteMany({});
    console.log(`  ✓ Deleted ${recipes.count} recipes.`);

    await prisma.menuItem.updateMany({ data: { parentItemId: null } });

    const menuItems = await prisma.menuItem.deleteMany({});
    console.log(`  ✓ Deleted ${menuItems.count} menu items.`);

    const categories = await prisma.category.deleteMany({});
    console.log(`  ✓ Deleted ${categories.count} categories.`);

    const ingredients = await prisma.ingredient.deleteMany({});
    console.log(`  ✓ Deleted ${ingredients.count} ingredients.`);
    
    await prisma.table.deleteMany({
      where: {
        OR: [
          { number: { startsWith: 'Delivery:' } },
          { number: { startsWith: 'Takeaway:' } },
          { number: { startsWith: 'DLV-' } },
          { number: 'Archived' },
        ]
      }
    });

    await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null,
      }
    });
    console.log("  ✓ Reset local tables to FREE.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
