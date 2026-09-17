import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

function buildPool() {
  const rawUrl = process.env.DATABASE_URL ?? '';
  // pg cannot handle the pgbouncer=true query param — strip it
  const cleanUrl = rawUrl
    .replace('?pgbouncer=true', '')
    .replace('&pgbouncer=true', '');

  // Parse host from URL to decide whether to enable SSL
  const isSupabase = cleanUrl.includes('supabase.com');

  return new Pool({
    connectionString: cleanUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const pool = globalForPrisma.pool ?? buildPool();
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

