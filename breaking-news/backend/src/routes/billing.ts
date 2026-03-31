/**
 * Stripe billing integration.
 * Uses Stripe REST API directly (no SDK dependency).
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPayload } from '../lib/route-helpers.js';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_API = 'https://api.stripe.com/v1';

const PLANS = {
  free: { name: 'Free', price: 0, markets: 1, sources: 50, priceId: null },
  pro: { name: 'Pro', price: 9900, markets: 5, sources: 500, priceId: 'price_pro_monthly' },
  enterprise: { name: 'Enterprise', price: 49900, markets: -1, sources: -1, priceId: 'price_enterprise_monthly' },
};

async function stripeRequest(path: string, method: string = 'GET', body?: Record<string, string>): Promise<any> {
  if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY not configured');

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    signal: AbortSignal.timeout(15000),
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(`${STRIPE_API}${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

export async function billingRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /billing/plans — list available plans
  app.get('/billing/plans', async (_request, reply) => {
    return reply.send({
      data: Object.entries(PLANS).map(([id, plan]) => ({
        id,
        name: plan.name,
        priceMonthly: plan.price / 100,
        markets: plan.markets === -1 ? 'Unlimited' : plan.markets,
        sources: plan.sources === -1 ? 'Unlimited' : plan.sources,
      })),
    });
  });

  // POST /billing/create-checkout — create Stripe checkout session
  app.post('/billing/create-checkout', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    if (!STRIPE_KEY) return reply.status(503).send({ error: 'Billing not configured' });

    const body = z.object({
      planId: z.enum(['pro', 'enterprise']),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }).parse(request.body);

    const plan = PLANS[body.planId];
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    const session = await stripeRequest('/checkout/sessions', 'POST', {
      'mode': 'subscription',
      'success_url': body.successUrl,
      'cancel_url': body.cancelUrl,
      'customer_email': user?.email || '',
      'line_items[0][price]': plan.priceId || '',
      'line_items[0][quantity]': '1',
      'metadata[accountId]': payload.accountId,
      'metadata[userId]': payload.userId,
      'metadata[planId]': body.planId,
    });

    return reply.send({ url: session.url, sessionId: session.id });
  });

  // GET /billing/subscription — get current subscription
  app.get('/billing/subscription', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    const meta = (account?.metadata || {}) as Record<string, unknown>;

    return reply.send({
      plan: account?.plan || 'free',
      stripeCustomerId: meta.stripeCustomerId || null,
      stripeSubscriptionId: meta.stripeSubscriptionId || null,
      currentPeriodEnd: meta.currentPeriodEnd || null,
      cancelAt: meta.cancelAt || null,
    });
  });

  // POST /billing/cancel — cancel subscription
  app.post('/billing/cancel', async (request, reply) => {
    const payload = getPayload(request);
    if (!payload?.accountId) return reply.status(401).send({ error: 'Unauthorized' });

    if (!STRIPE_KEY) return reply.status(503).send({ error: 'Billing not configured' });

    const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
    const meta = (account?.metadata || {}) as Record<string, unknown>;
    const subId = meta.stripeSubscriptionId as string;

    if (!subId) return reply.status(400).send({ error: 'No active subscription' });

    await stripeRequest(`/subscriptions/${subId}`, 'DELETE');

    await prisma.account.update({
      where: { id: payload.accountId },
      data: { plan: 'free', metadata: { ...meta, cancelAt: new Date().toISOString() } },
    });

    return reply.send({ message: 'Subscription cancelled' });
  });

  // POST /billing/webhook — Stripe webhook handler
  app.post('/billing/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    // Verify webhook signature if secret is configured
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = request.headers['stripe-signature'] as string;
      if (!sig) return reply.status(400).send({ error: 'Missing stripe-signature header' });

      // Stripe signature verification using HMAC-SHA256
      try {
        const crypto = await import('crypto');
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);
        const parts = sig.split(',').reduce((acc: Record<string, string>, part: string) => {
          const [key, val] = part.split('=');
          acc[key] = val;
          return acc;
        }, {});
        const timestamp = parts['t'];
        const expectedSig = parts['v1'];
        if (!timestamp || !expectedSig) {
          return reply.status(400).send({ error: 'Invalid signature format' });
        }
        const payload = `${timestamp}.${rawBody}`;
        const computed = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET)
          .update(payload)
          .digest('hex');
        if (computed !== expectedSig) {
          return reply.status(400).send({ error: 'Invalid webhook signature' });
        }
        // Reject stale timestamps (> 5 minutes)
        const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
        if (ageSeconds > 300) {
          return reply.status(400).send({ error: 'Webhook timestamp too old' });
        }
      } catch (err) {
        return reply.status(400).send({ error: 'Signature verification failed' });
      }
    }

    const event = request.body as any;
    if (!event?.type) return reply.status(400).send({ error: 'Invalid event' });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data?.object;
        const accountId = session?.metadata?.accountId;
        if (accountId) {
          // Determine plan from metadata or default to pro
          const planId = session?.metadata?.planId || 'pro';
          await prisma.account.update({
            where: { id: accountId },
            data: {
              plan: planId,
              metadata: {
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
                currentPeriodEnd: session.current_period_end
                  ? new Date(session.current_period_end * 1000).toISOString()
                  : null,
              },
            },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data?.object;
        // Find account by subscription ID
        const accounts = await prisma.account.findMany({
          where: { metadata: { path: ['stripeSubscriptionId'], equals: sub?.id } },
        });
        for (const account of accounts) {
          await prisma.account.update({
            where: { id: account.id },
            data: { plan: 'free' },
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data?.object;
        const subId = invoice?.subscription;
        if (subId) {
          const accounts = await prisma.account.findMany({
            where: { metadata: { path: ['stripeSubscriptionId'], equals: subId } },
          });
          for (const account of accounts) {
            const meta = (account.metadata || {}) as Record<string, unknown>;
            await prisma.account.update({
              where: { id: account.id },
              data: {
                metadata: { ...meta, paymentFailed: true, paymentFailedAt: new Date().toISOString() },
              },
            });
          }
        }
        break;
      }
    }

    return reply.send({ received: true });
  });
}
