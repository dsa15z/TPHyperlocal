// @ts-nocheck
import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, TokenPayload } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

// ─── Augment FastifyRequest ─────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
      isActive: boolean;
    };
    accountUser?: {
      id: string;
      accountId: string;
      userId: string;
      role: string;
      isActive: boolean;
    };
    tokenPayload?: TokenPayload;
  }
}

// ─── Public Path Detection ──────────────────────────────────────────────────

function isPublicPath(url: string): boolean {
  // Health endpoint
  if (url.startsWith('/api/v1/health')) return true;

  // Swagger docs
  if (url.startsWith('/docs')) return true;

  // RSS feed endpoints are public
  if (url.match(/^\/api\/v1\/feeds\/[^/]+\/rss/)) return true;

  // Auth endpoints are public
  if (url.startsWith('/api/v1/auth')) return true;

  // Stories, search, feeds, pipeline status are public (read-only)
  if (url.startsWith('/api/v1/stories')) return true;
  if (url.startsWith('/api/v1/search')) return true;
  if (url.startsWith('/api/v1/feeds')) return true;
  if (url.startsWith('/api/v1/pipeline/status')) return true;

  return false;
}

// ─── JWT Auth Middleware ────────────────────────────────────────────────────

/**
 * Fastify onRequest hook that extracts and verifies a Bearer JWT token,
 * looks up the user in the database, and optionally resolves account membership.
 */
export async function jwtAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const url = request.url.split('?')[0] ?? '';

  // Skip auth for public paths
  if (isPublicPath(url)) {
    return;
  }

  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }

  // Look up user in DB
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found or deactivated',
      });
      return;
    }

    request.user = user;
    request.tokenPayload = payload;

    // If token contains an accountId, look up the account membership
    if (payload.accountId) {
      const accountUser = await prisma.accountUser.findUnique({
        where: {
          accountId_userId: {
            accountId: payload.accountId,
            userId: payload.userId,
          },
        },
        select: {
          id: true,
          accountId: true,
          userId: true,
          role: true,
          isActive: true,
        },
      });

      if (accountUser && accountUser.isActive) {
        request.accountUser = accountUser;
      }
    }
  } catch (err) {
    request.log.error(err, 'JWT auth middleware error');
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to authenticate user',
    });
    return;
  }
}

// ─── Role Guard ─────────────────────────────────────────────────────────────

type UserRole = 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';

/**
 * Returns a Fastify preHandler that checks whether the authenticated user
 * has one of the specified roles for the current account.
 *
 * Usage:
 *   app.get('/admin-only', { preHandler: requireRole(['ADMIN', 'OWNER']) }, handler)
 */
export function requireRole(roles: UserRole[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!request.accountUser) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'No active account membership',
      });
      return;
    }

    if (!roles.includes(request.accountUser.role as UserRole)) {
      reply.status(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required role: ${roles.join(' or ')}`,
      });
      return;
    }
  };
}
