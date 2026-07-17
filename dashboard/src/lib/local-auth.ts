import { timingSafeEqual } from 'crypto';
import type { AppRole } from './auth-cookie';

export interface LocalAppUser {
  username: string;
  displayName: string;
  role: AppRole;
}

const LOCAL_USERS: Record<string, LocalAppUser> = {
  admin: {
    username: 'admin',
    displayName: 'Admin',
    role: 'admin'
  },
  operator: {
    username: 'operator',
    displayName: 'Operator',
    role: 'viewer'
  }
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function getConfiguredPassword() {
  return process.env.APP_LOGIN_PASSWORD || '17172737';
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getLocalAppUser(username: string) {
  return LOCAL_USERS[normalizeUsername(username)] ?? null;
}

export function authenticateLocalAppUser(
  username: string,
  password: string,
  options?: {
    requireAdmin?: boolean;
  }
) {
  const user = getLocalAppUser(username);
  if (!user) {
    return null;
  }

  if (options?.requireAdmin && user.role !== 'admin') {
    return null;
  }

  if (!safeCompare(password, getConfiguredPassword())) {
    return null;
  }

  return user;
}
