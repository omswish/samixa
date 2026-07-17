const DEFAULT_HOST = process.env.NUTANIX_HOST || '10.23.50.27';
const DEFAULT_PORT = process.env.NUTANIX_PORT || '9440';
const DEFAULT_POLL_INTERVAL_MS = 30000;

export interface NutanixRuntimeConfig {
  host: string;
  port: string;
  pollIntervalMs: number;
}

function buildRuntimeConfigUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-config/nutanix';
  url.search = '';
  return url.toString();
}

function defaultConfig(): NutanixRuntimeConfig {
  return {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS
  };
}

export async function loadNutanixRuntimeConfig(apiUrl: string): Promise<NutanixRuntimeConfig> {
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
          host?: string | null;
          pollIntervalSeconds?: number | null;
          metadata?: {
            port?: number | string;
          };
        };
      };
    };

    const target = payload.targets?.primary;
    if (!target) {
      return fallback;
    }

    const parsedUrl = target.targetUrl ? new URL(target.targetUrl) : null;
    const metadataPort = target.metadata?.port;
    const resolvedPort = typeof metadataPort === 'number'
      ? String(metadataPort)
      : typeof metadataPort === 'string' && metadataPort
        ? metadataPort
        : (parsedUrl?.port || fallback.port);

    return {
      host: target.host || parsedUrl?.hostname || fallback.host,
      port: resolvedPort,
      pollIntervalMs: typeof target.pollIntervalSeconds === 'number' && target.pollIntervalSeconds > 0
        ? target.pollIntervalSeconds * 1000
        : fallback.pollIntervalMs
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-config] Nutanix config fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
