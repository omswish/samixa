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
const DEFAULT_NUTANIX_HOST = '10.23.50.27';
const DEFAULT_NUTANIX_PORT = 9440;

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

function hasUrlScheme(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function trimAuthorityInput(value: string | null | undefined) {
  return (value || '')
    .trim()
    .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/, 1)[0]
    .trim();
}

function parsePortValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function parseAuthorityParts(value: string | null | undefined) {
  const authority = trimAuthorityInput(value);
  if (!authority) {
    return { hostname: null, port: null };
  }

  if (authority.startsWith('[')) {
    const closingBracketIndex = authority.indexOf(']');
    if (closingBracketIndex === -1) {
      return { hostname: authority, port: null };
    }

    const hostname = authority.slice(1, closingBracketIndex).trim() || null;
    const remainder = authority.slice(closingBracketIndex + 1);
    const portMatches = [...remainder.matchAll(/:(\d{1,5})/g)];
    return {
      hostname,
      port: parsePortValue(portMatches.at(-1)?.[1] ?? null)
    };
  }

  const segments = authority.split(':').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return { hostname: null, port: null };
  }

  const hostname = segments[0] || null;
  const numericPortSegment = [...segments.slice(1)].reverse().find((segment) => /^\d{1,5}$/.test(segment));
  return {
    hostname,
    port: parsePortValue(numericPortSegment ?? null)
  };
}

function tryParseTargetUrl(value: string | null | undefined, fallbackProtocol: 'http' | 'https'): URL | null {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return null;
  }

  const candidate = hasUrlScheme(trimmed) ? trimmed : `${fallbackProtocol}://${trimmed}`;
  return tryParseUrl(candidate);
}

function resolveHostname(value: string | null | undefined, fallbackProtocol: 'http' | 'https') {
  const parsed = tryParseTargetUrl(value, fallbackProtocol);
  if (parsed?.hostname) {
    return parsed.hostname;
  }

  return parseAuthorityParts(value).hostname;
}

function resolvePort(value: string | null | undefined, fallbackProtocol: 'http' | 'https') {
  const parsed = tryParseTargetUrl(value, fallbackProtocol);
  const parsedPort = parsePortValue(parsed?.port ?? null);
  if (parsedPort !== null) {
    return parsedPort;
  }

  return parseAuthorityParts(value).port;
}

export function normalizeNutanixTargetConfig(input: {
  targetUrl?: string | null;
  host?: string | null;
  metadata?: Record<string, unknown> | null;
  defaultHost?: string;
  defaultPort?: number;
}) {
  const metadata = { ...(input.metadata || {}) };
  const defaultHost = input.defaultHost || DEFAULT_NUTANIX_HOST;
  const defaultPort = input.defaultPort ?? DEFAULT_NUTANIX_PORT;
  const hostname =
    resolveHostname(input.targetUrl, 'https')
    || resolveHostname(input.host, 'https')
    || defaultHost;
  const port =
    parsePortValue(metadata.port)
    ?? resolvePort(input.targetUrl, 'https')
    ?? resolvePort(input.host, 'https')
    ?? defaultPort;

  return {
    targetUrl: `https://${hostname}:${port}`,
    host: hostname,
    port,
    metadata: {
      ...metadata,
      protocol: 'https',
      port,
      allowSelfSigned: metadata.allowSelfSigned ?? true
    }
  };
}

function normalizeGenericTargetConfig(target: {
  sourceName: RuntimeConfigSourceName;
  targetUrl: string;
  host?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (target.sourceName === 'nutanix') {
    const normalized = normalizeNutanixTargetConfig(target);
    return {
      targetUrl: normalized.targetUrl,
      host: normalized.host,
      metadata: normalized.metadata
    };
  }

  return {
    targetUrl: target.targetUrl,
    host: resolveHostname(target.targetUrl || target.host || null, target.sourceName === 'symphony' ? 'https' : 'http')
      || target.host
      || null,
    metadata: { ...(target.metadata || {}) }
  };
}

function buildEnvCollectorTargetSeeds(): CollectorTargetConfigSeed[] {
  const nutanixInput = normalizeNutanixTargetConfig({
    targetUrl: process.env.NUTANIX_HOST || DEFAULT_NUTANIX_HOST,
    host: process.env.NUTANIX_HOST || DEFAULT_NUTANIX_HOST,
    metadata: {
      port: parsePositiveInteger(process.env.NUTANIX_PORT, DEFAULT_NUTANIX_PORT),
      allowSelfSigned: true
    },
    defaultHost: DEFAULT_NUTANIX_HOST,
    defaultPort: DEFAULT_NUTANIX_PORT
  });
  const solarwindsServersHost = process.env.SW_HOST_SERVERS || '10.36.91.45';
  const solarwindsNetworksHost = process.env.SW_HOST_NETWORKS || '10.36.91.46';
  const symphonyUrl = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
  const parsedSymphonyUrl = tryParseUrl(symphonyUrl);

  return [
    {
      configKey: 'nutanix:primary',
      sourceName: 'nutanix',
      targetName: 'primary',
      targetUrl: nutanixInput.targetUrl,
      host: nutanixInput.host,
      enabled: true,
      owner: 'Tech-Unit IT',
      pollIntervalSeconds: 30,
      notes: 'Bootstrap from env. Secrets remain env-backed.',
      metadataJson: nutanixInput.metadata
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
  const normalized = normalizeGenericTargetConfig({
    sourceName: target.sourceName as RuntimeConfigSourceName,
    targetUrl: target.targetUrl,
    host: target.host ?? null,
    metadata: ('metadataJson' in target ? target.metadataJson : {}) ?? {}
  });

  return {
    configKey: target.configKey,
    sourceName: target.sourceName as RuntimeConfigSourceName,
    targetName: target.targetName,
    targetUrl: normalized.targetUrl,
    host: normalized.host ?? null,
    enabled: target.enabled ?? true,
    owner: target.owner ?? null,
    pollIntervalSeconds: target.pollIntervalSeconds ?? null,
    notes: target.notes ?? null,
    metadata: normalized.metadata,
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
