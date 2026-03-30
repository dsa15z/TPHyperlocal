import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

import { storiesRoutes } from './routes/stories.js';
import { searchRoutes } from './routes/search.js';
import { feedsRoutes } from './routes/feeds.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin/index.js';
import { pipelineRoutes } from './routes/pipeline.js';
import { userRoutes } from './routes/user.js';
import { firstDraftRoutes } from './routes/first-draft.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { showPrepRoutes } from './routes/show-prep.js';
import { pulseRoutes } from './routes/pulses.js';
import { annotationRoutes } from './routes/annotations.js';
import { analyticsRoutes } from './routes/analytics.js';
import { notificationRoutes } from './routes/notifications.js';
import { registerSSERoutes } from './lib/sse.js';
import { predictionRoutes } from './routes/predictions.js';
import { topicClusterRoutes } from './routes/topic-clusters.js';
import { stateTransitionRoutes } from './routes/state-transitions.js';
import { radioGPTRoutes } from './routes/radio-gpt.js';
import { stockRoutes } from './routes/stocks.js';
import { collaborativeRoutes } from './routes/collaborative.js';
import { factCheckRoutes } from './routes/fact-check.js';
import { translationRoutes } from './routes/translations.js';
import { assignmentDeskRoutes } from './routes/assignment-desk.js';
import { breakingPackageRoutes } from './routes/breaking-package.js';
import { authMiddleware } from './middleware/auth.js';
import { jwtAuthMiddleware } from './middleware/jwt-auth.js';
import { prisma } from './lib/prisma.js';

dotenv.config();

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: {
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
  });

  // CORS
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN']?.split(',') ?? ['*'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return (
        (request.headers['x-api-key'] as string) ??
        request.ip
      );
    },
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Breaking News Intelligence API',
        description: 'API for the Breaking News Intelligence Platform',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${PORT}`,
          description: 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Auth middleware — supports both API key (x-api-key) and JWT (Bearer token)
  // API key auth for third-party API consumers
  app.addHook('onRequest', authMiddleware);
  // JWT auth for frontend users
  app.addHook('onRequest', jwtAuthMiddleware);

  // Register routes
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(storiesRoutes, { prefix: '/api/v1' });
  await app.register(searchRoutes, { prefix: '/api/v1' });
  await app.register(feedsRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(pipelineRoutes, { prefix: '/api/v1' });
  await app.register(userRoutes, { prefix: '/api/v1' });
  await app.register(firstDraftRoutes, { prefix: '/api/v1' });
  await app.register(bookmarkRoutes, { prefix: '/api/v1' });
  await app.register(showPrepRoutes, { prefix: '/api/v1' });
  await app.register(pulseRoutes, { prefix: '/api/v1' });
  await app.register(annotationRoutes, { prefix: '/api/v1' });
  await app.register(analyticsRoutes, { prefix: '/api/v1' });
  await app.register(notificationRoutes, { prefix: '/api/v1' });
  await app.register(predictionRoutes, { prefix: '/api/v1' });
  await app.register(topicClusterRoutes, { prefix: '/api/v1' });
  await app.register(stateTransitionRoutes, { prefix: '/api/v1' });
  await app.register(radioGPTRoutes, { prefix: '/api/v1' });
  await app.register(stockRoutes, { prefix: '/api/v1' });
  await app.register(collaborativeRoutes, { prefix: '/api/v1' });
  await app.register(factCheckRoutes, { prefix: '/api/v1' });
  await app.register(translationRoutes, { prefix: '/api/v1' });
  await app.register(assignmentDeskRoutes, { prefix: '/api/v1' });
  await app.register(breakingPackageRoutes, { prefix: '/api/v1' });
  registerSSERoutes(app);

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  return app;
}

async function main() {
  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);
    app.log.info(`Swagger docs available at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
