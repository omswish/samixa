import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { AppRole, getSessionCookieName, verifySessionToken } from './auth-cookie';
import { resolveDashboardSurface } from './dashboard-surface';
import { getLocalAppUser } from './local-auth';

export interface CurrentSession {
  email: string;
  role: AppRole;
  displayName: string | null;
  isServerLocal: boolean;
  expiresAt: string;
}

function getForwardedAddress(headerValue: string | null) {
  if (!headerValue) {
    return '';
  }

  return headerValue.split(',')[0]?.trim() || '';
}

function isServerLocalAddress(address: string) {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === '';
}

export async function resolveCurrentSession(): Promise<CurrentSession | null> {
  const surface = await resolveDashboardSurface();
  const sessionCookie = (await cookies()).get(getSessionCookieName(surface))?.value;
  const session = verifySessionToken(sessionCookie);
  if (!session) {
    return null;
  }

  const user = getLocalAppUser(session.email);
  if (!user || user.role !== session.role) {
    return null;
  }

  const requestHeaders = await headers();
  const forwardedFor = getForwardedAddress(requestHeaders.get('x-forwarded-for'));
  return {
    email: user.username,
    role: user.role,
    displayName: user.displayName,
    isServerLocal: isServerLocalAddress(forwardedFor),
    expiresAt: new Date(session.exp * 1000).toISOString()
  };
}

export async function requireCurrentSession(requiredRole?: AppRole) {
  const session = await resolveCurrentSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  if (requiredRole === 'admin' && session.role !== 'admin') {
    return { session: null, response: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) };
  }

  return { session, response: null };
}
