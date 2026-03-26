import IORedis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const REDIS_MAX_RETRIES = parseInt(process.env['REDIS_MAX_RETRIES'] || '10', 10);

export function createRedisConnection(): IORedis {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > REDIS_MAX_RETRIES) {
        return null;
      }
      return Math.min(times * 200, 5000);
    },
  });

  connection.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  connection.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  return connection;
}

// Shared connection for BullMQ workers
let sharedConnection: IORedis | null = null;

export function getSharedConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
