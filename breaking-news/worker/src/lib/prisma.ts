import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Connection pool configuration.
// Use PGBOUNCER_URL if available (Railway's pooled connection), otherwise DATABASE_URL.
// PgBouncer allows many more concurrent workers on fewer actual DB connections.
const dbUrl = process.env['PGBOUNCER_URL'] || process.env['DATABASE_URL'] || '';
const pooledUrl = dbUrl.includes('connection_limit=')
  ? dbUrl
  : dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=20&pool_timeout=30';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: pooledUrl } } : undefined,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
