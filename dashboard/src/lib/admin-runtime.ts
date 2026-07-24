import { execFile, spawn } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CollectorTargetSettings {
  configKey: string | null;
  targetName: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  username: string | null;
  passwordConfigured: boolean;
  configOrigin: string;
  secretOrigin: string;
  password?: string;
  clearPassword?: boolean;
}

export interface AdminSettingsPayload {
  collectors: {
    nutanix: {
      primary: CollectorTargetSettings;
    };
    solarwinds: {
      servers: CollectorTargetSettings;
      networks: CollectorTargetSettings;
    };
    symphony: {
      primary: CollectorTargetSettings;
    };
  };
}

type GatewayHealthEntry = {
  status: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
};

type DashboardGatewayState = {
  sections?: Record<string, GatewayHealthEntry>;
  sources?: Record<string, GatewayHealthEntry>;
};

type ServiceDefinition = {
  id: string;
  displayName: string;
  exposedToLan: boolean;
  listen: string | null;
  startupOrder: number;
  healthKind: 'http' | 'logical';
  healthTarget: string;
  notes: string;
};

type SessionWorkflowDefinition = {
  id: 'symphony' | 'solarwinds';
  displayName: string;
  targets: Array<{
    id: string;
    label: string;
    path: string;
    probeUrl: string | null;
    probeKind: 'symphony' | 'solarwinds';
  }>;
};

export type ServiceSnapshot = ServiceDefinition & {
  processStatus: string;
  overallStatus: 'online' | 'warning' | 'error' | 'stopped' | 'unknown';
  healthStatus: string;
  healthSummary: string;
  pid: number | null;
  uptime: string | null;
  lastSync: string | null;
  lastError: string | null;
};

export type SessionSnapshot = SessionWorkflowDefinition & {
  overallStatus: 'authenticated' | 'partial' | 'missing' | 'invalid' | 'expired' | 'unreachable';
  summary: string;
  targets: Array<SessionWorkflowDefinition['targets'][number] & {
    exists: boolean;
    valid: boolean;
    sizeBytes: number | null;
    updatedAt: string | null;
    issue: string | null;
    authStatus: 'authenticated' | 'missing' | 'invalid' | 'expired' | 'unreachable';
    authSummary: string | null;
    validatedAt: string | null;
    finalUrl: string | null;
    httpStatus: number | null;
  }>;
};

type StorageStateCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  expires?: number;
};

type StorageStatePayload = {
  cookies: StorageStateCookie[];
};

type SessionTargetInspection = {
  exists: boolean;
  valid: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
  issue: string | null;
  storageState: StorageStatePayload | null;
};

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';
const INTERNAL_GATEWAY_STATUS_URL = process.env.INTERNAL_GATEWAY_STATUS_URL || 'http://127.0.0.1:4000/api/status';
const DASHBOARD_INTERNAL_PORT = Number(process.env.PORT || 3001);
const OPERATOR_PORT = Number(process.env.OPERATOR_FRONTDOOR_PORT || 21060);
const ADMIN_PORT = Number(process.env.ADMIN_FRONTDOOR_PORT || 21061);
const DEFAULT_RUNTIME_ROOT =
  process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'ITDashboard');

function findProjectRoot(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);

  while (true) {
    if (fs.existsSync(path.join(current, 'ecosystem.config.js'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDirectory, '..');
    }

    current = parent;
  }
}

function stripUtf8Bom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    hour12: false,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseUrlHost(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function parseListenLabel(value: string, fallback: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}`;
  } catch {
    return fallback;
  }
}

function getProjectRoot() {
  return findProjectRoot();
}

function getInstallRootCandidates() {
  const projectRoot = getProjectRoot();
  const candidates = [projectRoot];
  const parent = path.dirname(projectRoot);

  if (parent !== projectRoot) {
    candidates.push(parent);
  }

  return [...new Set(candidates)];
}

function getAppRoot() {
  return getProjectRoot();
}

function getPm2Environment(nodeCandidate: string) {
  const pathEntries = [process.env.PATH || process.env.Path || ''];
  if (nodeCandidate !== 'node') {
    pathEntries.unshift(path.dirname(nodeCandidate));
  }

  return {
    ...process.env,
    ITDASH_RUNTIME_ROOT: DEFAULT_RUNTIME_ROOT,
    PM2_HOME: path.join(DEFAULT_RUNTIME_ROOT, 'pm2'),
    PATH: pathEntries.filter(Boolean).join(';')
  };
}

function getBundledNodeCandidates() {
  const installRoots = getInstallRootCandidates();
  return [
    ...installRoots.map((candidate) => path.join(candidate, 'runtime', 'node', 'node.exe')),
    'node'
  ];
}

function getPm2ExecutableCandidates() {
  const installRoots = getInstallRootCandidates();
  const appData = process.env.APPDATA;

  return [
    ...installRoots.flatMap((candidate) => [
      path.join(candidate, 'node_modules', 'pm2', 'bin', 'pm2'),
      path.join(candidate, 'runtime-tools', 'node_modules', 'pm2', 'bin', 'pm2'),
      path.join(candidate, 'runtime', 'node', 'node_modules', 'pm2', 'bin', 'pm2')
    ]),
    appData ? path.join(appData, 'npm', 'node_modules', 'pm2', 'bin', 'pm2') : null
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function fileLooksUsable(candidate: string) {
  if (candidate === 'node') {
    return true;
  }

  return fs.existsSync(candidate);
}

async function runPm2(args: string[]) {
  const scriptCandidates = getPm2ExecutableCandidates().filter(fileLooksUsable);
  const nodeCandidates = getBundledNodeCandidates().filter(fileLooksUsable);
  let lastError: Error | null = null;

  for (const scriptCandidate of scriptCandidates) {
    for (const nodeCandidate of nodeCandidates) {
      try {
        return await execFileAsync(nodeCandidate, [scriptCandidate, ...args], {
          cwd: getAppRoot(),
          env: getPm2Environment(nodeCandidate),
          windowsHide: true,
          maxBuffer: 5 * 1024 * 1024
        });
      } catch (error: any) {
        lastError = error;
      }
    }
  }

  throw lastError ?? new Error('Unable to locate a usable PM2 runtime.');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status} from ${url}`);
  }

  return JSON.parse(text) as T;
}

export async function loadAdminSettings(): Promise<AdminSettingsPayload> {
  return fetchJson<AdminSettingsPayload>(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
    cache: 'no-store'
  });
}

export async function saveAdminSettings(payload: AdminSettingsPayload): Promise<AdminSettingsPayload> {
  return fetchJson<AdminSettingsPayload>(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

async function loadGatewayState(): Promise<DashboardGatewayState | null> {
  try {
    return await fetchJson<DashboardGatewayState>(INTERNAL_GATEWAY_STATUS_URL);
  } catch {
    return null;
  }
}

async function loadPm2Processes() {
  const { stdout } = await runPm2(['jlist']);
  const parsed = JSON.parse(stdout) as Array<{
    name?: string;
    pid?: number;
    pm2_env?: {
      status?: string;
      pm_uptime?: number;
    };
  }>;

  const processMap = new Map<string, {
    processStatus: string;
    pid: number | null;
    uptime: string | null;
  }>();

  for (const entry of parsed) {
    if (!entry.name) {
      continue;
    }

    processMap.set(entry.name, {
      processStatus: entry.pm2_env?.status || 'unknown',
      pid: typeof entry.pid === 'number' && entry.pid > 0 ? entry.pid : null,
      uptime: typeof entry.pm2_env?.pm_uptime === 'number'
        ? formatDuration(Date.now() - entry.pm2_env.pm_uptime)
        : null
    });
  }

  return processMap;
}

function getServiceDefinitions(): ServiceDefinition[] {
  const gatewayListen = parseListenLabel(INTERNAL_GATEWAY_BASE_URL, '127.0.0.1:4000');

  return [
    {
      id: 'api-gateway',
      displayName: 'API Gateway',
      exposedToLan: false,
      listen: gatewayListen,
      startupOrder: 1,
      healthKind: 'http',
      healthTarget: INTERNAL_GATEWAY_STATUS_URL,
      notes: 'Central ingest, runtime config, and websocket source.'
    },
    {
      id: 'dashboard-ui',
      displayName: 'Dashboard UI',
      exposedToLan: false,
      listen: `127.0.0.1:${DASHBOARD_INTERNAL_PORT}`,
      startupOrder: 2,
      healthKind: 'http',
      healthTarget: `http://127.0.0.1:${DASHBOARD_INTERNAL_PORT}/login`,
      notes: 'Shared Next.js application for operator and admin surfaces.'
    },
    {
      id: 'dashboard-frontdoor-operator',
      displayName: 'Operator Frontdoor',
      exposedToLan: true,
      listen: `0.0.0.0:${OPERATOR_PORT}`,
      startupOrder: 3,
      healthKind: 'http',
      healthTarget: `http://127.0.0.1:${OPERATOR_PORT}/login`,
      notes: 'Operator-facing wallboard entry point.'
    },
    {
      id: 'dashboard-frontdoor-admin',
      displayName: 'Admin Frontdoor',
      exposedToLan: true,
      listen: `0.0.0.0:${ADMIN_PORT}`,
      startupOrder: 4,
      healthKind: 'http',
      healthTarget: `http://127.0.0.1:${ADMIN_PORT}/login`,
      notes: 'Admin web console entry point.'
    },
    {
      id: 'nutanix-collector',
      displayName: 'Nutanix Collector',
      exposedToLan: false,
      listen: null,
      startupOrder: 5,
      healthKind: 'logical',
      healthTarget: 'source:nutanix',
      notes: 'Primary truth source for HCI VM telemetry.'
    },
    {
      id: 'solarwinds-collector',
      displayName: 'SolarWinds Collector',
      exposedToLan: false,
      listen: null,
      startupOrder: 6,
      healthKind: 'logical',
      healthTarget: 'source:solarwinds',
      notes: 'Network and on-prem server telemetry.'
    },
    {
      id: 'symphony-collector',
      displayName: 'HSD Collector',
      exposedToLan: false,
      listen: null,
      startupOrder: 7,
      healthKind: 'logical',
      healthTarget: 'source:symphony',
      notes: 'HSD data collector and session-dependent scraper.'
    }
  ];
}

function deriveLogicalHealth(
  gatewayState: DashboardGatewayState | null,
  target: string
): Pick<ServiceSnapshot, 'healthStatus' | 'healthSummary' | 'lastSync' | 'lastError' | 'overallStatus'> {
  if (!gatewayState) {
    return {
      healthStatus: 'gateway-unavailable',
      healthSummary: 'Gateway state unavailable',
      lastSync: null,
      lastError: null,
      overallStatus: 'unknown'
    };
  }

  const [scope, key] = target.split(':', 2);
  const entry = scope === 'section'
    ? gatewayState.sections?.[key]
    : gatewayState.sources?.[key];

  if (!entry) {
    return {
      healthStatus: 'missing',
      healthSummary: 'No runtime health data found',
      lastSync: null,
      lastError: null,
      overallStatus: 'unknown'
    };
  }

  const lastError = entry.lastError || null;
  const lastSync = formatTimestamp(entry.lastSuccessAt || null);
  const status = entry.status || 'unknown';

  if (status === 'ok') {
    return {
      healthStatus: status,
      healthSummary: 'Healthy',
      lastSync,
      lastError,
      overallStatus: 'online'
    };
  }

  if (status === 'partial' || status === 'stale') {
    return {
      healthStatus: status,
      healthSummary: status === 'partial' ? 'Partial coverage' : 'Data stale',
      lastSync,
      lastError,
      overallStatus: 'warning'
    };
  }

  if (status === 'error') {
    return {
      healthStatus: status,
      healthSummary: 'Collector error',
      lastSync,
      lastError,
      overallStatus: 'error'
    };
  }

  return {
    healthStatus: status,
    healthSummary: 'Waiting for first successful sync',
    lastSync,
    lastError,
    overallStatus: 'warning'
  };
}

async function deriveHttpHealth(
  target: string
): Promise<Pick<ServiceSnapshot, 'healthStatus' | 'healthSummary' | 'lastSync' | 'lastError' | 'overallStatus'>> {
  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(5000)
    });

    const ok = response.status >= 200 && response.status < 500;
    return {
      healthStatus: ok ? 'ok' : `http-${response.status}`,
      healthSummary: `HTTP ${response.status}`,
      lastSync: formatTimestamp(new Date().toISOString()),
      lastError: null,
      overallStatus: ok ? 'online' : 'error'
    };
  } catch (error: any) {
    return {
      healthStatus: 'unreachable',
      healthSummary: 'Unreachable',
      lastSync: null,
      lastError: error?.message || 'Health probe failed.',
      overallStatus: 'error'
    };
  }
}

export async function collectServiceSnapshots(): Promise<ServiceSnapshot[]> {
  const [processes, gatewayState] = await Promise.all([
    loadPm2Processes().catch(() => new Map<string, { processStatus: string; pid: number | null; uptime: string | null }>()),
    loadGatewayState()
  ]);

  return Promise.all(
    getServiceDefinitions()
      .sort((left, right) => left.startupOrder - right.startupOrder)
      .map(async (service) => {
        const processInfo = processes.get(service.id) ?? {
          processStatus: 'not-found',
          pid: null,
          uptime: null
        };

        const healthInfo = service.healthKind === 'http'
          ? await deriveHttpHealth(service.healthTarget)
          : deriveLogicalHealth(gatewayState, service.healthTarget);

        let overallStatus = healthInfo.overallStatus;
        if (processInfo.processStatus !== 'online') {
          overallStatus = processInfo.processStatus === 'stopped' || processInfo.processStatus === 'not-found'
            ? 'stopped'
            : 'error';
        }

        return {
          ...service,
          processStatus: processInfo.processStatus,
          overallStatus,
          healthStatus: healthInfo.healthStatus,
          healthSummary: healthInfo.healthSummary,
          pid: processInfo.pid,
          uptime: processInfo.uptime,
          lastSync: healthInfo.lastSync,
          lastError: healthInfo.lastError
        };
      })
  );
}

function getSessionWorkflowDefinitions(settings: AdminSettingsPayload | null): SessionWorkflowDefinition[] {
  const symphonyUrl = settings?.collectors.symphony.primary.targetUrl
    || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
  const solarwindsServersUrl = settings?.collectors.solarwinds.servers.targetUrl
    || `http://${settings?.collectors.solarwinds.servers.host || '10.36.91.45'}/Orion/SummaryView.aspx?ViewID=1`;
  const solarwindsNetworksUrl = settings?.collectors.solarwinds.networks.targetUrl
    || `http://${settings?.collectors.solarwinds.networks.host || '10.36.91.46'}/Orion/SummaryView.aspx?ViewID=1`;

  return [
    {
      id: 'symphony',
      displayName: 'HSD Session',
      targets: [
        {
          id: 'primary',
          label: 'Primary session file',
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'symphony', 'symphony-storage-state.json'),
          probeUrl: symphonyUrl,
          probeKind: 'symphony'
        }
      ]
    },
    {
      id: 'solarwinds',
      displayName: 'SolarWinds Session',
      targets: [
        {
          id: 'servers',
          label: 'Servers portal session',
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'solarwinds', 'solarwinds-servers-storage-state.json'),
          probeUrl: solarwindsServersUrl,
          probeKind: 'solarwinds'
        },
        {
          id: 'networks',
          label: 'Networks portal session',
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'solarwinds', 'solarwinds-networks-storage-state.json'),
          probeUrl: solarwindsNetworksUrl,
          probeKind: 'solarwinds'
        }
      ]
    }
  ];
}

function isStorageState(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  return Array.isArray((payload as { cookies?: unknown }).cookies);
}

async function inspectSessionTarget(targetPath: string) {
  try {
    const stats = await fsp.stat(targetPath);
    const raw = stripUtf8Bom(await fsp.readFile(targetPath, 'utf8'));
    const parsed = JSON.parse(raw);
    const valid = isStorageState(parsed);
    return {
      exists: true,
      valid,
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      issue: valid ? null : 'File is not a valid Playwright storage-state payload.',
      storageState: valid ? parsed as StorageStatePayload : null
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        valid: false,
        sizeBytes: null,
        updatedAt: null,
        issue: 'File not found.',
        storageState: null
      };
    }

    return {
      exists: true,
      valid: false,
      sizeBytes: null,
      updatedAt: null,
      issue: error?.message || 'Unable to read file.',
      storageState: null
    };
  }
}

function cookieDomainMatches(hostname: string, cookieDomain: string | undefined) {
  if (!cookieDomain) {
    return false;
  }

  const normalizedCookieDomain = cookieDomain.replace(/^\./, '').toLowerCase();
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === normalizedCookieDomain || normalizedHostname.endsWith(`.${normalizedCookieDomain}`);
}

function cookiePathMatches(pathname: string, cookiePath: string | undefined) {
  const normalizedCookiePath = cookiePath || '/';
  return pathname.startsWith(normalizedCookiePath);
}

function buildCookieHeaderForUrl(storageState: StorageStatePayload, targetUrl: string) {
  const url = new URL(targetUrl);
  const nowSeconds = Math.floor(Date.now() / 1000);

  return storageState.cookies
    .filter((cookie) => {
      if (!cookie.name) {
        return false;
      }

      if (typeof cookie.expires === 'number' && cookie.expires > 0 && cookie.expires <= nowSeconds) {
        return false;
      }

      if (cookie.secure && url.protocol !== 'https:') {
        return false;
      }

      return cookieDomainMatches(url.hostname, cookie.domain) && cookiePathMatches(url.pathname, cookie.path);
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function normalizeBodyText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function validateSessionTarget(
  target: SessionWorkflowDefinition['targets'][number],
  inspection: SessionTargetInspection
) {
  if (!inspection.exists) {
    return {
      authStatus: 'missing' as const,
      authSummary: 'Session file is missing.',
      validatedAt: null,
      finalUrl: null,
      httpStatus: null
    };
  }

  if (!inspection.valid || !inspection.storageState) {
    return {
      authStatus: 'invalid' as const,
      authSummary: inspection.issue || 'Session file is not a valid storage-state payload.',
      validatedAt: null,
      finalUrl: null,
      httpStatus: null
    };
  }

  if (!target.probeUrl) {
    return {
      authStatus: 'unreachable' as const,
      authSummary: 'No probe URL configured for this session target.',
      validatedAt: null,
      finalUrl: null,
      httpStatus: null
    };
  }

  const cookieHeader = buildCookieHeaderForUrl(inspection.storageState, target.probeUrl);
  if (!cookieHeader) {
    return {
      authStatus: 'expired' as const,
      authSummary: 'No usable cookies matched the configured target URL.',
      validatedAt: new Date().toISOString(),
      finalUrl: null,
      httpStatus: null
    };
  }

  try {
    const response = await fetch(target.probeUrl, {
      headers: {
        cookie: cookieHeader,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });

    const finalUrl = response.url || target.probeUrl;
    const body = normalizeBodyText(await response.text());
    const finalUrlLower = finalUrl.toLowerCase();
    const validatedAt = new Date().toISOString();

    if (response.status >= 500) {
      return {
        authStatus: 'unreachable' as const,
        authSummary: `Probe returned HTTP ${response.status}.`,
        validatedAt,
        finalUrl,
        httpStatus: response.status
      };
    }

    if (target.probeKind === 'symphony') {
      const redirectedToLogin = finalUrlLower.includes('login.microsoftonline.com')
        || finalUrlLower.includes('/login')
        || finalUrlLower.includes('/saml2');
      const loginBodyDetected = body.includes('sign in to your account')
        || body.includes('session has expired')
        || body.includes('your session has expired')
        || body.includes('please login')
        || body.includes('convergedsignin');
      const dashboardDetected = body.includes('myworkgroupcount')
        || body.includes('mdlincidentmgmt')
        || body.includes('sde_dashboard');

      if (redirectedToLogin || loginBodyDetected) {
        return {
          authStatus: 'expired' as const,
          authSummary: 'Portal redirected to Microsoft sign-in. The saved HSD session has expired.',
          validatedAt,
          finalUrl,
          httpStatus: response.status
        };
      }

      if (dashboardDetected) {
        return {
          authStatus: 'authenticated' as const,
          authSummary: 'Authenticated against the live HSD dashboard.',
          validatedAt,
          finalUrl,
          httpStatus: response.status
        };
      }
    }

    if (target.probeKind === 'solarwinds') {
      const redirectedToLogin = finalUrlLower.includes('/orion/login.aspx');
      const loginBodyDetected = body.includes('problem authorizing the specified windows account')
        || body.includes('log in to solarwinds')
        || body.includes('remember me next time')
        || body.includes('__viewstate')
        && body.includes('password');
      const dashboardDetected = body.includes('orion summary home')
        || body.includes('needszebrastripes')
        || body.includes('sw-custom-query-table');

      if (redirectedToLogin || loginBodyDetected) {
        return {
          authStatus: 'expired' as const,
          authSummary: 'Portal returned the SolarWinds login page. The saved session has expired.',
          validatedAt,
          finalUrl,
          httpStatus: response.status
        };
      }

      if (dashboardDetected) {
        return {
          authStatus: 'authenticated' as const,
          authSummary: 'Authenticated against the live SolarWinds portal.',
          validatedAt,
          finalUrl,
          httpStatus: response.status
        };
      }
    }

    return {
      authStatus: 'unreachable' as const,
      authSummary: `Received HTTP ${response.status}, but the portal response did not confirm an authenticated session.`,
      validatedAt,
      finalUrl,
      httpStatus: response.status
    };
  } catch (error: any) {
    return {
      authStatus: 'unreachable' as const,
      authSummary: error?.message || 'Authentication probe failed.',
      validatedAt: new Date().toISOString(),
      finalUrl: null,
      httpStatus: null
    };
  }
}

function buildSessionWorkflowSummary(
  overallStatus: SessionSnapshot['overallStatus'],
  targets: Array<SessionSnapshot['targets'][number]>
) {
  if (overallStatus === 'authenticated') {
    return 'Saved session is authenticated against the live portal.';
  }

  if (overallStatus === 'missing') {
    return 'Session files are missing.';
  }

  if (overallStatus === 'invalid') {
    return 'Session files exist, but the storage-state payload is invalid.';
  }

  if (overallStatus === 'expired') {
    return 'Saved session files exist, but authentication has expired and needs reauthentication.';
  }

  if (overallStatus === 'unreachable') {
    return 'Session files were found, but the live portal could not be confirmed from this host.';
  }

  const authenticatedCount = targets.filter((target) => target.authStatus === 'authenticated').length;
  return `${authenticatedCount}/${targets.length} session target(s) authenticated against the live portal.`;
}

export async function collectSessionSnapshots(): Promise<SessionSnapshot[]> {
  const settings = await loadAdminSettings().catch(() => null);

  return Promise.all(getSessionWorkflowDefinitions(settings).map(async (workflow) => {
    const targets = await Promise.all(workflow.targets.map(async (target) => {
      const inspection = await inspectSessionTarget(target.path);
      const validation = await validateSessionTarget(target, inspection);
      return {
        ...target,
        exists: inspection.exists,
        valid: inspection.valid,
        sizeBytes: inspection.sizeBytes,
        updatedAt: inspection.updatedAt,
        issue: inspection.issue,
        authStatus: validation.authStatus,
        authSummary: validation.authSummary,
        validatedAt: validation.validatedAt,
        finalUrl: validation.finalUrl,
        httpStatus: validation.httpStatus
      };
    }));

    const authStatuses = targets.map((target) => target.authStatus);
    let overallStatus: SessionSnapshot['overallStatus'] = 'partial';
    if (authStatuses.length > 0 && authStatuses.every((status) => status === 'authenticated')) {
      overallStatus = 'authenticated';
    } else if (authStatuses.every((status) => status === 'missing')) {
      overallStatus = 'missing';
    } else if (authStatuses.every((status) => status === 'invalid')) {
      overallStatus = 'invalid';
    } else if (authStatuses.every((status) => status === 'expired')) {
      overallStatus = 'expired';
    } else if (authStatuses.every((status) => status === 'unreachable')) {
      overallStatus = 'unreachable';
    }

    return {
      ...workflow,
      overallStatus,
      summary: buildSessionWorkflowSummary(overallStatus, targets),
      targets
    };
  }));
}

async function backupFileIfExists(targetPath: string) {
  try {
    const existing = await fsp.readFile(targetPath);
    const backupDir = path.join(path.dirname(targetPath), 'backups');
    await fsp.mkdir(backupDir, { recursive: true });
    const extension = path.extname(targetPath) || '.json';
    const backupName = `${path.basename(targetPath, extension)}-${Date.now()}${extension}`;
    await fsp.writeFile(path.join(backupDir, backupName), existing);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function importSessionWorkflow(workflowId: SessionWorkflowDefinition['id'], storageState: unknown) {
  if (!isStorageState(storageState)) {
    throw new Error('Uploaded file is not a valid Playwright storage-state payload.');
  }

  const workflow = getSessionWorkflowDefinitions(null).find((entry) => entry.id === workflowId);
  if (!workflow) {
    throw new Error(`Unknown session workflow: ${workflowId}`);
  }

  for (const target of workflow.targets) {
    await fsp.mkdir(path.dirname(target.path), { recursive: true });
    await backupFileIfExists(target.path);
    await fsp.writeFile(target.path, JSON.stringify(storageState, null, 2), 'utf8');
  }

  return {
    ok: true,
    message: `Imported ${workflow.displayName} to ${workflow.targets.length} target file(s).`
  };
}

function escapePowerShellSingleQuoted(value: string) {
  return value.replaceAll("'", "''");
}

async function getInteractiveWindowsUser() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    "$user = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName; if ($user) { Write-Output $user }"
  ], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  const trimmed = stdout.trim();
  return trimmed || null;
}

async function launchInteractivePowerShellTask(helperScriptPath: string) {
  const activeUser = await getInteractiveWindowsUser();
  if (!activeUser) {
    throw new Error('No interactive Windows session is available on the server. Sign in locally or through RDP, then retry reauthentication.');
  }

  const taskName = 'UAIL IT Dashboard Interactive Helper';
  const escapedTaskName = escapePowerShellSingleQuoted(taskName);
  const escapedActiveUser = escapePowerShellSingleQuoted(activeUser);
  const escapedHelperScriptPath = escapePowerShellSingleQuoted(helperScriptPath);
  const powershellArgs = `-NoExit -ExecutionPolicy Bypass -File ""${helperScriptPath}""`;
  const escapedPowerShellArgs = escapePowerShellSingleQuoted(powershellArgs);

  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      `$taskName = '${escapedTaskName}'`,
      `$activeUser = '${escapedActiveUser}'`,
      `$helperScriptPath = '${escapedHelperScriptPath}'`,
      `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '${escapedPowerShellArgs}'`,
      `$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(5))`,
      `$principal = New-ScheduledTaskPrincipal -UserId $activeUser -LogonType Interactive -RunLevel Highest`,
      `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable`,
      `Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null`,
      `Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null`,
      `Start-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null`
    ].join('; ')
  ], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  return activeUser;
}

function resolveCollectorLoginScript(workflowId: SessionWorkflowDefinition['id']) {
  const projectRoot = getAppRoot();
  if (workflowId === 'symphony') {
    return path.join(projectRoot, 'collectors', 'symphony', 'dist', 'login.js');
  }

  return path.join(projectRoot, 'collectors', 'solarwinds', 'dist', 'login.js');
}

function findNodeExecutable() {
  const candidates = getBundledNodeCandidates().filter(fileLooksUsable);
  if (candidates.length === 0) {
    throw new Error('Unable to locate a usable Node executable for session reauthentication.');
  }

  return candidates[0];
}

async function stopServiceIfRunning(serviceId: string) {
  const processMap = await loadPm2Processes();
  const service = processMap.get(serviceId);

  if (!service) {
    throw new Error(`Service ${serviceId} is not registered in PM2.`);
  }

  if (service.processStatus === 'stopped') {
    return {
      serviceId,
      alreadyStopped: true
    };
  }

  await runPm2(['stop', serviceId]);
  return {
    serviceId,
    alreadyStopped: false
  };
}

export async function launchSessionHelper(
  workflowId: SessionWorkflowDefinition['id'],
  mode: 'interactive' | 'legacy-profile' = 'interactive'
) {
  if (mode === 'legacy-profile' && workflowId !== 'symphony') {
    throw new Error('Legacy profile import is supported only for HSD/Symphony.');
  }

  const settings = await loadAdminSettings().catch(() => null);
  const nodeExe = findNodeExecutable();
  const scriptPath = resolveCollectorLoginScript(workflowId);
  const projectRoot = getAppRoot();
  let preLaunchMessage: string | null = null;

  if (!fs.existsSync(scriptPath) && nodeExe !== 'node') {
    throw new Error(`Login helper script not found for ${workflowId}.`);
  }

  if (workflowId === 'symphony') {
    const stopResult = await stopServiceIfRunning('symphony-collector');
    preLaunchMessage = stopResult.alreadyStopped
      ? 'HSD Collector was already stopped.'
      : 'Stopped HSD Collector before launching reauthentication.';
  }

  const scriptLines = [
    `$Host.UI.RawUI.WindowTitle = '${mode === 'legacy-profile'
      ? 'UAIL IT Dashboard Legacy Session Import'
      : 'UAIL IT Dashboard Session Reauthentication'}'`,
    `$env:ITDASH_RUNTIME_ROOT = '${escapePowerShellSingleQuoted(DEFAULT_RUNTIME_ROOT)}'`
  ];

  if (workflowId === 'symphony') {
    const targetUrl = settings?.collectors.symphony.primary.targetUrl || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
    scriptLines.push(`$env:SYM_URL = '${escapePowerShellSingleQuoted(targetUrl)}'`);
  } else {
    const serversHost = settings?.collectors.solarwinds.servers.host
      || parseUrlHost(settings?.collectors.solarwinds.servers.targetUrl)
      || '10.36.91.45';
    const networksHost = settings?.collectors.solarwinds.networks.host
      || parseUrlHost(settings?.collectors.solarwinds.networks.targetUrl)
      || '10.36.91.46';
    scriptLines.push(`$env:SW_HOST_SERVERS = '${escapePowerShellSingleQuoted(serversHost)}'`);
    scriptLines.push(`$env:SW_HOST_NETWORKS = '${escapePowerShellSingleQuoted(networksHost)}'`);
  }

  scriptLines.push(`Set-Location -LiteralPath '${escapePowerShellSingleQuoted(projectRoot)}'`);
  const nodeCommandParts = [
    `& '${escapePowerShellSingleQuoted(nodeExe)}'`,
    `'${escapePowerShellSingleQuoted(scriptPath)}'`
  ];
  if (mode === 'legacy-profile') {
    nodeCommandParts.push("'--import-legacy-profile'");
  }
  scriptLines.push(nodeCommandParts.join(' '));

  const helperDir = path.join(DEFAULT_RUNTIME_ROOT, 'admin', 'reauth');
  await fsp.mkdir(helperDir, { recursive: true });

  const helperScriptPath = path.join(
    helperDir,
    `${workflowId}-${mode === 'legacy-profile' ? 'legacy-import' : 'reauth'}-${Date.now()}.ps1`
  );

  await fsp.writeFile(helperScriptPath, `${scriptLines.join('\r\n')}\r\n`, 'utf8');

  let launchNote = '';
  try {
    const activeUser = await launchInteractivePowerShellTask(helperScriptPath);
    launchNote = ` Launched the helper in the interactive Windows session for ${activeUser}.`;
  } catch (interactiveLaunchError: any) {
    const child = spawn('cmd.exe', [
      '/c',
      'start',
      '""',
      'powershell.exe',
      '-NoExit',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperScriptPath
    ], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    launchNote = interactiveLaunchError?.message
      ? ` Direct helper launch fallback was used because the interactive task launcher could not be prepared: ${interactiveLaunchError.message}`
      : ' Direct helper launch fallback was used.';
  }

  return {
    ok: true,
    message: workflowId === 'symphony'
      ? `${preLaunchMessage} ${mode === 'legacy-profile'
        ? `Launched HSD legacy-profile import helper. Complete the import on the server, then restart HSD Collector from Services.${launchNote}`
        : `Launched HSD interactive reauthentication helper. Complete the HSD login on the server, then restart HSD Collector from Services.${launchNote}`}`
      : `Launched SolarWinds interactive reauthentication helper.${launchNote}`
  };
}

export async function runServiceAction(action: 'start' | 'stop' | 'restart' | 'restart-all', target: string) {
  if (action === 'restart-all') {
    await runPm2(['restart', 'ecosystem.config.js', '--update-env']);
    return {
      ok: true,
      message: 'Restarted the full dashboard stack through PM2.'
    };
  }

  await runPm2([action, target]);
  return {
    ok: true,
    message: `${action.toUpperCase()} command sent for ${target}.`
  };
}
