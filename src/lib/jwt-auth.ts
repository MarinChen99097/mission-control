/**
 * OrgOfClaws — Marketing Backend JWT Validation for Mission Control
 * ==================================================================
 * Validates JWT tokens issued by Marketing Backend so that MC can serve
 * as a multi-tenant dashboard. Same SECRET_KEY, same HS256 algorithm.
 *
 * Usage:
 *   import { validateMarketingJWT, getTenantFromJWT } from '@/lib/jwt-auth';
 *
 *   // In API route:
 *   const user = await validateMarketingJWT(request);
 *   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *
 * Required env:
 *   MARKETING_JWT_SECRET  — Same SECRET_KEY as Marketing Backend
 */

import { createHmac, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env.MARKETING_JWT_SECRET || process.env.SECRET_KEY || '';

interface JWTPayload {
  sub: string;      // email
  exp: number;      // expiry timestamp
  iat: number;      // issued at
  jti: string;      // JWT ID
  type?: string;    // 'refresh' for refresh tokens
}

export interface MarketingUser {
  email: string;
  exp: number;
  jti: string;
}

/**
 * Decode and verify a Marketing Backend HS256 JWT.
 * Returns null if invalid, expired, or refresh token.
 */
export function verifyJWT(token: string): MarketingUser | null {
  if (!JWT_SECRET) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature (HS256)
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('base64url');

    // Timing-safe comparison
    const sigBuf = Buffer.from(signatureB64, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    // Decode payload
    const payload: JWTPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    );

    // Reject refresh tokens
    if (payload.type === 'refresh') return null;

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    // Require email
    if (!payload.sub) return null;

    return {
      email: payload.sub,
      exp: payload.exp,
      jti: payload.jti,
    };
  } catch {
    return null;
  }
}

/**
 * Extract and validate JWT from a Next.js Request object.
 * Checks Authorization header (Bearer) and cookie (oc_token).
 */
export function validateMarketingJWT(request: Request): MarketingUser | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = verifyJWT(authHeader.slice(7));
    if (user) return user;
  }

  // Try cookie fallback
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/oc_token=([^;]+)/);
  if (tokenMatch) {
    const user = verifyJWT(tokenMatch[1]);
    if (user) return user;
  }

  return null;
}

/**
 * Get tenant info from MC's local SQLite by marketing user email.
 * Returns workspace_id and tenant details for query scoping.
 */
export async function getTenantFromEmail(db: any, email: string): Promise<{
  tenantId: number;
  workspaceId: number;
  userId: number;
  role: string;
} | null> {
  const user = db.prepare(`
    SELECT u.id, u.workspace_id, u.role, t.id as tenant_id
    FROM users u
    LEFT JOIN tenants t ON t.id = (SELECT tenant_id FROM workspaces WHERE id = u.workspace_id)
    WHERE u.email = ?
  `).get(email);

  if (!user) return null;

  return {
    tenantId: user.tenant_id || 1,
    workspaceId: user.workspace_id || 1,
    userId: user.id,
    role: user.role || 'viewer',
  };
}

/**
 * Middleware helper: validate JWT and resolve to MC tenant context.
 * Returns null if unauthorized — caller should return 401.
 */
export async function resolveRequestTenant(request: Request, db: any): Promise<{
  user: MarketingUser;
  tenantId: number;
  workspaceId: number;
  userId: number;
  role: string;
} | null> {
  const jwtUser = validateMarketingJWT(request);
  if (!jwtUser) return null;

  const tenant = await getTenantFromEmail(db, jwtUser.email);
  if (!tenant) return null;

  return { user: jwtUser, ...tenant };
}
