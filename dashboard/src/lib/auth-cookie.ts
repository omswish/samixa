import { createHmac, timingSafeEqual } from 'crypto';

export type AppRole = 'viewer' | 'admin';
export type AppSurface = 'operator' | 'admin';

export interface SessionPayload {
  email: string;
  role: AppRole;
  exp: number;
}

const SESSION_COOKIE_BASE_NAME = 'itdash_session';
const DEFAULT_VIEWER_SESSION_DAYS = Number(process.env.VIEWER_SESSION_DAYS || 365);
const DEFAULT_ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function getAuthSecret() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret) {
    throw new Error('APP_AUTH_SECRET is not configured.');
  }

  return secret;
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getAuthSecret()).update(encodedPayload).digest();
}

export function getSessionCookieName(surface: AppSurface = 'operator') {
  return surface === 'admin'
    ? `${SESSION_COOKIE_BASE_NAME}_admin`
    : `${SESSION_COOKIE_BASE_NAME}_operator`;
}

export function getSessionLifetimeSeconds(role: AppRole) {
  if (role === 'admin') {
    return Math.max(3600, Math.round(DEFAULT_ADMIN_SESSION_HOURS * 3600));
  }

  return Math.max(86400, Math.round(DEFAULT_VIEWER_SESSION_DAYS * 86400));
}

export function createSessionToken(email: string, role: AppRole) {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    role,
    exp: Math.floor(Date.now() / 1000) + getSessionLifetimeSeconds(role)
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const encodedSignature = base64UrlEncode(signPayload(encodedPayload));
  return `${encodedPayload}.${encodedSignature}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  try {
    const expectedSignature = signPayload(encodedPayload);
    const providedSignature = Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encodedSignature.length % 4)) % 4),
      'base64'
    );

    if (expectedSignature.length !== providedSignature.length || !timingSafeEqual(expectedSignature, providedSignature)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload?.email || !payload?.role || !payload?.exp) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
