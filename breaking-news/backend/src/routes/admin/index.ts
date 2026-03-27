import { FastifyInstance } from 'fastify';
import { accountsRoutes } from './accounts.js';
import { marketsRoutes } from './markets.js';
import { sourcesRoutes } from './sources.js';
import { credentialsRoutes } from './credentials.js';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(accountsRoutes);
  await app.register(marketsRoutes);
  await app.register(sourcesRoutes);
  await app.register(credentialsRoutes);
}
