import {
  bootstrapCollectorSecretConfigNow,
  CollectorSecretConfigRecord,
  CollectorSecretConfigSeed,
  getCollectorSecretConfigsFromPostgres,
  isPostgresMirrorEnabled
} from './postgres';
import { decryptSecret, encryptSecret, EncryptedSecretEnvelope, isPostgresSecretStoreEnabled } from './secretCrypto';
import { RuntimeConfigSourceName } from './runtimeConfig';
import { LocalCollectorSecretConfigRecord, readLocalCollectorSecretConfigs } from './localCollectorStore';

type SecretOrigin = 'env' | 'local' | 'postgres';

export interface RuntimeCollectorSecretTarget {
  configKey: string;
  sourceName: RuntimeConfigSourceName;
  targetName: string;
  username: string | null;
  password: string | null;
  keyVersion: string | null;
  secretOrigin: SecretOrigin;
}

export interface RuntimeCollectorSecretsPayload {
  sourceName: RuntimeConfigSourceName;
  resolvedAt: string;
  backingStore: 'env' | 'local' | 'postgres' | 'mixed' | 'unavailable';
  targets: Record<string, RuntimeCollectorSecretTarget>;
}

let collectorSecretBootstrapPromise: Promise<void> | null = null;

function buildEnvSecretMap(): Array<{
  configKey: string;
  sourceName: RuntimeConfigSourceName;
  targetName: string;
  username: string | null;
  password: string | null;
}> {
  const nutanixUser = process.env.NUTANIX_USER ?? null;
  const nutanixPass = process.env.NUTANIX_PASS ?? null;
  const solarwindsUser = process.env.SW_USER ?? null;
  const solarwindsPass = process.env.SW_PASS ?? null;
  const symphonyUser = process.env.SYM_USER ?? null;
  const symphonyPass = process.env.SYM_PASS ?? null;

  return [
    {
      configKey: 'nutanix:primary',
      sourceName: 'nutanix',
      targetName: 'primary',
      username: nutanixUser,
      password: nutanixPass
    },
    {
      configKey: 'solarwinds:servers',
      sourceName: 'solarwinds',
      targetName: 'servers',
      username: solarwindsUser,
      password: solarwindsPass
    },
    {
      configKey: 'solarwinds:networks',
      sourceName: 'solarwinds',
      targetName: 'networks',
      username: solarwindsUser,
      password: solarwindsPass
    },
    {
      configKey: 'symphony:primary',
      sourceName: 'symphony',
      targetName: 'primary',
      username: symphonyUser,
      password: symphonyPass
    }
  ];
}

function buildEnvSecretSeeds(): CollectorSecretConfigSeed[] {
  const seeds: CollectorSecretConfigSeed[] = [];
  for (const entry of buildEnvSecretMap()) {
    if (entry.username) {
      seeds.push({
        configKey: entry.configKey,
        sourceName: entry.sourceName,
        targetName: entry.targetName,
        secretName: 'username',
        keyVersion: 'v1',
        secretCipherJson: encryptSecret(entry.username)
      });
    }

    if (entry.password) {
      seeds.push({
        configKey: entry.configKey,
        sourceName: entry.sourceName,
        targetName: entry.targetName,
        secretName: 'password',
        keyVersion: 'v1',
        secretCipherJson: encryptSecret(entry.password)
      });
    }
  }

  return seeds;
}

function toRuntimeSecretTarget(
  configKey: string,
  sourceName: RuntimeConfigSourceName,
  targetName: string,
  username: string | null,
  password: string | null,
  keyVersion: string | null,
  secretOrigin: SecretOrigin
): RuntimeCollectorSecretTarget {
  return {
    configKey,
    sourceName,
    targetName,
    username,
    password,
    keyVersion,
    secretOrigin
  };
}

function applyPostgresSecrets(
  target: RuntimeCollectorSecretTarget,
  rows: Array<CollectorSecretConfigRecord | LocalCollectorSecretConfigRecord>,
  secretOrigin: SecretOrigin
): RuntimeCollectorSecretTarget {
  const next = { ...target, secretOrigin };
  for (const row of rows) {
    const decrypted = decryptSecret(row.secretCipherJson as unknown as EncryptedSecretEnvelope);
    if (row.secretName === 'username') {
      next.username = decrypted;
    } else if (row.secretName === 'password') {
      next.password = decrypted;
    }
    next.keyVersion = row.keyVersion;
  }

  return next;
}

export async function ensureCollectorSecretConfigBootstrap() {
  if (!isPostgresMirrorEnabled() || !isPostgresSecretStoreEnabled()) {
    return;
  }

  if (!collectorSecretBootstrapPromise) {
    collectorSecretBootstrapPromise = bootstrapCollectorSecretConfigNow(buildEnvSecretSeeds())
      .catch((error) => {
        collectorSecretBootstrapPromise = null;
        throw error;
      });
  }

  await collectorSecretBootstrapPromise;
}

export async function loadRuntimeCollectorSecrets(sourceName: RuntimeConfigSourceName): Promise<RuntimeCollectorSecretsPayload> {
  const envTargets = buildEnvSecretMap()
    .filter((entry) => entry.sourceName === sourceName)
    .map((entry) => toRuntimeSecretTarget(
      entry.configKey,
      entry.sourceName,
      entry.targetName,
      entry.username,
      entry.password,
      null,
      'env'
    ));

  const targets = new Map<string, RuntimeCollectorSecretTarget>(
    envTargets.map((target) => [target.targetName, target])
  );

  const hasEnvSecrets = envTargets.some((target) => target.username || target.password);
  let backingStore: RuntimeCollectorSecretsPayload['backingStore'] =
    hasEnvSecrets ? 'env' : 'unavailable';

  try {
    const localSecrets = readLocalCollectorSecretConfigs(sourceName);
    const grouped = new Map<string, LocalCollectorSecretConfigRecord[]>();
    for (const row of localSecrets) {
      const bucket = grouped.get(row.targetName) ?? [];
      bucket.push(row);
      grouped.set(row.targetName, bucket);
    }

    for (const [targetName, rows] of grouped.entries()) {
      const seedTarget = targets.get(targetName)
        ?? toRuntimeSecretTarget(rows[0].configKey, sourceName, targetName, null, null, null, 'env');
      targets.set(targetName, applyPostgresSecrets(seedTarget, rows, 'local'));
    }

    if (localSecrets.length > 0 && hasEnvSecrets) {
      backingStore = 'mixed';
    }
    if (localSecrets.length > 0 && [...targets.values()].every((target) => target.secretOrigin === 'local')) {
      backingStore = 'local';
    }
    if (localSecrets.length > 0 && backingStore === 'unavailable') {
      backingStore = 'local';
    }
  } catch (error) {
    console.error(`[runtime-secrets] failed to load local secrets for ${sourceName}:`, error);
  }

  if (isPostgresMirrorEnabled() && isPostgresSecretStoreEnabled()) {
    try {
      await ensureCollectorSecretConfigBootstrap();
      const postgresSecrets = await getCollectorSecretConfigsFromPostgres(sourceName);
      const grouped = new Map<string, CollectorSecretConfigRecord[]>();
      for (const row of postgresSecrets) {
        const bucket = grouped.get(row.targetName) ?? [];
        bucket.push(row);
        grouped.set(row.targetName, bucket);
      }

      for (const [targetName, rows] of grouped.entries()) {
        const seedTarget = targets.get(targetName)
          ?? toRuntimeSecretTarget(rows[0].configKey, sourceName, targetName, null, null, null, 'env');
        targets.set(targetName, applyPostgresSecrets(seedTarget, rows, 'postgres'));
      }

      if (postgresSecrets.length > 0 && hasEnvSecrets) {
        backingStore = 'mixed';
      }
      if (postgresSecrets.length > 0 && [...targets.values()].every((target) => target.secretOrigin === 'postgres')) {
        backingStore = 'postgres';
      }
      if (postgresSecrets.length > 0 && backingStore === 'unavailable') {
        backingStore = 'postgres';
      }
    } catch (error) {
      console.error(`[runtime-secrets] failed to load Postgres secrets for ${sourceName}:`, error);
    }
  }

  return {
    sourceName,
    resolvedAt: new Date().toISOString(),
    backingStore,
    targets: Object.fromEntries(
      [...targets.entries()].sort(([left], [right]) => left.localeCompare(right))
    )
  };
}
