// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { createHash } from 'crypto';

export async function featureFlagRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get('/feature-flags', async (request, reply) => {
    const flags = await prisma.featureFlag.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ data: flags });
  });

  app.post('/feature-flags', async (request, reply) => {
    const data = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      defaultValue: z.boolean().default(false),
    }).parse(request.body);
    const flag = await prisma.featureFlag.create({ data });
    return reply.status(201).send({ data: flag });
  });

  app.patch('/feature-flags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      defaultValue: z.boolean().optional(),
      overrides: z.record(z.unknown()).optional(),
    }).parse(request.body);
    const flag = await prisma.featureFlag.update({ where: { id }, data });
    return reply.send({ data: flag });
  });

  // ─── POST /feature-flags/:id/experiment — Create A/B experiment ───────────
  app.post('/feature-flags/:id/experiment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1),
      variants: z.array(z.object({
        name: z.string().min(1),
        weight: z.number().min(0).max(100),
      })).min(2),
      targetPercent: z.number().min(0).max(100),
    }).parse(request.body);

    // Validate weights sum to 100
    const totalWeight = body.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      return reply.status(400).send({ error: 'Variant weights must sum to 100' });
    }

    const flag = await prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) return reply.status(404).send({ error: 'Feature flag not found' });

    const overrides = (flag.overrides || {}) as Record<string, any>;
    const experiment = {
      name: body.name,
      variants: body.variants,
      targetPercent: body.targetPercent,
      createdAt: new Date().toISOString(),
      status: 'active',
      tracking: [],
    };

    const updated = await prisma.featureFlag.update({
      where: { id },
      data: {
        overrides: { ...overrides, experiment },
      },
    });

    return reply.status(201).send({ data: { experiment, flag: updated } });
  });

  // ─── GET /feature-flags/:id/experiment — Get experiment status ────────────
  app.get('/feature-flags/:id/experiment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const flag = await prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) return reply.status(404).send({ error: 'Feature flag not found' });

    const overrides = (flag.overrides || {}) as Record<string, any>;
    const experiment = overrides.experiment;
    if (!experiment) {
      return reply.status(404).send({ error: 'No experiment configured for this flag' });
    }

    // Calculate variant assignment counts from tracking data
    const tracking = experiment.tracking || [];
    const variantCounts: Record<string, number> = {};
    const conversionsByVariant: Record<string, Record<string, number>> = {};

    for (const v of experiment.variants) {
      variantCounts[v.name] = 0;
      conversionsByVariant[v.name] = {};
    }

    const uniqueUsers = new Set<string>();
    for (const t of tracking) {
      uniqueUsers.add(t.userId);
      if (variantCounts[t.variant] !== undefined) {
        variantCounts[t.variant]++;
      }
      if (t.event && conversionsByVariant[t.variant]) {
        conversionsByVariant[t.variant][t.event] =
          (conversionsByVariant[t.variant][t.event] || 0) + 1;
      }
    }

    return reply.send({
      data: {
        name: experiment.name,
        status: experiment.status,
        targetPercent: experiment.targetPercent,
        variants: experiment.variants.map((v: any) => ({
          name: v.name,
          weight: v.weight,
          assignments: variantCounts[v.name] || 0,
          conversions: conversionsByVariant[v.name] || {},
        })),
        totalParticipants: uniqueUsers.size,
        totalEvents: tracking.length,
        createdAt: experiment.createdAt,
      },
    });
  });

  // ─── POST /feature-flags/:id/experiment/track — Track conversion event ────
  app.post('/feature-flags/:id/experiment/track', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      userId: z.string().min(1),
      variant: z.string().min(1),
      event: z.string().min(1),
    }).parse(request.body);

    const flag = await prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) return reply.status(404).send({ error: 'Feature flag not found' });

    const overrides = (flag.overrides || {}) as Record<string, any>;
    const experiment = overrides.experiment;
    if (!experiment) {
      return reply.status(404).send({ error: 'No experiment configured for this flag' });
    }

    // Validate variant exists
    const validVariants = experiment.variants.map((v: any) => v.name);
    if (!validVariants.includes(body.variant)) {
      return reply.status(400).send({ error: `Invalid variant. Must be one of: ${validVariants.join(', ')}` });
    }

    const tracking = experiment.tracking || [];
    tracking.push({
      userId: body.userId,
      variant: body.variant,
      event: body.event,
      timestamp: new Date().toISOString(),
    });

    await prisma.featureFlag.update({
      where: { id },
      data: {
        overrides: { ...overrides, experiment: { ...experiment, tracking } },
      },
    });

    return reply.send({ success: true, tracked: body });
  });

  // ─── GET /feature-flags/evaluate/:userId — Evaluate all flags for a user ──
  app.get('/feature-flags/evaluate/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const flags = await prisma.featureFlag.findMany();

    const result: Record<string, { enabled: boolean; variant?: string }> = {};

    for (const flag of flags) {
      const overrides = (flag.overrides || {}) as Record<string, any>;

      // Check user-level overrides first
      if (overrides.users && overrides.users[userId] !== undefined) {
        result[flag.name] = { enabled: !!overrides.users[userId] };
        continue;
      }

      // Check account-level overrides (skip for now, we don't have accountId in params)

      const experiment = overrides.experiment;
      if (experiment && experiment.status === 'active') {
        // Consistent hashing for deterministic assignment
        const hash = consistentHash(userId, flag.id);

        // Is user in the target percentage?
        if (hash < experiment.targetPercent) {
          // Assign to a variant based on weights
          const variantHash = consistentHash(userId, flag.id + ':variant');
          let cumulative = 0;
          let assignedVariant = experiment.variants[0]?.name || 'control';

          for (const v of experiment.variants) {
            cumulative += v.weight;
            if (variantHash < cumulative) {
              assignedVariant = v.name;
              break;
            }
          }

          result[flag.name] = { enabled: true, variant: assignedVariant };
        } else {
          result[flag.name] = { enabled: flag.defaultValue };
        }
      } else {
        result[flag.name] = { enabled: flag.defaultValue };
      }
    }

    return reply.send({ data: result });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Consistent hash: returns a number 0-99 for deterministic user bucketing.
 * hash(userId + salt) % 100 ensures the same user always gets the same bucket.
 */
function consistentHash(userId: string, salt: string): number {
  const hash = createHash('sha256').update(userId + salt).digest();
  // Use first 4 bytes as a uint32, then mod 100
  const num = hash.readUInt32BE(0);
  return num % 100;
}
