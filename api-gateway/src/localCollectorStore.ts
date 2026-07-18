import fs from 'fs';
import path from 'path';
import { EncryptedSecretEnvelope } from './secretCrypto';

export type LocalCollectorSourceName = 'nutanix' | 'solarwinds' | 'symphony';

export interface LocalCollectorTargetConfigRecord {
  configKey: string;
  sourceName: LocalCollectorSourceName;
  targetName: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCollectorSecretConfigRecord {
  configKey: string;
  sourceName: LocalCollectorSourceName;
  targetName: string;
  secretName: 'username' | 'password';
  keyVersion: string;
  secretCipherJson: EncryptedSecretEnvelope;
  createdAt: string;
  updatedAt: string;
}

interface StoredTargetSecrets {
  username?: {
    keyVersion: string;
    cipher: EncryptedSecretEnvelope;
    createdAt: string;
    updatedAt: string;
  };
  password?: {
    keyVersion: string;
    cipher: EncryptedSecretEnvelope;
    createdAt: string;
    updatedAt: string;
  };
}

interface StoredTargetEntry {
  configKey: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  secrets?: StoredTargetSecrets;
}

interface StoredCollectorConfigFile {
  version: 1;
  updatedAt: string;
  collectors: Partial<Record<LocalCollectorSourceName, {
    targets: Record<string, StoredTargetEntry>;
  }>>;
}

function getDefaultRuntimeRoot() {
  return (
    process.env.ITDASH_RUNTIME_ROOT
    || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'ITDashboard')
  );
}

function getConfigRoot() {
  return path.join(getDefaultRuntimeRoot(), 'config');
}

export function getLocalCollectorSettingsPath() {
  return path.join(getConfigRoot(), 'collector-settings.json');
}

function createDefaultStore(): StoredCollectorConfigFile {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    collectors: {}
  };
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function ensureSourceBucket(store: StoredCollectorConfigFile, sourceName: LocalCollectorSourceName) {
  const existing = store.collectors[sourceName];
  if (existing) {
    return existing;
  }

  const next = { targets: {} as Record<string, StoredTargetEntry> };
  store.collectors[sourceName] = next;
  return next;
}

function readStore(): StoredCollectorConfigFile {
  const settingsPath = getLocalCollectorSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return createDefaultStore();
  }

  const raw = fs.readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<StoredCollectorConfigFile>;
  const store = createDefaultStore();

  store.updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : store.updatedAt;

  for (const sourceName of ['nutanix', 'solarwinds', 'symphony'] as const) {
    const incomingSource = parsed.collectors?.[sourceName];
    if (!incomingSource || typeof incomingSource !== 'object' || Array.isArray(incomingSource)) {
      continue;
    }

    const targetEntries = (incomingSource as { targets?: unknown }).targets;
    if (!targetEntries || typeof targetEntries !== 'object' || Array.isArray(targetEntries)) {
      continue;
    }

    const targetBucket: Record<string, StoredTargetEntry> = {};
    for (const [targetName, rawEntry] of Object.entries(targetEntries as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        continue;
      }

      const typedEntry = rawEntry as Partial<StoredTargetEntry>;
      const secrets = typedEntry.secrets && typeof typedEntry.secrets === 'object' && !Array.isArray(typedEntry.secrets)
        ? typedEntry.secrets
        : undefined;

      targetBucket[targetName] = {
        configKey: typeof typedEntry.configKey === 'string' && typedEntry.configKey.trim()
          ? typedEntry.configKey.trim()
          : `${sourceName}:${targetName}`,
        targetUrl: typeof typedEntry.targetUrl === 'string' ? typedEntry.targetUrl.trim() : '',
        host: typeof typedEntry.host === 'string' && typedEntry.host.trim() ? typedEntry.host.trim() : null,
        enabled: typedEntry.enabled !== false,
        owner: typeof typedEntry.owner === 'string' && typedEntry.owner.trim() ? typedEntry.owner.trim() : null,
        pollIntervalSeconds: typeof typedEntry.pollIntervalSeconds === 'number' && Number.isFinite(typedEntry.pollIntervalSeconds)
          ? typedEntry.pollIntervalSeconds
          : null,
        notes: typeof typedEntry.notes === 'string' && typedEntry.notes.trim() ? typedEntry.notes.trim() : null,
        metadataJson: sanitizeMetadata(typedEntry.metadataJson),
        createdAt: typeof typedEntry.createdAt === 'string' ? typedEntry.createdAt : new Date().toISOString(),
        updatedAt: typeof typedEntry.updatedAt === 'string' ? typedEntry.updatedAt : new Date().toISOString(),
        secrets: secrets as StoredTargetSecrets | undefined
      };
    }

    store.collectors[sourceName] = { targets: targetBucket };
  }

  return store;
}

function writeStore(store: StoredCollectorConfigFile) {
  const settingsPath = getLocalCollectorSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  store.updatedAt = new Date().toISOString();

  const tmpPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, settingsPath);
}

export function readLocalCollectorTargetConfigs(sourceName: LocalCollectorSourceName): LocalCollectorTargetConfigRecord[] {
  const store = readStore();
  const targetEntries = store.collectors[sourceName]?.targets ?? {};

  return Object.entries(targetEntries)
    .map(([targetName, entry]) => ({
      configKey: entry.configKey,
      sourceName,
      targetName,
      targetUrl: entry.targetUrl,
      host: entry.host,
      enabled: entry.enabled,
      owner: entry.owner,
      pollIntervalSeconds: entry.pollIntervalSeconds,
      notes: entry.notes,
      metadataJson: entry.metadataJson,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    }))
    .sort((left, right) => left.targetName.localeCompare(right.targetName));
}

export function readLocalCollectorSecretConfigs(sourceName: LocalCollectorSourceName): LocalCollectorSecretConfigRecord[] {
  const store = readStore();
  const targetEntries = store.collectors[sourceName]?.targets ?? {};
  const rows: LocalCollectorSecretConfigRecord[] = [];

  for (const [targetName, entry] of Object.entries(targetEntries)) {
    const secrets = entry.secrets;
    if (!secrets) {
      continue;
    }

    if (secrets.username?.cipher) {
      rows.push({
        configKey: entry.configKey,
        sourceName,
        targetName,
        secretName: 'username',
        keyVersion: secrets.username.keyVersion || 'v1',
        secretCipherJson: secrets.username.cipher,
        createdAt: secrets.username.createdAt,
        updatedAt: secrets.username.updatedAt
      });
    }

    if (secrets.password?.cipher) {
      rows.push({
        configKey: entry.configKey,
        sourceName,
        targetName,
        secretName: 'password',
        keyVersion: secrets.password.keyVersion || 'v1',
        secretCipherJson: secrets.password.cipher,
        createdAt: secrets.password.createdAt,
        updatedAt: secrets.password.updatedAt
      });
    }
  }

  return rows.sort((left, right) => {
    const targetCompare = left.targetName.localeCompare(right.targetName);
    if (targetCompare !== 0) {
      return targetCompare;
    }
    return left.secretName.localeCompare(right.secretName);
  });
}

export function upsertLocalCollectorTargetConfig(seed: {
  configKey: string;
  sourceName: LocalCollectorSourceName;
  targetName: string;
  targetUrl: string;
  host?: string | null;
  enabled?: boolean;
  owner?: string | null;
  pollIntervalSeconds?: number | null;
  notes?: string | null;
  metadataJson?: Record<string, unknown>;
}) {
  const store = readStore();
  const sourceBucket = ensureSourceBucket(store, seed.sourceName);
  const existing = sourceBucket.targets[seed.targetName];
  const now = new Date().toISOString();

  sourceBucket.targets[seed.targetName] = {
    configKey: seed.configKey,
    targetUrl: seed.targetUrl,
    host: seed.host ?? null,
    enabled: seed.enabled !== false,
    owner: seed.owner ?? null,
    pollIntervalSeconds: seed.pollIntervalSeconds ?? null,
    notes: seed.notes ?? null,
    metadataJson: sanitizeMetadata(seed.metadataJson),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    secrets: existing?.secrets
  };

  writeStore(store);
}

export function replaceLocalCollectorSecretConfig(
  sourceName: LocalCollectorSourceName,
  targetName: string,
  configKey: string,
  seeds: Array<{
    secretName: 'username' | 'password';
    keyVersion?: string;
    secretCipherJson: EncryptedSecretEnvelope;
  }>
) {
  const store = readStore();
  const sourceBucket = ensureSourceBucket(store, sourceName);
  const existing = sourceBucket.targets[targetName];
  const now = new Date().toISOString();

  if (!existing) {
    sourceBucket.targets[targetName] = {
      configKey,
      targetUrl: '',
      host: null,
      enabled: true,
      owner: null,
      pollIntervalSeconds: null,
      notes: null,
      metadataJson: {},
      createdAt: now,
      updatedAt: now,
      secrets: {}
    };
  }

  const target = sourceBucket.targets[targetName];
  const nextSecrets: StoredTargetSecrets = {};

  for (const seed of seeds) {
    const previousSecret = target.secrets?.[seed.secretName];
    nextSecrets[seed.secretName] = {
      keyVersion: seed.keyVersion ?? 'v1',
      cipher: seed.secretCipherJson,
      createdAt: previousSecret?.createdAt ?? now,
      updatedAt: now
    };
  }

  target.configKey = configKey;
  target.updatedAt = now;
  target.secrets = nextSecrets;
  writeStore(store);
}
