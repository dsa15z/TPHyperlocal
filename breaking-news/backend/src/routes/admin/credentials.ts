import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '...' + value.substring(value.length - 4);
}

function getAccountId(request: FastifyRequest): string {
  const accountUser = (request as any).accountUser;
  if (!accountUser?.accountId) {
    throw new Error('No account context');
  }
  return accountUser.accountId;
}

function assertRole(request: FastifyRequest, roles: string[]): void {
  const accountUser = (request as any).accountUser;
  if (!accountUser || !roles.includes(accountUser.role)) {
    throw { statusCode: 403, message: 'Insufficient permissions' };
  }
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const CreateCredentialSchema = z.object({
  platform: z.enum([
    'FACEBOOK', 'TWITTER', 'NEWSAPI', 'GDELT',
    'LLM_OPENAI', 'LLM_CLAUDE', 'LLM_GROK', 'LLM_GEMINI',
  ]),
  name: z.string().min(1).max(255),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  extraConfig: z.record(z.unknown()).optional(),
});

const UpdateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  extraConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function credentialsRoutes(app: FastifyInstance) {

  // List credentials (masked)
  app.get('/admin/credentials', async (request: FastifyRequest, reply: FastifyReply) => {
    assertRole(request, ['ADMIN', 'OWNER']);
    const accountId = getAccountId(request);

    const credentials = await prisma.accountCredential.findMany({
      where: { accountId },
      orderBy: { platform: 'asc' },
    });

    const masked = credentials.map((c) => ({
      id: c.id,
      platform: c.platform,
      name: c.name,
      apiKey: maskSecret(c.apiKey),
      apiSecret: maskSecret(c.apiSecret),
      accessToken: maskSecret(c.accessToken),
      extraConfig: c.extraConfig,
      isActive: c.isActive,
      lastUsedAt: c.lastUsedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return { data: masked };
  });

  // Create credential
  app.post('/admin/credentials', async (request: FastifyRequest, reply: FastifyReply) => {
    assertRole(request, ['ADMIN', 'OWNER']);
    const accountId = getAccountId(request);

    const body = CreateCredentialSchema.parse(request.body);

    // Check for duplicate platform+name
    const existing = await prisma.accountCredential.findUnique({
      where: {
        accountId_platform_name: {
          accountId,
          platform: body.platform as any,
          name: body.name,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `Credential "${body.name}" already exists for ${body.platform}`,
      });
    }

    const credential = await prisma.accountCredential.create({
      data: {
        accountId,
        platform: body.platform as any,
        name: body.name,
        apiKey: body.apiKey || null,
        apiSecret: body.apiSecret || null,
        accessToken: body.accessToken || null,
        extraConfig: body.extraConfig || null,
      },
    });

    return reply.status(201).send({
      data: {
        id: credential.id,
        platform: credential.platform,
        name: credential.name,
        apiKey: maskSecret(credential.apiKey),
        apiSecret: maskSecret(credential.apiSecret),
        accessToken: maskSecret(credential.accessToken),
        isActive: credential.isActive,
        createdAt: credential.createdAt,
      },
    });
  });

  // Update credential
  app.patch('/admin/credentials/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertRole(request, ['ADMIN', 'OWNER']);
    const accountId = getAccountId(request);
    const { id } = request.params;

    const body = UpdateCredentialSchema.parse(request.body);

    const existing = await prisma.accountCredential.findFirst({
      where: { id, accountId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Credential not found' });
    }

    const updated = await prisma.accountCredential.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.apiKey !== undefined && { apiKey: body.apiKey }),
        ...(body.apiSecret !== undefined && { apiSecret: body.apiSecret }),
        ...(body.accessToken !== undefined && { accessToken: body.accessToken }),
        ...(body.extraConfig !== undefined && { extraConfig: body.extraConfig }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        lastError: null, // Clear error on update
      },
    });

    return {
      data: {
        id: updated.id,
        platform: updated.platform,
        name: updated.name,
        apiKey: maskSecret(updated.apiKey),
        apiSecret: maskSecret(updated.apiSecret),
        accessToken: maskSecret(updated.accessToken),
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
    };
  });

  // Delete credential
  app.delete('/admin/credentials/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertRole(request, ['ADMIN', 'OWNER']);
    const accountId = getAccountId(request);
    const { id } = request.params;

    const existing = await prisma.accountCredential.findFirst({
      where: { id, accountId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Credential not found' });
    }

    await prisma.accountCredential.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Test credential
  app.post('/admin/credentials/:id/test', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    assertRole(request, ['ADMIN', 'OWNER']);
    const accountId = getAccountId(request);
    const { id } = request.params;

    const credential = await prisma.accountCredential.findFirst({
      where: { id, accountId },
    });

    if (!credential) {
      return reply.status(404).send({ error: 'Not Found', message: 'Credential not found' });
    }

    let testResult: { success: boolean; message: string; latencyMs: number };
    const start = Date.now();

    try {
      switch (credential.platform) {
        case 'NEWSAPI': {
          const resp = await fetch(
            `https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${credential.apiKey}`,
            { signal: AbortSignal.timeout(10000) }
          );
          testResult = {
            success: resp.ok,
            message: resp.ok ? 'NewsAPI connection successful' : `HTTP ${resp.status}`,
            latencyMs: Date.now() - start,
          };
          break;
        }
        case 'LLM_OPENAI': {
          const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${credential.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          testResult = {
            success: resp.ok,
            message: resp.ok ? 'OpenAI connection successful' : `HTTP ${resp.status}`,
            latencyMs: Date.now() - start,
          };
          break;
        }
        case 'LLM_CLAUDE': {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': credential.apiKey || '',
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'ping' }],
            }),
            signal: AbortSignal.timeout(15000),
          });
          testResult = {
            success: resp.ok,
            message: resp.ok ? 'Claude connection successful' : `HTTP ${resp.status}`,
            latencyMs: Date.now() - start,
          };
          break;
        }
        case 'LLM_GROK': {
          const resp = await fetch('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${credential.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          testResult = {
            success: resp.ok,
            message: resp.ok ? 'Grok connection successful' : `HTTP ${resp.status}`,
            latencyMs: Date.now() - start,
          };
          break;
        }
        case 'LLM_GEMINI': {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${credential.apiKey}`,
            { signal: AbortSignal.timeout(10000) }
          );
          testResult = {
            success: resp.ok,
            message: resp.ok ? 'Gemini connection successful' : `HTTP ${resp.status}`,
            latencyMs: Date.now() - start,
          };
          break;
        }
        default:
          testResult = {
            success: true,
            message: `No test available for ${credential.platform}`,
            latencyMs: 0,
          };
      }
    } catch (err) {
      testResult = {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        latencyMs: Date.now() - start,
      };
    }

    // Update credential with test result
    await prisma.accountCredential.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        lastError: testResult.success ? null : testResult.message,
      },
    });

    return { data: testResult };
  });
}
