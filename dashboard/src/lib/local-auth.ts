import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';
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

type LocalAuthPasswordRecord = {
  salt: string;
  hash: string;
};

type LocalAuthConfig = {
  version: 1;
  updatedAt: string;
  users: {
    admin?: LocalAuthPasswordRecord;
    operator?: LocalAuthPasswordRecord;
  };
};

export interface LocalAuthStatus {
  mode: 'runtime' | 'env';
  updatedAt: string | null;
  users: Record<'admin' | 'operator', {
    custom: boolean;
    source: 'runtime' | 'env';
  }>;
}

const DEFAULT_RUNTIME_ROOT =
  process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'ITDashboard');

const LOCAL_AUTH_CONFIG_PATH = path.join(DEFAULT_RUNTIME_ROOT, 'config', 'app-auth.json');

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function getDefaultPasswordForUser(username: 'admin' | 'operator') {
  if (username === 'admin') {
    return process.env.APP_ADMIN_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737';
  }

  return process.env.APP_OPERATOR_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737';
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readLocalAuthConfig(): LocalAuthConfig | null {
  try {
    if (!fs.existsSync(LOCAL_AUTH_CONFIG_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(LOCAL_AUTH_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LocalAuthConfig;
    if (!parsed?.users || typeof parsed.users !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyStoredPassword(password: string, record: LocalAuthPasswordRecord) {
  return safeCompare(hashPassword(password, record.salt), record.hash);
}

function buildPasswordRecord(password: string): LocalAuthPasswordRecord {
  const salt = randomBytes(16).toString('hex');
  return {
    salt,
    hash: hashPassword(password, salt)
  };
}

function resolveStoredPasswordRecord(username: 'admin' | 'operator') {
  const config = readLocalAuthConfig();
  return config?.users?.[username] ?? null;
}

export function getLocalAuthStatus(): LocalAuthStatus {
  const config = readLocalAuthConfig();

  return {
    mode: config ? 'runtime' : 'env',
    updatedAt: config?.updatedAt ?? null,
    users: {
      admin: {
        custom: Boolean(config?.users?.admin),
        source: config?.users?.admin ? 'runtime' : 'env'
      },
      operator: {
        custom: Boolean(config?.users?.operator),
        source: config?.users?.operator ? 'runtime' : 'env'
      }
    }
  };
}

export function saveLocalAppPasswords(update: {
  adminPassword?: string | null;
  operatorPassword?: string | null;
}) {
  const current = readLocalAuthConfig();
  const nextUsers: LocalAuthConfig['users'] = {
    ...(current?.users || {})
  };

  if (typeof update.adminPassword === 'string' && update.adminPassword.trim().length > 0) {
    nextUsers.admin = buildPasswordRecord(update.adminPassword.trim());
  }

  if (typeof update.operatorPassword === 'string' && update.operatorPassword.trim().length > 0) {
    nextUsers.operator = buildPasswordRecord(update.operatorPassword.trim());
  }

  const payload: LocalAuthConfig = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: nextUsers
  };

  fs.mkdirSync(path.dirname(LOCAL_AUTH_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_AUTH_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');

  return getLocalAuthStatus();
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

  const normalizedUsername = normalizeUsername(username);
  const storedPassword = (normalizedUsername === 'admin' || normalizedUsername === 'operator')
    ? resolveStoredPasswordRecord(normalizedUsername)
    : null;
  const passwordValid = storedPassword
    ? verifyStoredPassword(password, storedPassword)
    : safeCompare(password, getDefaultPasswordForUser(normalizedUsername as 'admin' | 'operator'));

  if (!passwordValid) {
    return null;
  }

  return user;
}
