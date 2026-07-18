import {
  bootstrapCollectorTargetConfigNow,
  CollectorTargetConfigRecord,
  CollectorTargetConfigSeed,
  getCollectorTargetConfigsFromPostgres,
  isPostgresMirrorEnabled
} from './postgres';
import { LocalCollectorTargetConfigRecord, readLocalCollectorTargetConfigs } from './localCollectorStore';

export type RuntimeConfigSourceName = 'nutanix' | 'solarwinds' | 'symphony';
type ConfigOrigin = 'env' | 'local' | 'postgres';

export interface RuntimeCollectorTargetConfig {
  configKey: string;
  sourceName: RuntimeConfigSourceName;
  targetName: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  configOrigin: ConfigOrigin;
}

export interface RuntimeCollectorConfigPayload {
  sourceName: RuntimeConfigSourceName;
  resolvedAt: string;
  backingStore: 'env' | 'local' | 'postgres';
  targets: Record<string, RuntimeCollectorTargetConfig>;
}

let collectorConfigBootstrapPromise: Promise<void> | null = null;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function tryParseUrl(value: string | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function buildEnvCollectorTargetSeeds(): CollectorTargetConfigSeed[] {
  const nutanixHost = process.env.NUTANIX_HOST || '10.23.50.27';
  const nutanixPort = parsePositiveInteger(process.env.NUTANIX_PORT, 9440);
  const solarwindsServersHost = process.env.SW_HOST_SERVERS || '10.36.91.45';
  const solarwindsNetworksHost = process.env.SW_HOST_NETWORKS || '10.36.91.46';
  const symphonyUrl = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
  const parsedSymphonyUrl = tryParseUrl(symphonyUrl);

  return [
    {
      configKey: 'nutanix:primary',
      sourceName: 'nutanix',
      targetName: 'primary',
      targetUrl: `https://${nutanixHost}:${nutanixPort}`,
      host: nutanixHost,
      enabled: true,
      owner: 'Tech-Unit IT',
      pollIntervalSeconds: 30,
      notes: 'Bootstrap from env. Secrets remain env-backed.',
      metadataJson: {
        protocol: 'https',
        port: nutanixPort,
        allowSelfSigned: true
      }
    },
    {
      configKey: 'solarwinds:servers',
      sourceName: 'solarwinds',
      targetName: 'servers',
      targetUrl: `http://${solarwindsServersHost}/Orion/SummaryView.aspx?ViewID=1`,
      host: solarwindsServersHost,
      enabled: true,
      owner: 'Tech-Unit IT',
      pollIntervalSeconds: 30,
      notes: 'Bootstrap from env. Secrets remain env-backed.',
      metadataJson: {
        protocol: 'http',
        viewId: 1,
        role: 'servers'
      }
    },
    {
      configKey: 'solarwinds:networks',
      sourceName: 'solarwinds',
      targetName: 'networks',
      targetUrl: `http://${solarwindsNetworksHost}/Orion/SummaryView.aspx?ViewID=1`,
      host: solarwindsNetworksHost,
      enabled: true,
      owner: 'Tech-Unit IT',
      pollIntervalSeconds: 30,
      notes: 'Bootstrap from env. Secrets remain env-backed.',
      metadataJson: {
        protocol: 'http',
        viewId: 1,
        role: 'networks'
      }
    },
    {
      configKey: 'symphony:primary',
      sourceName: 'symphony',
      targetName: 'primary',
      targetUrl: symphonyUrl,
      host: parsedSymphonyUrl?.host ?? null,
      enabled: true,
      owner: 'Tech-Unit IT',
      pollIntervalSeconds: 60,
      notes: 'Bootstrap from env. Secrets remain env-backed.',
      metadataJson: {
        protocol: parsedSymphonyUrl?.protocol.replace(':', '') ?? 'https'
      }
    }
  ];
}

function toRuntimeTarget(
  target: CollectorTargetConfigSeed | CollectorTargetConfigRecord | LocalCollectorTargetConfigRecord,
  configOrigin: ConfigOrigin
): RuntimeCollectorTargetConfig {
  return {
    configKey: target.configKey,
    sourceName: target.sourceName as RuntimeConfigSourceName,
    targetName: target.targetName,
    targetUrl: target.targetUrl,
    host: target.host ?? null,
    enabled: target.enabled ?? true,
    owner: target.owner ?? null,
    pollIntervalSeconds: target.pollIntervalSeconds ?? null,
    notes: target.notes ?? null,
    metadata: ('metadataJson' in target ? target.metadataJson : {}) ?? {},
    configOrigin
  };
}

export async function ensureCollectorTargetConfigBootstrap() {
  if (!isPostgresMirrorEnabled()) {
    return;
  }

  if (!collectorConfigBootstrapPromise) {
    collectorConfigBootstrapPromise = bootstrapCollectorTargetConfigNow(buildEnvCollectorTargetSeeds())
      .catch((error) => {
        collectorConfigBootstrapPromise = null;
        throw error;
      });
  }

  await collectorConfigBootstrapPromise;
}

export async function loadRuntimeCollectorConfig(sourceName: RuntimeConfigSourceName): Promise<RuntimeCollectorConfigPayload> {
  const envTargets = buildEnvCollectorTargetSeeds()
    .filter((seed) => seed.sourceName === sourceName)
    .map((seed) => toRuntimeTarget(seed, 'env'));

  const targets = new Map<string, RuntimeCollectorTargetConfig>(
    envTargets.map((target) => [target.targetName, target])
  );

  let backingStore: 'env' | 'local' | 'postgres' = 'env';

  try {
    const localTargets = readLocalCollectorTargetConfigs(sourceName);
    for (const target of localTargets) {
      targets.set(target.targetName, toRuntimeTarget(target, 'local'));
    }
    if (localTargets.length > 0) {
      backingStore = 'local';
    }
  } catch (error) {
    console.error(`[runtime-config] failed to load local config for ${sourceName}:`, error);
  }

  if (isPostgresMirrorEnabled()) {
    try {
      await ensureCollectorTargetConfigBootstrap();
      const postgresTargets = await getCollectorTargetConfigsFromPostgres(sourceName);
      for (const target of postgresTargets) {
        targets.set(target.targetName, toRuntimeTarget(target, 'postgres'));
      }
      if (postgresTargets.length > 0) {
        backingStore = 'postgres';
      }
    } catch (error) {
      console.error(`[runtime-config] failed to load Postgres config for ${sourceName}:`, error);
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
