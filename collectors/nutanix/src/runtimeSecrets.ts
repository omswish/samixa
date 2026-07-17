export interface NutanixRuntimeSecrets {
  username: string | null;
  password: string | null;
}

function buildRuntimeSecretsUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = '/api/runtime-secrets/nutanix';
  url.search = '';
  return url.toString();
}

export async function loadNutanixRuntimeSecrets(apiUrl: string): Promise<NutanixRuntimeSecrets> {
  const fallback: NutanixRuntimeSecrets = {
    username: process.env.NUTANIX_USER ?? null,
    password: process.env.NUTANIX_PASS ?? null
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
      targets?: {
        primary?: {
          username?: string | null;
          password?: string | null;
        };
      };
    };

    const target = payload.targets?.primary;
    return {
      username: target?.username ?? fallback.username,
      password: target?.password ?? fallback.password
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-secrets] Nutanix secrets fetch failed. Falling back to env/defaults: ${message}`);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
