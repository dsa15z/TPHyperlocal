import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { prisma } from '../lib/prisma.js';

// Paths that skip authentication
const PUBLIC_PATHS = [
  '/api/v1/health',
  '/docs',
  '/docs/',
  '/docs/json',
  '/docs/yaml',
  '/docs/static/',
];

function isPublicPath(url: string): boolean {
  // Health endpoint
  if (url.startsWith('/api/v1/health')) return true;

  // Swagger docs
  if (url.startsWith('/docs')) return true;

  // Auth endpoints are public
  if (url.startsWith('/api/v1/auth')) return true;

  // RSS feed endpoints are public
  if (url.match(/^\/api\/v1\/feeds\/[^/]+\/rss/)) return true;

  // Stories, search, feeds, pipeline, analytics are public (read-only)
  if (url.startsWith('/api/v1/stories')) return true;
  if (url.startsWith('/api/v1/search')) return true;
  if (url.startsWith('/api/v1/feeds')) return true;
  if (url.startsWith('/api/v1/pipeline')) return true;
  if (url.startsWith('/api/v1/analytics')) return true;
  if (url.startsWith('/api/v1/stocks')) return true;
  if (url.startsWith('/api/v1/public-data')) return true;

  return false;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: {
      id: string;
      name: string;
      ownerId: string;
      permissions: unknown;
      rateLimit: number;
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const url = request.url.split('?')[0] ?? '';

  // Skip auth for public paths
  if (isPublicPath(url)) {
    return;
  }

  const apiKeyHeader = request.headers['x-api-key'];

  // If no API key but a Bearer token is present, skip this middleware
  // and let the JWT middleware handle authentication instead
  if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return; // Let JWT middleware handle it
    }
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing x-api-key header or Authorization Bearer token',
    });
    return;
  }

  try {
    const apiKey = await prisma.aPIKey.findUnique({
      where: { key: apiKeyHeader },
    });

    if (!apiKey) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    if (!apiKey.isActive) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'API key has been deactivated',
      });
      return;
    }

    // Attach key info to request
    request.apiKey = {
      id: apiKey.id,
      name: apiKey.name,
      ownerId: apiKey.ownerId,
      permissions: apiKey.permissions,
      rateLimit: apiKey.rateLimit,
    };

    // Update last used timestamp (fire and forget)
    prisma.aPIKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {
        // Swallow errors from the background update
      });
  } catch (err) {
    request.log.error(err, 'Auth middleware error');
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate API key',
    });
    return;
  }
}
