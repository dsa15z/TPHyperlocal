import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { accountRoutes } from './accounts.js';
import { marketRoutes } from './markets.js';
import { sourceRoutes } from './sources.js';
import { credentialRoutes } from './credentials.js';
import { editorRoutes } from './editor.js';
import { webhookRoutes } from './webhooks.js';
import { coverageRoutes } from './coverage.js';
import { voiceRoutes } from './voices.js';
import { featureFlagRoutes } from './feature-flags.js';
import { widgetRoutes } from './widgets.js';
import { promptRoutes } from './prompts.js';
import { dashboardLayoutRoutes } from './dashboards.js';

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

  // Editor workflow (EDITOR+)
  app.register(editorRoutes);

  // Webhooks & digests (ADMIN+)
  app.register(webhookRoutes);

  // Coverage gap detection (ADMIN+)
  app.register(coverageRoutes);

  // Voice management (ADMIN+)
  app.register(voiceRoutes);

  // Feature flags (ADMIN+)
  app.register(featureFlagRoutes);

  // Embeddable widgets (ADMIN+)
  app.register(widgetRoutes);

  // Prompt management (ADMIN+)
  app.register(promptRoutes);

  // Dashboard layouts (ADMIN+)
  app.register(dashboardLayoutRoutes);
}
