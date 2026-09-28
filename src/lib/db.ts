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

// Open pooled connections ahead of the first request. The Supabase pooler is in
// ap-northeast-1 while this app runs in us-east-1, so the first handshake costs
// ~2s — it must not land on a real user's login.
export async function warmPool(count = 2): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, () =>
      pool
        .connect()
        .then((client) => client.release())
        .catch(() => {}),
    ),
  );
}

// Also warm lazily at module load, so any entry point that pulls in this module
// benefits even if instrumentation.ts did not run.
void warmPool();

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

