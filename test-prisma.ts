import { prisma } from './src/lib/db';

async function main() {
  console.log("Prisma client initialized:", !!prisma);
}
main().catch(console.error);
