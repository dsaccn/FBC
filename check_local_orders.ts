import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const allOrders = await prisma.order.findMany();
  console.log("All local orders:", allOrders);
  
  const pending = await prisma.order.findMany({ where: { pendingSync: true } });
  console.log("Pending local orders:", pending);
}
run().catch(console.error).finally(() => prisma.$disconnect());
