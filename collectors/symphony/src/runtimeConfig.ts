const DEFAULT_TARGET_URL = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
const DEFAULT_POLL_INTERVAL_MS = 60000;

export interface SymphonyRuntimeConfig {
  targetUrl: string;
  pollIntervalMs: number;
}

function buildRuntimeConfigUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-config/symphony';
  url.search = '';
  return url.toString();
}

function defaultConfig(): SymphonyRuntimeConfig {
  return {
    targetUrl: DEFAULT_TARGET_URL,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS
  };
}

export async function loadSymphonyRuntimeConfig(apiUrl: string): Promise<SymphonyRuntimeConfig> {
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
      targets?: {
        primary?: {
          targetUrl?: string;
          pollIntervalSeconds?: number | null;
        };
      };
    };

    const target = payload.targets?.primary;
    if (!target) {
      return fallback;
    }

    return {
      targetUrl: target.targetUrl || fallback.targetUrl,
      pollIntervalMs: typeof target.pollIntervalSeconds === 'number' && target.pollIntervalSeconds > 0
        ? target.pollIntervalSeconds * 1000
        : fallback.pollIntervalMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-config] Symphony config fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
