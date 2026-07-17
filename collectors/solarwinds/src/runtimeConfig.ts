const DEFAULT_SERVER_HOST = process.env.SW_HOST_SERVERS || '10.36.91.45';
const DEFAULT_NETWORK_HOST = process.env.SW_HOST_NETWORKS || '10.36.91.46';
const DEFAULT_POLL_INTERVAL_MS = 30000;

export type SolarWindsTargetName = 'servers' | 'networks';

export interface SolarWindsTargetRuntimeConfig {
  host: string;
  targetUrl: string;
  pollIntervalMs: number;
  metadata: Record<string, unknown>;
}

export interface SolarWindsRuntimeConfig {
  pollIntervalMs: number;
  targets: Record<SolarWindsTargetName, SolarWindsTargetRuntimeConfig>;
}

function buildRuntimeConfigUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-config/solarwinds';
  url.search = '';
  return url.toString();
}

function defaultTargetConfig(targetName: SolarWindsTargetName): SolarWindsTargetRuntimeConfig {
  const host = targetName === 'servers' ? DEFAULT_SERVER_HOST : DEFAULT_NETWORK_HOST;
  return {
    host,
    targetUrl: `http://${host}/Orion/SummaryView.aspx?ViewID=1`,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    metadata: {}
  };
}

function defaultConfig(): SolarWindsRuntimeConfig {
  return {
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    targets: {
      servers: defaultTargetConfig('servers'),
      networks: defaultTargetConfig('networks')
    }
  };
}

export async function loadSolarWindsRuntimeConfig(apiUrl: string): Promise<SolarWindsRuntimeConfig> {
  const fallback = defaultConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(buildRuntimeConfigUrl(apiUrl), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`runtime config request failed (${response.status})`);
    }

    const payload = await response.json() as {
      targets?: Partial<Record<SolarWindsTargetName, {
        targetUrl?: string;
        host?: string | null;
        pollIntervalSeconds?: number | null;
        metadata?: Record<string, unknown>;
      }>>;
    };

    const targets: Record<SolarWindsTargetName, SolarWindsTargetRuntimeConfig> = {
      servers: fallback.targets.servers,
      networks: fallback.targets.networks
    };

    for (const targetName of ['servers', 'networks'] as const) {
      const target = payload.targets?.[targetName];
      if (!target) {
        continue;
      }

      const parsedUrl = target.targetUrl ? new URL(target.targetUrl) : null;
      targets[targetName] = {
        host: target.host || parsedUrl?.hostname || fallback.targets[targetName].host,
        targetUrl: target.targetUrl || fallback.targets[targetName].targetUrl,
        pollIntervalMs: typeof target.pollIntervalSeconds === 'number' && target.pollIntervalSeconds > 0
          ? target.pollIntervalSeconds * 1000
          : fallback.targets[targetName].pollIntervalMs,
        metadata: typeof (target as { metadata?: unknown }).metadata === 'object' && (target as { metadata?: unknown }).metadata !== null
          ? (target as { metadata: Record<string, unknown> }).metadata
          : fallback.targets[targetName].metadata
      };
    }

    return {
      pollIntervalMs: Math.min(targets.servers.pollIntervalMs, targets.networks.pollIntervalMs),
      targets
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-config] SolarWinds config fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
