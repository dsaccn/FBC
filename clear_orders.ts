import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually
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

const localPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const cloudPrisma = new PrismaClient({
  datasourceUrl: process.env.NEON_DATABASE_URL,
});

async function clearData(prisma: PrismaClient, name: string) {
  console.log(`Clearing ${name} database...`);
  try {
    const cancellations = await prisma.cancellation.deleteMany({});
    console.log(`Deleted ${cancellations.count} cancellations.`);
    
    const payments = await prisma.payment.deleteMany({});
    console.log(`Deleted ${payments.count} payments.`);
    
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`Deleted ${orderItems.count} order items.`);
    
    const orders = await prisma.order.deleteMany({});
    console.log(`Deleted ${orders.count} orders.`);
  } catch (error) {
    console.error(`Error clearing ${name}:`, error);
  }
}

async function main() {
  await clearData(localPrisma, 'Offline');
  await clearData(cloudPrisma, 'Online');
  console.log("All orders and payments cleared successfully.");
}

main().catch(console.error).finally(async () => {
  await localPrisma.$disconnect();
  await cloudPrisma.$disconnect();
});
