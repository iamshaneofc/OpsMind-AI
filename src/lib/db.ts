import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Strip pgbouncer=true since the pg library doesn't understand it — 
// Supabase adds it for Prisma's native driver but pg handles pooling itself
const rawUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
const connectionString = rawUrl.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
  max: 1, // Limit connections for serverless
});
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
