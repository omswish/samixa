import type { AppRole } from './auth-cookie';

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

export type AppAuthUsername = 'admin' | 'operator';
export type AppAuthSource = 'postgres' | 'runtime' | 'env';

export interface AppAuthStatus {
  mode: AppAuthSource;
  updatedAt: string | null;
  users: Record<AppAuthUsername, {
    custom: boolean;
    source: AppAuthSource;
    lastLoginAt: string | null;
    loginId?: string;
    displayName?: string;
  }>;
}

export interface AppAuthUser {
  username: AppAuthUsername;
  loginId?: string;
  displayName: string | null;
  role: AppRole;
}

export async function fetchAppAuthStatus(): Promise<AppAuthStatus> {
  const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/app-auth`, {
    cache: 'no-store'
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || 'Failed to load application auth status.');
  }

  return JSON.parse(body) as AppAuthStatus;
}

export async function updateAppAuthPasswords(payload: {
  adminPassword?: string | undefined;
  operatorPassword?: string | undefined;
}) {
  const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/app-auth`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || 'Failed to update application auth passwords.');
  }

  return JSON.parse(body) as {
    status: AppAuthStatus;
    message: string;
  };
}

export async function verifyAppAuthCredentials(
  username: AppAuthUsername,
  password: string,
  options?: {
    requireAdmin?: boolean;
  }
): Promise<AppAuthUser | null> {
  const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/internal/auth/verify`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      username,
      password,
      requireAdmin: options?.requireAdmin === true
    })
  });

  if (response.status === 403) {
    return null;
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || 'Failed to verify credentials.');
  }

  const payload = JSON.parse(body) as { user?: AppAuthUser | null };
  return payload.user ?? null;
}

export async function resolveAppAuthUser(username: AppAuthUsername): Promise<AppAuthUser | null> {
  const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/internal/auth/user/${username}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || 'Failed to resolve application user.');
  }

  const payload = JSON.parse(body) as { user?: AppAuthUser | null };
  return payload.user ?? null;
}
