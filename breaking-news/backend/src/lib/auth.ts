import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  email: string;
  accountId?: string;
  role?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = '24h';

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

// ─── Password Utilities ─────────────────────────────────────────────────────

/**
 * Hash a plaintext password using bcryptjs with 12 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Utilities ──────────────────────────────────────────────────────────

/**
 * Sign a JWT with the given payload. Expires in 24 hours.
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify and decode a JWT. Throws if the token is invalid or expired.
 */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  return decoded as TokenPayload;
}
