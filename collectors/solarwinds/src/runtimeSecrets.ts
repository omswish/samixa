import type { SolarWindsTargetName } from './runtimeConfig';

export interface SolarWindsTargetRuntimeSecrets {
  username: string | null;
  password: string | null;
}

export interface SolarWindsRuntimeSecrets {
  targets: Record<SolarWindsTargetName, SolarWindsTargetRuntimeSecrets>;
}

function buildRuntimeSecretsUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-secrets/solarwinds';
  url.search = '';
  return url.toString();
}

export async function loadSolarWindsRuntimeSecrets(apiUrl: string): Promise<SolarWindsRuntimeSecrets> {
  const fallback: SolarWindsRuntimeSecrets = {
    targets: {
      servers: {
        username: process.env.SW_SERVERS_USER ?? process.env.SW_USER ?? null,
        password: process.env.SW_SERVERS_PASS ?? process.env.SW_PASS ?? null
      },
      networks: {
        username: process.env.SW_NETWORKS_USER ?? process.env.SW_USER ?? null,
        password: process.env.SW_NETWORKS_PASS ?? process.env.SW_PASS ?? null
      }
    }
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(buildRuntimeSecretsUrl(apiUrl), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`runtime secrets request failed (${response.status})`);
    }

    const payload = await response.json() as {
      targets?: Record<string, {
        username?: string | null;
        password?: string | null;
      }>;
    };

    return {
      targets: {
        servers: {
          username: payload.targets?.servers?.username ?? fallback.targets.servers.username,
          password: payload.targets?.servers?.password ?? fallback.targets.servers.password
        },
        networks: {
          username: payload.targets?.networks?.username ?? fallback.targets.networks.username,
          password: payload.targets?.networks?.password ?? fallback.targets.networks.password
        }
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-secrets] SolarWinds secrets fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
