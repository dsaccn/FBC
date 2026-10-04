import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

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

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  console.log("Clearing Offline database...");
  const cancellations = await prisma.cancellation.deleteMany({});
  console.log(`Deleted ${cancellations.count} cancellations.`);
  
  const payments = await prisma.payment.deleteMany({});
  console.log(`Deleted ${payments.count} payments.`);
  
  const orderItems = await prisma.orderItem.deleteMany({});
  console.log(`Deleted ${orderItems.count} order items.`);
  
  const orders = await prisma.order.deleteMany({});
  console.log(`Deleted ${orders.count} orders.`);
  
  await prisma.table.updateMany({
    data: {
      status: 'FREE',
      mergedWithId: null,
    }
  });
  console.log("Local tables reset to FREE.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
