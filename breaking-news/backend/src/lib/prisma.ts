import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use PgBouncer pooled URL if available (Railway provides this)
const dbUrl = process.env['PGBOUNCER_URL'] || process.env['DATABASE_URL'] || '';
const pooledUrl = dbUrl && !dbUrl.includes('connection_limit=')
  ? dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=15'
  : dbUrl;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: pooledUrl } } : undefined,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
