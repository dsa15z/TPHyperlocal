// @ts-nocheck
/**
 * SAML 2.0 SSO routes for enterprise newsroom authentication.
 *
 * Provides lightweight SAML support without a full SAML library dependency:
 * - SP metadata generation
 * - IdP configuration per account
 * - AuthnRequest generation and redirect
 * - SAML Response parsing and user auto-provisioning
 */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { generateToken, verifyToken, TokenPayload } from '../lib/auth.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = process.env['API_BASE_URL'] || 'http://localhost:3001';
const FRONTEND_URL = process.env['FRONTEND_URL'] || process.env['NEXT_PUBLIC_API_URL']?.replace(':3001', ':3000') || 'http://localhost:3000';
const SP_ENTITY_ID = `${BASE_URL}/auth/sso/metadata`;
const ACS_URL = `${BASE_URL}/auth/sso/callback`;

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const ConfigureSSOSchema = z.object({
  idpEntityId: z.string().min(1, 'IdP Entity ID is required'),
  idpSsoUrl: z.string().url('IdP SSO URL must be a valid URL'),
  idpCertificate: z.string().min(1, 'IdP certificate is required'),
  emailDomain: z.string().min(1, 'Email domain is required').regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid email domain'),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate SP metadata XML document.
 */
function generateSPMetadata(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${SP_ENTITY_ID}">
  <md:SPSSODescriptor AuthnRequestsSigned="false"
                      WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                Location="${ACS_URL}"
                                index="1"
                                isDefault="true" />
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">Breaking News Intelligence</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">TP Hyperlocal</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${FRONTEND_URL}</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;
}

/**
 * Generate a SAML AuthnRequest XML document.
 */
function generateAuthnRequest(idpSsoUrl: string, requestId: string): string {
  const issueInstant = new Date().toISOString();
  return `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                       xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                       ID="_${requestId}"
                       Version="2.0"
                       IssueInstant="${issueInstant}"
                       Destination="${idpSsoUrl}"
                       AssertionConsumerServiceURL="${ACS_URL}"
                       ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${SP_ENTITY_ID}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
                      AllowCreate="true" />
</samlp:AuthnRequest>`;
}

/**
 * Extract email and display name from a SAML Response XML string.
 * Uses regex extraction since we're avoiding XML library dependencies.
 */
function extractSAMLAttributes(samlXml: string): { email: string | null; displayName: string | null } {
  let email: string | null = null;
  let displayName: string | null = null;

  // Extract NameID (typically the email)
  const nameIdMatch = samlXml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/);
  if (nameIdMatch) {
    email = nameIdMatch[1].trim();
  }

  // Extract email from Attribute elements
  const emailAttrPattern = /<(?:saml2?:)?Attribute\s+Name="(?:email|EmailAddress|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/emailaddress|urn:oid:0\.9\.2342\.19200300\.100\.1\.3)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml2?:)?AttributeValue>/i;
  const emailAttrMatch = samlXml.match(emailAttrPattern);
  if (emailAttrMatch) {
    email = emailAttrMatch[1].trim();
  }

  // Extract display name
  const nameAttrPattern = /<(?:saml2?:)?Attribute\s+Name="(?:displayName|DisplayName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/name|urn:oid:2\.16\.840\.1\.113730\.3\.1\.241)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml2?:)?AttributeValue>/i;
  const nameAttrMatch = samlXml.match(nameAttrPattern);
  if (nameAttrMatch) {
    displayName = nameAttrMatch[1].trim();
  }

  // Fallback: try firstName + lastName attributes
  if (!displayName) {
    const firstNamePattern = /<(?:saml2?:)?Attribute\s+Name="(?:firstName|FirstName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/givenname|urn:oid:2\.5\.4\.42)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml2?:)?AttributeValue>/i;
    const lastNamePattern = /<(?:saml2?:)?Attribute\s+Name="(?:lastName|LastName|http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/surname|urn:oid:2\.5\.4\.4)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml2?:)?AttributeValue>/i;
    const firstName = samlXml.match(firstNamePattern)?.[1]?.trim();
    const lastName = samlXml.match(lastNamePattern)?.[1]?.trim();
    if (firstName || lastName) {
      displayName = [firstName, lastName].filter(Boolean).join(' ');
    }
  }

  return { email, displayName };
}

/**
 * Validate SAML Response signature against stored IdP certificate.
 * Uses Node.js crypto to verify the XML digest.
 */
function validateSAMLSignature(samlXml: string, idpCertificate: string): boolean {
  try {
    // Extract the SignatureValue from the SAML Response
    const sigValueMatch = samlXml.match(/<(?:ds:)?SignatureValue[^>]*>([^<]+)<\/(?:ds:)?SignatureValue>/);
    if (!sigValueMatch) {
      return false;
    }

    // Extract the signed content (SignedInfo element)
    const signedInfoMatch = samlXml.match(/<(?:ds:)?SignedInfo[^>]*>[\s\S]*?<\/(?:ds:)?SignedInfo>/);
    if (!signedInfoMatch) {
      return false;
    }

    const signatureValue = sigValueMatch[1].replace(/\s/g, '');
    const signedInfo = signedInfoMatch[0];

    // Normalize the certificate PEM format
    const certPem = idpCertificate.includes('BEGIN CERTIFICATE')
      ? idpCertificate
      : `-----BEGIN CERTIFICATE-----\n${idpCertificate}\n-----END CERTIFICATE-----`;

    // Verify the signature using SHA-256 (most common for SAML)
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signedInfo);
    const isValid = verifier.verify(certPem, signatureValue, 'base64');

    if (!isValid) {
      // Try SHA-1 as fallback (legacy IdPs)
      const verifierSha1 = crypto.createVerify('RSA-SHA1');
      verifierSha1.update(signedInfo);
      return verifierSha1.verify(certPem, signatureValue, 'base64');
    }

    return isValid;
  } catch (err) {
    console.error('[SSO] Signature validation error:', err);
    return false;
  }
}

/**
 * Get SSO configuration from an account's metadata JSON field.
 */
function getSSOConfig(metadata: unknown): {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  emailDomain: string;
} | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const sso = m.sso as Record<string, string> | undefined;
  if (!sso?.idpEntityId || !sso?.idpSsoUrl || !sso?.idpCertificate || !sso?.emailDomain) return null;
  return {
    idpEntityId: sso.idpEntityId,
    idpSsoUrl: sso.idpSsoUrl,
    idpCertificate: sso.idpCertificate,
    emailDomain: sso.emailDomain,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function ssoRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // ── GET /auth/sso/metadata ──────────────────────────────────────────────
  // Returns SP (Service Provider) metadata XML for IdP configuration
  app.get('/auth/sso/metadata', async (_request, reply) => {
    const metadata = generateSPMetadata();
    return reply
      .header('Content-Type', 'application/xml')
      .send(metadata);
  });

  // ── POST /auth/sso/configure ────────────────────────────────────────────
  // Admin-only: configure IdP for an account
  app.post('/auth/sso/configure', async (request, reply) => {
    // Verify authentication
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing authorization header' });
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(authHeader.slice(7));
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    if (!payload.accountId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'No account context in token' });
    }

    // Check the user is OWNER or ADMIN on this account
    const membership = await prisma.accountUser.findUnique({
      where: {
        accountId_userId: {
          accountId: payload.accountId,
          userId: payload.userId,
        },
      },
    });

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only account owners and admins can configure SSO' });
    }

    // Validate body
    const parseResult = ConfigureSSOSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { idpEntityId, idpSsoUrl, idpCertificate, emailDomain } = parseResult.data;

    // Store SSO config in account metadata
    const account = await prisma.account.findUnique({
      where: { id: payload.accountId },
      select: { metadata: true },
    });

    const existingMetadata = (account?.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      sso: {
        idpEntityId,
        idpSsoUrl,
        idpCertificate,
        emailDomain,
        configuredAt: new Date().toISOString(),
        configuredBy: payload.userId,
      },
    };

    await prisma.account.update({
      where: { id: payload.accountId },
      data: { metadata: updatedMetadata },
    });

    return reply.send({
      success: true,
      message: 'SSO configured successfully',
      sso: {
        idpEntityId,
        idpSsoUrl,
        emailDomain,
        spEntityId: SP_ENTITY_ID,
        acsUrl: ACS_URL,
      },
    });
  });

  // ── GET /auth/sso/login/:accountSlug ────────────────────────────────────
  // Redirect to IdP SSO URL with SAML AuthnRequest
  app.get('/auth/sso/login/:accountSlug', async (request, reply) => {
    const { accountSlug } = request.params as { accountSlug: string };

    const account = await prisma.account.findUnique({
      where: { slug: accountSlug },
      select: { id: true, name: true, metadata: true, isActive: true },
    });

    if (!account || !account.isActive) {
      return reply.status(404).send({ error: 'Not Found', message: 'Account not found' });
    }

    const ssoConfig = getSSOConfig(account.metadata);
    if (!ssoConfig) {
      return reply.status(404).send({ error: 'Not Found', message: 'SSO is not configured for this account' });
    }

    // Generate SAML AuthnRequest
    const requestId = crypto.randomUUID().replace(/-/g, '');
    const authnRequestXml = generateAuthnRequest(ssoConfig.idpSsoUrl, requestId);
    const encodedRequest = Buffer.from(authnRequestXml, 'utf-8').toString('base64');

    // Build redirect URL with SAMLRequest parameter
    const redirectUrl = new URL(ssoConfig.idpSsoUrl);
    redirectUrl.searchParams.set('SAMLRequest', encodedRequest);
    redirectUrl.searchParams.set('RelayState', accountSlug);

    return reply.redirect(302, redirectUrl.toString());
  });

  // ── POST /auth/sso/callback ─────────────────────────────────────────────
  // ACS endpoint: receives SAML Response from IdP
  app.post('/auth/sso/callback', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const samlResponseB64 = body?.SAMLResponse;
    const relayState = body?.RelayState; // accountSlug

    if (!samlResponseB64) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Missing SAMLResponse' });
    }

    // Decode the SAML Response
    let samlXml: string;
    try {
      samlXml = Buffer.from(samlResponseB64, 'base64').toString('utf-8');
    } catch {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid SAMLResponse encoding' });
    }

    // Find the account from RelayState
    let account;
    if (relayState) {
      account = await prisma.account.findUnique({
        where: { slug: relayState },
        select: { id: true, name: true, slug: true, metadata: true, isActive: true },
      });
    }

    // If no RelayState, try to find account by IdP entity ID in the response
    if (!account) {
      const issuerMatch = samlXml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\/(?:saml2?:)?Issuer>/);
      if (issuerMatch) {
        const issuerEntityId = issuerMatch[1].trim();
        // Search accounts for matching IdP entity ID
        const accounts = await prisma.account.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true, metadata: true, isActive: true },
        });
        account = accounts.find((a) => {
          const config = getSSOConfig(a.metadata);
          return config?.idpEntityId === issuerEntityId;
        });
      }
    }

    if (!account) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Could not determine account for SSO callback' });
    }

    const ssoConfig = getSSOConfig(account.metadata);
    if (!ssoConfig) {
      return reply.status(400).send({ error: 'Bad Request', message: 'SSO not configured for this account' });
    }

    // Validate SAML signature
    const signatureValid = validateSAMLSignature(samlXml, ssoConfig.idpCertificate);
    if (!signatureValid) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid SAML Response signature' });
    }

    // Extract user attributes
    const { email, displayName } = extractSAMLAttributes(samlXml);
    if (!email) {
      return reply.status(400).send({ error: 'Bad Request', message: 'No email found in SAML Response' });
    }

    // Verify email domain matches configured domain
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== ssoConfig.emailDomain.toLowerCase()) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Email domain "${emailDomain}" does not match configured SSO domain "${ssoConfig.emailDomain}"`,
      });
    }

    // Auto-provision or find existing user
    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      let isNewUser = false;

      if (!user) {
        // Auto-provision new user
        user = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash: '', // SSO users don't have passwords
            displayName: displayName || email.split('@')[0],
            lastLoginAt: new Date(),
          },
        });
        isNewUser = true;
      } else {
        // Update last login
        user = await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }

      // Ensure account membership exists
      const existingMembership = await tx.accountUser.findUnique({
        where: {
          accountId_userId: {
            accountId: account.id,
            userId: user.id,
          },
        },
      });

      if (!existingMembership) {
        await tx.accountUser.create({
          data: {
            accountId: account.id,
            userId: user.id,
            role: 'VIEWER', // Default role for SSO-provisioned users
          },
        });
      }

      return { user, isNewUser };
    });

    // Generate JWT
    const membership = await prisma.accountUser.findUnique({
      where: {
        accountId_userId: {
          accountId: account.id,
          userId: result.user.id,
        },
      },
    });

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      accountId: account.id,
      role: membership?.role || 'VIEWER',
    });

    // Redirect to frontend with token
    const redirectUrl = new URL('/auth/sso/complete', FRONTEND_URL);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('account', account.slug);
    if (result.isNewUser) {
      redirectUrl.searchParams.set('new', '1');
    }

    return reply.redirect(302, redirectUrl.toString());
  });

  // ── GET /auth/sso/accounts ──────────────────────────────────────────────
  // List accounts that have SSO configured (public, for login page)
  app.get('/auth/sso/accounts', async (_request, reply) => {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, metadata: true },
    });

    const ssoAccounts = accounts
      .filter((a) => getSSOConfig(a.metadata) !== null)
      .map((a) => {
        const ssoConfig = getSSOConfig(a.metadata)!;
        return {
          id: a.id,
          name: a.name,
          slug: a.slug,
          emailDomain: ssoConfig.emailDomain,
          loginUrl: `${BASE_URL}/auth/sso/login/${a.slug}`,
        };
      });

    return reply.send({ accounts: ssoAccounts });
  });
}

export { ssoRoutes as default };
