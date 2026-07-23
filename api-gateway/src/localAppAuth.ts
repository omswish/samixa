import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';

export type LocalAppUsername = 'admin' | 'operator';
export type LocalAppRole = 'viewer' | 'admin';
export type LocalAppPasswordSource = 'env' | 'runtime' | 'postgres';

export interface LocalAppPrincipal {
  username: LocalAppUsername;
  displayName: string;
  role: LocalAppRole;
  loginId: string;
}

export interface LocalAuthPasswordRecord {
  salt: string;
  hash: string;
}

type LegacyLocalAuthConfig = {
  version: 1;
  updatedAt: string;
  users: {
    admin?: LocalAuthPasswordRecord;
    operator?: LocalAuthPasswordRecord;
  };
};

export interface LegacyLocalAuthStatus {
  mode: 'runtime' | 'env';
  updatedAt: string | null;
  users: Record<LocalAppUsername, {
    custom: boolean;
    source: 'runtime' | 'env';
    loginId: string;
    displayName: string;
  }>;
}

export interface LocalAuthBootstrapSeed {
  username: LocalAppUsername;
  displayName: string;
  role: LocalAppRole;
  passwordSalt: string;
  passwordHash: string;
  passwordSource: 'env' | 'runtime';
}

const LOCAL_APP_PRINCIPALS: Record<LocalAppUsername, LocalAppPrincipal> = {
  admin: {
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    loginId: 'admin'
  },
  operator: {
    username: 'operator',
    displayName: 'Operator',
    role: 'viewer',
    loginId: 'operator'
  }
};

const DEFAULT_RUNTIME_ROOT =
  process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'ITDashboard');

const LEGACY_LOCAL_AUTH_CONFIG_PATH = path.join(DEFAULT_RUNTIME_ROOT, 'config', 'app-auth.json');

function normalizeUsername(value: string): LocalAppUsername | null {
  const normalized = value.trim().toLowerCase();
  return normalized === 'admin' || normalized === 'operator'
    ? normalized
    : null;
}

function getDefaultPasswordForUser(username: LocalAppUsername) {
  if (username === 'admin') {
    return process.env.APP_ADMIN_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737';
  }

  return process.env.APP_OPERATOR_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737';
}

export function getLocalAppLoginId(username: LocalAppUsername) {
  const configured = (
    username === 'admin'
      ? process.env.APP_ADMIN_LOGIN_ID
      : process.env.APP_OPERATOR_LOGIN_ID
  ) || '';

  const normalized = configured.trim().toLowerCase();
  return normalized || username;
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readLegacyLocalAuthConfig(): LegacyLocalAuthConfig | null {
  try {
    if (!fs.existsSync(LEGACY_LOCAL_AUTH_CONFIG_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(LEGACY_LOCAL_AUTH_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LegacyLocalAuthConfig;
    if (!parsed?.users || typeof parsed.users !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function hashLocalAppPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

export function verifyLocalAppPassword(password: string, record: LocalAuthPasswordRecord) {
  return safeCompare(hashLocalAppPassword(password, record.salt), record.hash);
}

export function createLocalAppPasswordRecord(password: string): LocalAuthPasswordRecord {
  const salt = randomBytes(16).toString('hex');
  return {
    salt,
    hash: hashLocalAppPassword(password, salt)
  };
}

export function getLocalAppPrincipal(username: string) {
  const normalized = normalizeUsername(username);
  return normalized
    ? {
        ...LOCAL_APP_PRINCIPALS[normalized],
        loginId: getLocalAppLoginId(normalized)
      }
    : null;
}

export function getLegacyLocalAuthStatus(): LegacyLocalAuthStatus {
  const config = readLegacyLocalAuthConfig();

  return {
    mode: config ? 'runtime' : 'env',
    updatedAt: config?.updatedAt ?? null,
    users: {
      admin: {
        custom: Boolean(config?.users?.admin),
        source: config?.users?.admin ? 'runtime' : 'env',
        loginId: getLocalAppLoginId('admin'),
        displayName: LOCAL_APP_PRINCIPALS.admin.displayName
      },
      operator: {
        custom: Boolean(config?.users?.operator),
        source: config?.users?.operator ? 'runtime' : 'env',
        loginId: getLocalAppLoginId('operator'),
        displayName: LOCAL_APP_PRINCIPALS.operator.displayName
      }
    }
  };
}

export function saveLegacyLocalAppPasswords(update: {
  adminPassword?: string | null;
  operatorPassword?: string | null;
}) {
  const current = readLegacyLocalAuthConfig();
  const nextUsers: LegacyLocalAuthConfig['users'] = {
    ...(current?.users || {})
  };

  if (typeof update.adminPassword === 'string' && update.adminPassword.trim().length > 0) {
    nextUsers.admin = createLocalAppPasswordRecord(update.adminPassword.trim());
  }

  if (typeof update.operatorPassword === 'string' && update.operatorPassword.trim().length > 0) {
    nextUsers.operator = createLocalAppPasswordRecord(update.operatorPassword.trim());
  }

  const payload: LegacyLocalAuthConfig = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: nextUsers
  };

  fs.mkdirSync(path.dirname(LEGACY_LOCAL_AUTH_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(LEGACY_LOCAL_AUTH_CONFIG_PATH, JSON.stringify(payload, null, 2), 'utf8');

  return getLegacyLocalAuthStatus();
}

export function authenticateLegacyLocalAppUser(
  username: string,
  password: string,
  options?: {
    requireAdmin?: boolean;
  }
) {
  const principal = getLocalAppPrincipal(username);
  if (!principal) {
    return null;
  }

  if (options?.requireAdmin && principal.role !== 'admin') {
    return null;
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    return null;
  }

  const config = readLegacyLocalAuthConfig();
  const storedPassword = config?.users?.[normalized] ?? null;
  const passwordValid = storedPassword
    ? verifyLocalAppPassword(password, storedPassword)
    : safeCompare(password, getDefaultPasswordForUser(normalized));

  if (!passwordValid) {
    return null;
  }

  return principal;
}

export function buildLocalAuthBootstrapSeeds(): LocalAuthBootstrapSeed[] {
  const config = readLegacyLocalAuthConfig();

  return (Object.values(LOCAL_APP_PRINCIPALS) as LocalAppPrincipal[]).map((principal) => {
    const storedPassword = config?.users?.[principal.username];
    const passwordRecord = storedPassword ?? createLocalAppPasswordRecord(getDefaultPasswordForUser(principal.username));

    return {
      username: principal.username,
      displayName: principal.displayName,
      role: principal.role,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      passwordSource: storedPassword ? 'runtime' : 'env'
    };
  });
}
