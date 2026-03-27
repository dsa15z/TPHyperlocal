import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const platformEnum = z.enum([
  'FACEBOOK', 'TWITTER', 'RSS', 'NEWSAPI', 'GDELT',
  'LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI', 'MANUAL',
]);

const createCredentialSchema = z.object({
  platform: platformEnum,
  name: z.string().min(1).max(255),
  apiKey: z.string().max(2048).optional(),
  apiSecret: z.string().max(2048).optional(),
  accessToken: z.string().max(4096).optional(),
  extraConfig: z.record(z.unknown()).optional(),
});

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  apiKey: z.string().max(2048).optional().nullable(),
  apiSecret: z.string().max(2048).optional().nullable(),
  accessToken: z.string().max(4096).optional().nullable(),
  extraConfig: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    const err = new Error('Forbidden: ADMIN role or higher required');
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Mask a sensitive string, showing only the first 3 and last 6 characters.
 * Returns null if the input is null/undefined.
 */
function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) {
    return value.slice(0, 3) + '...' + value.slice(-3);
  }
  return value.slice(0, 3) + '...' + value.slice(-6);
}

/**
 * Sanitize a credential record for API responses.
 * NEVER return raw apiKey, apiSecret, or accessToken values.
 */
function sanitizeCredential(cred: {
  id: string;
  accountId: string;
  platform: string;
  name: string;
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
  extraConfig: any;
  isActive: boolean;
  lastUsedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: cred.id,
    accountId: cred.accountId,
    platform: cred.platform,
    name: cred.name,
    apiKey: maskSecret(cred.apiKey),
    apiSecret: maskSecret(cred.apiSecret),
    accessToken: maskSecret(cred.accessToken),
    extraConfig: cred.extraConfig,
    isActive: cred.isActive,
    lastUsedAt: cred.lastUsedAt,
    lastError: cred.lastError,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  };
}

// ─── Platform test helpers ───────────────────────────────────────────────────

interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

async function testNewsApi(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?country=us&pageSize=1`,
      { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(10000) },
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, message: 'NewsAPI connection successful', latencyMs };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: (body as any).message ?? `HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Connection failed', latencyMs: Date.now() - start };
  }
}

async function testOpenAI(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, message: 'OpenAI connection successful', latencyMs };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: (body as any).error?.message ?? `HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Connection failed', latencyMs: Date.now() - start };
  }
}

async function testClaude(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, message: 'Claude connection successful', latencyMs };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: (body as any).error?.message ?? `HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Connection failed', latencyMs: Date.now() - start };
  }
}

async function testGrok(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, message: 'Grok connection successful', latencyMs };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: (body as any).error?.message ?? `HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Connection failed', latencyMs: Date.now() - start };
  }
}

async function testGemini(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, message: 'Gemini connection successful', latencyMs };
    }
    const body = await res.json().catch(() => ({}));
    return { success: false, message: (body as any).error?.message ?? `HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Connection failed', latencyMs: Date.now() - start };
  }
}

async function testCredentialByPlatform(
  platform: string,
  credential: { apiKey: string | null; apiSecret: string | null; accessToken: string | null },
): Promise<TestResult> {
  switch (platform) {
    case 'NEWSAPI': {
      if (!credential.apiKey) return { success: false, message: 'No API key configured' };
      return testNewsApi(credential.apiKey);
    }
    case 'LLM_OPENAI': {
      const key = credential.apiKey ?? credential.accessToken;
      if (!key) return { success: false, message: 'No API key or access token configured' };
      return testOpenAI(key);
    }
    case 'LLM_CLAUDE': {
      const key = credential.apiKey ?? credential.accessToken;
      if (!key) return { success: false, message: 'No API key or access token configured' };
      return testClaude(key);
    }
    case 'LLM_GROK': {
      const key = credential.apiKey ?? credential.accessToken;
      if (!key) return { success: false, message: 'No API key or access token configured' };
      return testGrok(key);
    }
    case 'LLM_GEMINI': {
      const key = credential.apiKey ?? credential.accessToken;
      if (!key) return { success: false, message: 'No API key or access token configured' };
      return testGemini(key);
    }
    default:
      return { success: true, message: `No automated test available for platform ${platform}. Marked as untested.` };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function credentialRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /admin/credentials — list credentials for account (masked)
  app.get('/credentials', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Validation error', details: query.error.flatten() });
    }
    const { limit, offset } = query.data;

    const [credentials, total] = await Promise.all([
      prisma.accountCredential.findMany({
        where: { accountId: au.accountId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.accountCredential.count({ where: { accountId: au.accountId } }),
    ]);

    return reply.status(200).send({
      data: credentials.map(sanitizeCredential),
      total,
      limit,
      offset,
    });
  });

  // POST /admin/credentials — create credential
  app.post('/credentials', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const parsed = createCredentialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const data = parsed.data;

    const credential = await prisma.accountCredential.create({
      data: {
        accountId: au.accountId,
        platform: data.platform as any,
        name: data.name,
        apiKey: data.apiKey ?? null,
        apiSecret: data.apiSecret ?? null,
        accessToken: data.accessToken ?? null,
        extraConfig: data.extraConfig ?? undefined,
      },
    });

    return reply.status(201).send(sanitizeCredential(credential));
  });

  // PATCH /admin/credentials/:id — update credential
  app.patch('/credentials/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const parsed = updateCredentialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.flatten() });
    }

    // Verify credential belongs to account
    const existing = await prisma.accountCredential.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Credential not found' });
    }

    const credential = await prisma.accountCredential.update({
      where: { id },
      data: parsed.data,
    });

    return reply.status(200).send(sanitizeCredential(credential));
  });

  // DELETE /admin/credentials/:id — delete credential
  app.delete('/credentials/:id', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const existing = await prisma.accountCredential.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Credential not found' });
    }

    await prisma.accountCredential.delete({ where: { id } });

    return reply.status(200).send({ message: 'Credential deleted' });
  });

  // POST /admin/credentials/:id/test — test if credential is valid
  app.post('/credentials/:id/test', async (request, reply) => {
    const au = request.accountUser;
    if (!au) return reply.status(401).send({ error: 'Unauthorized' });
    requireAdmin(au.role);

    const { id } = request.params as { id: string };

    const credential = await prisma.accountCredential.findFirst({
      where: { id, accountId: au.accountId },
    });
    if (!credential) {
      return reply.status(404).send({ error: 'Credential not found' });
    }

    const result = await testCredentialByPlatform(credential.platform, {
      apiKey: credential.apiKey,
      apiSecret: credential.apiSecret,
      accessToken: credential.accessToken,
    });

    // Update last used and last error
    await prisma.accountCredential.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        lastError: result.success ? null : result.message,
      },
    }).catch(() => {
      // Swallow errors from background update
    });

    return reply.status(200).send({
      credentialId: id,
      platform: credential.platform,
      name: credential.name,
      ...result,
    });
  });
}
