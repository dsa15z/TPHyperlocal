import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { accountRoutes } from './accounts.js';
import { marketRoutes } from './markets.js';
import { sourceRoutes } from './sources.js';
import { credentialRoutes } from './credentials.js';

/**
 * Admin route aggregator.
 *
 * Registers all admin sub-route plugins under the /admin prefix.
 * Expects to be registered in the app with prefix '/admin', e.g.:
 *
 *   app.register(adminRoutes, { prefix: '/admin' });
 *
 * This yields:
 *   - /admin/account, /admin/account/users, etc.  (OWNER only)
 *   - /admin/markets, /admin/markets/:id, etc.    (ADMIN+)
 *   - /admin/sources, /admin/sources/:id, etc.    (ADMIN+)
 *   - /admin/credentials, /admin/credentials/:id, etc. (ADMIN+)
 */
export async function adminRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // Account management (OWNER only)
  app.register(accountRoutes);

  // Market management (ADMIN+)
  app.register(marketRoutes);

  // Source management (ADMIN+)
  app.register(sourceRoutes);

  // Credential management (ADMIN+)
  app.register(credentialRoutes);
}
