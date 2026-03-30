// @ts-nocheck
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { verifyToken, TokenPayload } from '../../lib/auth.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const PERMISSION_MODULES = [
  'stories', 'sources', 'markets', 'assignments', 'reporters', 'analytics',
  'show_prep', 'lineup', 'deadlines', 'predictions', 'beat_alerts',
  'publish_queue', 'video', 'coverage', 'community_radar', 'widgets',
  'feature_flags', 'webhooks', 'digests', 'audit_logs', 'team', 'settings',
] as const;

type PermissionModule = typeof PERMISSION_MODULES[number];

interface ModulePermission {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

type RolePermissions = Record<string, Record<string, ModulePermission>>;

// ─── Default Permissions ────────────────────────────────────────────────────

function fullAccess(): ModulePermission {
  return { read: true, create: true, update: true, delete: true };
}

function readOnly(): ModulePermission {
  return { read: true, create: false, update: false, delete: false };
}

function readCreateUpdate(): ModulePermission {
  return { read: true, create: true, update: true, delete: false };
}

function noAccess(): ModulePermission {
  return { read: false, create: false, update: false, delete: false };
}

const EDITOR_FULL_MODULES = ['stories', 'sources', 'assignments', 'show_prep', 'lineup', 'deadlines'];
const EDITOR_READ_MODULES = ['markets', 'reporters', 'analytics', 'predictions', 'beat_alerts',
  'publish_queue', 'video', 'coverage', 'community_radar', 'widgets', 'digests'];

function getDefaultPermissions(): RolePermissions {
  const adminPerms: Record<string, ModulePermission> = {};
  const editorPerms: Record<string, ModulePermission> = {};
  const viewerPerms: Record<string, ModulePermission> = {};

  for (const mod of PERMISSION_MODULES) {
    adminPerms[mod] = fullAccess();
    if (EDITOR_FULL_MODULES.includes(mod)) {
      editorPerms[mod] = readCreateUpdate();
    } else if (EDITOR_READ_MODULES.includes(mod)) {
      editorPerms[mod] = readOnly();
    } else {
      editorPerms[mod] = noAccess();
    }
    viewerPerms[mod] = readOnly();
  }

  return {
    OWNER: adminPerms,
    ADMIN: adminPerms,
    EDITOR: editorPerms,
    VIEWER: viewerPerms,
  };
}

function getDefaultRoleNames(): Record<string, string> {
  return {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    EDITOR: 'Editor',
    VIEWER: 'Viewer',
  };
}

function getDefaultMetadata() {
  return {
    permissions: getDefaultPermissions(),
    roleNames: getDefaultRoleNames(),
  };
}

// ─── Auth Helpers ───────────────────────────────────────────────────────────

function extractToken(request: any): TokenPayload | null {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return verifyToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { metadata: true },
  });
  if (!user) return false;
  const meta = user.metadata as Record<string, unknown> | null;
  return meta?.isSuperAdmin === true;
}

async function requireAuth(request: any, reply: any): Promise<TokenPayload | null> {
  const payload = extractToken(request);
  if (!payload) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
    return null;
  }
  return payload;
}

async function requireSuperAdmin(request: any, reply: any): Promise<TokenPayload | null> {
  const payload = await requireAuth(request, reply);
  if (!payload) return null;
  const superAdmin = await isSuperAdmin(payload.userId);
  if (!superAdmin) {
    reply.status(403).send({ error: 'Forbidden', message: 'Superadmin access required' });
    return null;
  }
  return payload;
}

async function requireAccountAdmin(request: any, reply: any): Promise<TokenPayload | null> {
  const payload = await requireAuth(request, reply);
  if (!payload) return null;
  if (!payload.accountId) {
    reply.status(403).send({ error: 'Forbidden', message: 'No active account context' });
    return null;
  }
  // Superadmins can act as admin on any account
  if (await isSuperAdmin(payload.userId)) return payload;
  if (payload.role !== 'ADMIN' && payload.role !== 'OWNER') {
    reply.status(403).send({ error: 'Forbidden', message: 'Admin or Owner role required' });
    return null;
  }
  return payload;
}

async function createAuditEntry(
  accountId: string | null,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await prisma.auditLog.create({
    data: {
      accountId: accountId || undefined,
      userId,
      action,
      entityType,
      entityId,
      details,
    },
  });
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  maxMarkets: z.number().int().min(1).max(100).optional(),
  maxSources: z.number().int().min(1).max(10000).optional(),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  maxMarkets: z.number().int().min(1).max(100).optional(),
  maxSources: z.number().int().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
});

const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']),
});

const ChangeRoleSchema = z.object({
  role: z.enum(['VIEWER', 'EDITOR', 'ADMIN', 'OWNER']),
});

const ModulePermissionSchema = z.object({
  read: z.boolean(),
  create: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
});

const PermissionsUpdateSchema = z.object({
  permissions: z.record(
    z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
    z.record(z.string(), ModulePermissionSchema),
  ),
});

const RoleNamesUpdateSchema = z.object({
  roleNames: z.record(z.string(), z.string().min(1).max(50)),
});

const SignupConfigSchema = z.object({
  allowSelfSignup: z.boolean(),
  defaultRole: z.enum(['VIEWER', 'EDITOR']).default('VIEWER'),
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Slug Helper ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  const existing = await prisma.account.findUnique({ where: { slug } });
  if (existing) {
    const suffix = Math.random().toString(36).slice(2, 8);
    slug = `${slug}-${suffix}`;
  }
  return slug;
}

// ─── Get permissions from account metadata ──────────────────────────────────

function getAccountPermissions(account: any): RolePermissions {
  const meta = account.metadata as Record<string, unknown> | null;
  if (meta?.permissions) return meta.permissions as RolePermissions;
  return getDefaultPermissions();
}

function getAccountRoleNames(account: any): Record<string, string> {
  const meta = account.metadata as Record<string, unknown> | null;
  if (meta?.roleNames) return meta.roleNames as Record<string, string>;
  return getDefaultRoleNames();
}

// ─── RBAC Routes Plugin ─────────────────────────────────────────────────────

export async function rbacRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERADMIN ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/rbac/tenants — List all accounts with user counts
  app.get('/rbac/tenants', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const query = PaginationSchema.safeParse(request.query);
    const { limit, offset } = query.success ? query.data : { limit: 50, offset: 0 };

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true } },
        },
      }),
      prisma.account.count(),
    ]);

    return reply.send({
      data: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        plan: a.plan,
        isActive: a.isActive,
        maxMarkets: a.maxMarkets,
        maxSources: a.maxSources,
        userCount: a._count.users,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      pagination: { total, limit, offset },
    });
  });

  // POST /admin/rbac/tenants — Create a new tenant account
  app.post('/rbac/tenants', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const parseResult = CreateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const { name, plan, maxMarkets, maxSources } = parseResult.data;
    const slug = await uniqueSlug(name);
    const defaults = getDefaultMetadata();

    const account = await prisma.account.create({
      data: {
        name,
        slug,
        plan,
        maxMarkets: maxMarkets ?? (plan === 'enterprise' ? 50 : plan === 'pro' ? 10 : 1),
        maxSources: maxSources ?? (plan === 'enterprise' ? 5000 : plan === 'pro' ? 500 : 50),
        metadata: defaults,
      },
    });

    await createAuditEntry(account.id, payload.userId, 'tenant.created', 'Account', account.id, { name, plan });

    return reply.status(201).send({
      data: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        plan: account.plan,
        isActive: account.isActive,
        maxMarkets: account.maxMarkets,
        maxSources: account.maxSources,
        createdAt: account.createdAt,
      },
    });
  });

  // PATCH /admin/rbac/tenants/:id — Update tenant
  app.patch('/rbac/tenants/:id', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id } = request.params as { id: string };
    const parseResult = UpdateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: 'Tenant not found' });

    const updated = await prisma.account.update({
      where: { id },
      data: parseResult.data,
    });

    await createAuditEntry(id, payload.userId, 'tenant.updated', 'Account', id, parseResult.data);

    return reply.send({ data: updated });
  });

  // POST /admin/rbac/tenants/:id/invite — Invite a user to a tenant
  app.post('/rbac/tenants/:id/invite', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id } = request.params as { id: string };
    const parseResult = InviteUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const { email, role } = parseResult.data;

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: 'Tenant not found' });

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Create a placeholder user — they'll set password on first login
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: '', // Will need to set via password reset flow
          displayName: email.split('@')[0],
        },
      });
    }

    // Check if already a member
    const existing = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: id, userId: user.id } },
    });

    if (existing) {
      if (!existing.isActive) {
        // Reactivate
        await prisma.accountUser.update({
          where: { id: existing.id },
          data: { isActive: true, role },
        });
        await createAuditEntry(id, payload.userId, 'user.reactivated', 'AccountUser', existing.id, { email, role });
        return reply.send({ message: 'User reactivated with new role', userId: user.id });
      }
      return reply.status(409).send({ error: 'User is already a member of this tenant' });
    }

    const membership = await prisma.accountUser.create({
      data: {
        accountId: id,
        userId: user.id,
        role,
      },
    });

    await createAuditEntry(id, payload.userId, 'user.invited', 'AccountUser', membership.id, { email, role });

    return reply.status(201).send({ message: 'User invited', userId: user.id, role });
  });

  // GET /admin/rbac/tenants/:id/users — List users in a tenant
  app.get('/rbac/tenants/:id/users', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id } = request.params as { id: string };

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: 'Tenant not found' });

    const memberships = await prisma.accountUser.findMany({
      where: { accountId: id },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true, isActive: true, lastLoginAt: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      data: memberships.map((m) => ({
        id: m.id,
        userId: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        isActive: m.isActive,
        userActive: m.user.isActive,
        lastLoginAt: m.user.lastLoginAt,
        joinedAt: m.createdAt,
      })),
    });
  });

  // PATCH /admin/rbac/tenants/:id/users/:userId — Change user role in tenant
  app.patch('/rbac/tenants/:id/users/:userId', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id, userId } = request.params as { id: string; userId: string };
    const parseResult = ChangeRoleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const membership = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: id, userId } },
    });
    if (!membership) return reply.status(404).send({ error: 'User not found in this tenant' });

    const updated = await prisma.accountUser.update({
      where: { id: membership.id },
      data: { role: parseResult.data.role },
    });

    await createAuditEntry(id, payload.userId, 'role.changed', 'AccountUser', membership.id, {
      previousRole: membership.role,
      newRole: parseResult.data.role,
      targetUserId: userId,
    });

    return reply.send({ data: { id: updated.id, role: updated.role } });
  });

  // DELETE /admin/rbac/tenants/:id/users/:userId — Remove user from tenant
  app.delete('/rbac/tenants/:id/users/:userId', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id, userId } = request.params as { id: string; userId: string };

    const membership = await prisma.accountUser.findUnique({
      where: { accountId_userId: { accountId: id, userId } },
    });
    if (!membership) return reply.status(404).send({ error: 'User not found in this tenant' });

    // Soft-delete: deactivate membership
    await prisma.accountUser.update({
      where: { id: membership.id },
      data: { isActive: false },
    });

    await createAuditEntry(id, payload.userId, 'user.removed', 'AccountUser', membership.id, {
      targetUserId: userId,
      previousRole: membership.role,
    });

    return reply.send({ message: 'User removed from tenant' });
  });

  // GET /admin/rbac/tenants/:id/permissions — Get permissions config for a tenant
  app.get('/rbac/tenants/:id/permissions', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id } = request.params as { id: string };

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: 'Tenant not found' });

    return reply.send({
      data: {
        permissions: getAccountPermissions(account),
        roleNames: getAccountRoleNames(account),
        modules: PERMISSION_MODULES,
      },
    });
  });

  // PATCH /admin/rbac/tenants/:id/permissions — Update permissions for a tenant
  app.patch('/rbac/tenants/:id/permissions', async (request, reply) => {
    const payload = await requireSuperAdmin(request, reply);
    if (!payload) return;

    const { id } = request.params as { id: string };
    const parseResult = PermissionsUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: 'Tenant not found' });

    const currentMeta = (account.metadata as Record<string, unknown>) || {};
    const currentPerms = getAccountPermissions(account);

    // Merge incoming permissions with existing
    const merged = { ...currentPerms };
    for (const [role, modules] of Object.entries(parseResult.data.permissions)) {
      if (!merged[role]) merged[role] = {};
      for (const [mod, perms] of Object.entries(modules)) {
        merged[role][mod] = perms;
      }
    }

    await prisma.account.update({
      where: { id },
      data: {
        metadata: { ...currentMeta, permissions: merged },
      },
    });

    await createAuditEntry(id, payload.userId, 'permissions.updated', 'Account', id, {
      updatedRoles: Object.keys(parseResult.data.permissions),
    });

    return reply.send({ data: { permissions: merged } });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT-LEVEL ADMIN ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/rbac/permissions — Get permission config for current account
  app.get('/rbac/permissions', async (request, reply) => {
    const payload = await requireAccountAdmin(request, reply);
    if (!payload) return;

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    return reply.send({
      data: {
        permissions: getAccountPermissions(account),
        roleNames: getAccountRoleNames(account),
        modules: PERMISSION_MODULES,
      },
    });
  });

  // PATCH /admin/rbac/permissions — Update permissions for current account
  app.patch('/rbac/permissions', async (request, reply) => {
    const payload = await requireAccountAdmin(request, reply);
    if (!payload) return;

    const parseResult = PermissionsUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const currentPerms = getAccountPermissions(account);
    const adminPerms = currentPerms[payload.role || 'ADMIN'] || currentPerms['ADMIN'];

    // Cascade check: ADMIN can only grant permissions they themselves have
    for (const [role, modules] of Object.entries(parseResult.data.permissions)) {
      // Cannot modify OWNER permissions
      if (role === 'OWNER') {
        return reply.status(403).send({ error: 'Cannot modify OWNER permissions' });
      }
      for (const [mod, perms] of Object.entries(modules)) {
        const adminModPerms = adminPerms?.[mod];
        if (!adminModPerms) continue;
        // Cannot grant a permission the admin doesn't have
        if (perms.read && !adminModPerms.read) {
          return reply.status(403).send({ error: `Cannot grant read on ${mod} — you don't have it` });
        }
        if (perms.create && !adminModPerms.create) {
          return reply.status(403).send({ error: `Cannot grant create on ${mod} — you don't have it` });
        }
        if (perms.update && !adminModPerms.update) {
          return reply.status(403).send({ error: `Cannot grant update on ${mod} — you don't have it` });
        }
        if (perms.delete && !adminModPerms.delete) {
          return reply.status(403).send({ error: `Cannot grant delete on ${mod} — you don't have it` });
        }
      }
    }

    const currentMeta = (account.metadata as Record<string, unknown>) || {};
    const merged = { ...currentPerms };
    for (const [role, modules] of Object.entries(parseResult.data.permissions)) {
      if (!merged[role]) merged[role] = {};
      for (const [mod, perms] of Object.entries(modules)) {
        merged[role][mod] = perms;
      }
    }

    await prisma.account.update({
      where: { id: payload.accountId },
      data: {
        metadata: { ...currentMeta, permissions: merged },
      },
    });

    await createAuditEntry(payload.accountId, payload.userId, 'permissions.updated', 'Account', payload.accountId, {
      updatedRoles: Object.keys(parseResult.data.permissions),
    });

    return reply.send({ data: { permissions: merged } });
  });

  // GET /admin/rbac/roles — Get role names config for current account
  app.get('/rbac/roles', async (request, reply) => {
    const payload = await requireAccountAdmin(request, reply);
    if (!payload) return;

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    return reply.send({ data: { roleNames: getAccountRoleNames(account) } });
  });

  // PATCH /admin/rbac/roles — Update role display names for current account
  app.patch('/rbac/roles', async (request, reply) => {
    const payload = await requireAccountAdmin(request, reply);
    if (!payload) return;

    const parseResult = RoleNamesUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const currentMeta = (account.metadata as Record<string, unknown>) || {};
    const currentNames = getAccountRoleNames(account);
    const merged = { ...currentNames, ...parseResult.data.roleNames };

    await prisma.account.update({
      where: { id: payload.accountId },
      data: {
        metadata: { ...currentMeta, roleNames: merged },
      },
    });

    await createAuditEntry(payload.accountId, payload.userId, 'roleNames.updated', 'Account', payload.accountId, {
      roleNames: merged,
    });

    return reply.send({ data: { roleNames: merged } });
  });

  // POST /admin/rbac/signup-config — Configure self-signup for current tenant
  app.post('/rbac/signup-config', async (request, reply) => {
    const payload = await requireAccountAdmin(request, reply);
    if (!payload) return;

    const parseResult = SignupConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
    }

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const currentMeta = (account.metadata as Record<string, unknown>) || {};

    await prisma.account.update({
      where: { id: payload.accountId },
      data: {
        metadata: {
          ...currentMeta,
          signupConfig: parseResult.data,
        },
      },
    });

    await createAuditEntry(payload.accountId, payload.userId, 'signup.config.updated', 'Account', payload.accountId, parseResult.data);

    return reply.send({ data: { signupConfig: parseResult.data } });
  });
}
