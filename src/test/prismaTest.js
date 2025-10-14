import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.procurement_enterprise.findMany();
  console.log('Database connected ✅');
  console.log(result);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
