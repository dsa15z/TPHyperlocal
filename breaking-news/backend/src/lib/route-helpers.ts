import { verifyToken, type TokenPayload } from './auth.js';

/**
 * Extract JWT payload from Authorization header.
 * Returns null if not authenticated.
 */
export function getPayload(request: any): (TokenPayload & { accountId?: string }) | null {
  const auth = request.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyToken(auth.slice(7)); } catch { return null; }
}

/**
 * Get user ID from JWT. Returns null if not authenticated.
 */
export function getUserId(request: any): string | null {
  const payload = getPayload(request);
  return payload?.userId || null;
}

/**
 * Require authentication. Sends 401 if not authenticated.
 * Returns the payload if authenticated.
 */
export function requireAuth(request: any, reply: any): TokenPayload | null {
  const payload = getPayload(request);
  if (!payload?.accountId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  return payload;
}

/**
 * Require admin role. Sends 403 if not ADMIN or OWNER.
 */
export function requireAdmin(request: any, reply: any): boolean {
  const au = request.accountUser;
  if (!au || !['ADMIN', 'OWNER'].includes(au.role)) {
    reply.status(403).send({ error: 'Admin access required' });
    return false;
  }
  return true;
}
