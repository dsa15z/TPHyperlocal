// @ts-nocheck
import { PrismaClient } from '@prisma/client';

// ─── Primary client (read-write) ───────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prismaReplica: PrismaClient | undefined;
};

export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log:
    process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});

// ─── Read replica client (read-only, optional) ─────────────────────────────
// Falls back to primary if DATABASE_REPLICA_URL is not set

export const prismaRead: PrismaClient = process.env.DATABASE_REPLICA_URL
  ? (globalForPrisma.prismaReplica ??
    new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_REPLICA_URL } },
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    }))
  : prisma; // fallback to primary

// Cache replica instance in development to avoid multiple connections
if (process.env['NODE_ENV'] !== 'production' && process.env.DATABASE_REPLICA_URL) {
  globalForPrisma.prismaReplica = prismaRead;
}

// ─── Connection pool management ─────────────────────────────────────────────

export async function connectAll(): Promise<void> {
  await prisma.$connect();
  console.log('[Prisma] Primary database connected');

  if (prismaRead !== prisma) {
    await prismaRead.$connect();
    console.log('[Prisma] Read replica connected');
  }
}

export async function disconnectAll(): Promise<void> {
  await prisma.$disconnect();
  if (prismaRead !== prisma) {
    await prismaRead.$disconnect();
  }
  console.log('[Prisma] All connections closed');
}

// ─── Health check: measure replication lag ──────────────────────────────────

export async function checkReplicaLag(): Promise<{
  lagMs: number;
  isHealthy: boolean;
  hasReplica: boolean;
}> {
  if (prismaRead === prisma) {
    return { lagMs: 0, isHealthy: true, hasReplica: false };
  }

  try {
    // Query NOW() from both primary and replica and compare timestamps
    const primaryResult: Array<{ ts: Date }> =
      await prisma.$queryRaw`SELECT NOW() as ts`;
    const replicaResult: Array<{ ts: Date }> =
      await prismaRead.$queryRaw`SELECT NOW() as ts`;

    const lagMs = Math.abs(
      new Date(primaryResult[0].ts).getTime() -
      new Date(replicaResult[0].ts).getTime(),
    );

    return {
      lagMs,
      isHealthy: lagMs < 5000, // Healthy if < 5s lag
      hasReplica: true,
    };
  } catch (err) {
    console.error('[Prisma] Replica lag check failed:', err instanceof Error ? err.message : err);
    return { lagMs: -1, isHealthy: false, hasReplica: true };
  }
}

// ─── Query routing helper ───────────────────────────────────────────────────

/**
 * Returns the read replica if it's healthy, otherwise falls back to primary.
 * Use this for heavy read queries (story listings, analytics, search).
 *
 * Usage:
 *   const db = await getReadClient();
 *   const stories = await db.story.findMany({ ... });
 */
let lastReplicaCheck = 0;
let lastReplicaHealthy = true;
const REPLICA_CHECK_INTERVAL_MS = 30_000;

export async function getReadClient(): Promise<PrismaClient> {
  if (prismaRead === prisma) return prisma;

  const now = Date.now();
  if (now - lastReplicaCheck > REPLICA_CHECK_INTERVAL_MS) {
    lastReplicaCheck = now;
    try {
      const { isHealthy } = await checkReplicaLag();
      lastReplicaHealthy = isHealthy;
    } catch {
      lastReplicaHealthy = false;
    }
  }

  return lastReplicaHealthy ? prismaRead : prisma;
}
