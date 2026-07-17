export interface SolarWindsRuntimeSecrets {
  username: string | null;
  password: string | null;
}

function buildRuntimeSecretsUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-secrets/solarwinds';
  url.search = '';
  return url.toString();
}

export async function loadSolarWindsRuntimeSecrets(apiUrl: string): Promise<SolarWindsRuntimeSecrets> {
  const fallback: SolarWindsRuntimeSecrets = {
    username: process.env.SW_USER ?? null,
    password: process.env.SW_PASS ?? null
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

    const preferredTargets = ['servers', 'networks'];
    for (const targetName of preferredTargets) {
      const target = payload.targets?.[targetName];
      if (target?.username || target?.password) {
        return {
          username: target.username ?? fallback.username,
          password: target.password ?? fallback.password
        };
      }
    }

    return fallback;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-secrets] SolarWinds secrets fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
