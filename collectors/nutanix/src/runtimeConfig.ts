const DEFAULT_HOST = process.env.NUTANIX_HOST || '10.23.50.27';
const DEFAULT_PORT = process.env.NUTANIX_PORT || '9440';
const DEFAULT_POLL_INTERVAL_MS = 30000;

export interface NutanixRuntimeConfig {
  host: string;
  port: string;
  baseUrl: string;
  pollIntervalMs: number;
}

function buildRuntimeConfigUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-config/nutanix';
  url.search = '';
  return url.toString();
}

function defaultConfig(): NutanixRuntimeConfig {
  const port = String(DEFAULT_PORT).trim() || '9440';
  const host = normalizeNutanixHost(DEFAULT_HOST, '10.23.50.27');
  return {
    host,
    port,
    baseUrl: `https://${host}:${port}`,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS
  };
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

function parsePortValue(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= 65535 ? String(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? String(parsed) : null;
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

function tryParseUrlLike(value: string | null | undefined) {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function normalizeNutanixHost(value: string | null | undefined, fallback: string) {
  const parsed = tryParseUrlLike(value);
  if (parsed?.hostname) {
    return parsed.hostname;
  }

  return parseAuthorityParts(value).hostname || fallback;
}

function normalizeNutanixPort(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const parsed = parsePortValue(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return parsePortValue(DEFAULT_PORT) || '9440';
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

    const parsedUrl = tryParseUrlLike(target.targetUrl);
    const hostFromParsedTarget = parsedUrl?.hostname || null;
    const hostFromRawTarget = parseAuthorityParts(target.targetUrl).hostname;
    const hostFromStoredHost = normalizeNutanixHost(target.host, fallback.host);
    const metadataPort = target.metadata?.port;
    const resolvedPort = normalizeNutanixPort(
      metadataPort,
      parsedUrl?.port,
      parseAuthorityParts(target.targetUrl).port,
      parseAuthorityParts(target.host).port,
      fallback.port
    );
    const resolvedHost = hostFromParsedTarget || hostFromRawTarget || hostFromStoredHost || fallback.host;

    return {
      host: resolvedHost,
      port: resolvedPort,
      baseUrl: `https://${resolvedHost}:${resolvedPort}`,
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
