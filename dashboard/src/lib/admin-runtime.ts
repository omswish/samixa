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
  overallStatus: 'available' | 'partial' | 'missing' | 'invalid';
  summary: string;
  targets: Array<SessionWorkflowDefinition['targets'][number] & {
    exists: boolean;
    valid: boolean;
    sizeBytes: number | null;
    updatedAt: string | null;
    issue: string | null;
  }>;
};

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';
const INTERNAL_GATEWAY_STATUS_URL = process.env.INTERNAL_GATEWAY_STATUS_URL || 'http://127.0.0.1:4000/api/status';
const DASHBOARD_INTERNAL_PORT = Number(process.env.PORT || 3001);
const OPERATOR_PORT = Number(process.env.OPERATOR_FRONTDOOR_PORT || 21060);
const ADMIN_PORT = Number(process.env.ADMIN_FRONTDOOR_PORT || 21061);
const DEFAULT_RUNTIME_ROOT =
  process.env.ITDASH_RUNTIME_ROOT
  || path.join(process.env.PROGRAMDATA || path.resolve(process.cwd(), 'runtime_data'), 'UAIL', 'itdash');

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

function getProjectRoot() {
  return findProjectRoot();
}

function getBundledNodeCandidates() {
  const projectRoot = getProjectRoot();
  return [
    path.join(projectRoot, 'runtime', 'node', 'node.exe'),
    'node'
  ];
}

function getPm2ExecutableCandidates() {
  const projectRoot = getProjectRoot();
  const appData = process.env.APPDATA;

  return [
    path.join(projectRoot, 'node_modules', 'pm2', 'bin', 'pm2'),
    path.join(projectRoot, 'runtime-tools', 'node_modules', 'pm2', 'bin', 'pm2'),
    path.join(projectRoot, 'runtime', 'node', 'node_modules', 'pm2', 'bin', 'pm2'),
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
          cwd: getProjectRoot(),
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
  return [
    {
      id: 'api-gateway',
      displayName: 'API Gateway',
      exposedToLan: false,
      listen: '127.0.0.1:4000',
      startupOrder: 1,
      healthKind: 'http',
      healthTarget: 'http://127.0.0.1:4000/api/status',
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

function getSessionWorkflowDefinitions(): SessionWorkflowDefinition[] {
  return [
    {
      id: 'symphony',
      displayName: 'HSD Session',
      targets: [
        {
          id: 'primary',
          label: 'Primary session file',
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'symphony', 'symphony-storage-state.json')
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
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'solarwinds', 'solarwinds-servers-storage-state.json')
        },
        {
          id: 'networks',
          label: 'Networks portal session',
          path: path.join(DEFAULT_RUNTIME_ROOT, 'sessions', 'solarwinds', 'solarwinds-networks-storage-state.json')
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
      issue: valid ? null : 'File is not a valid Playwright storage-state payload.'
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        valid: false,
        sizeBytes: null,
        updatedAt: null,
        issue: 'File not found.'
      };
    }

    return {
      exists: true,
      valid: false,
      sizeBytes: null,
      updatedAt: null,
      issue: error?.message || 'Unable to read file.'
    };
  }
}

export async function collectSessionSnapshots(): Promise<SessionSnapshot[]> {
  return Promise.all(getSessionWorkflowDefinitions().map(async (workflow) => {
    const targets = await Promise.all(workflow.targets.map(async (target) => ({
      ...target,
      ...(await inspectSessionTarget(target.path))
    })));

    const validCount = targets.filter((target) => target.valid).length;
    let overallStatus: SessionSnapshot['overallStatus'] = 'missing';
    if (validCount === targets.length && validCount > 0) {
      overallStatus = 'available';
    } else if (validCount > 0) {
      overallStatus = 'partial';
    } else if (targets.some((target) => target.exists)) {
      overallStatus = 'invalid';
    }

    const summary = overallStatus === 'available'
      ? 'Session files are present and valid.'
      : overallStatus === 'partial'
        ? 'Only some target session files are valid.'
        : overallStatus === 'invalid'
          ? 'Session files exist but are not valid storage-state payloads.'
          : 'Session files are missing.';

    return {
      ...workflow,
      overallStatus,
      summary,
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

  const workflow = getSessionWorkflowDefinitions().find((entry) => entry.id === workflowId);
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

function resolveCollectorLoginScript(workflowId: SessionWorkflowDefinition['id']) {
  const projectRoot = getProjectRoot();
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

export async function launchSessionHelper(workflowId: SessionWorkflowDefinition['id']) {
  const settings = await loadAdminSettings().catch(() => null);
  const nodeExe = findNodeExecutable();
  const scriptPath = resolveCollectorLoginScript(workflowId);
  const projectRoot = getProjectRoot();

  if (!fs.existsSync(scriptPath) && nodeExe !== 'node') {
    throw new Error(`Login helper script not found for ${workflowId}.`);
  }

  const envLines = [`$env:ITDASH_RUNTIME_ROOT = '${escapePowerShellSingleQuoted(DEFAULT_RUNTIME_ROOT)}'`];

  if (workflowId === 'symphony') {
    const targetUrl = settings?.collectors.symphony.primary.targetUrl || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
    envLines.push(`$env:SYM_URL = '${escapePowerShellSingleQuoted(targetUrl)}'`);
  } else {
    const serversHost = settings?.collectors.solarwinds.servers.host
      || parseUrlHost(settings?.collectors.solarwinds.servers.targetUrl)
      || '10.36.91.45';
    const networksHost = settings?.collectors.solarwinds.networks.host
      || parseUrlHost(settings?.collectors.solarwinds.networks.targetUrl)
      || '10.36.91.46';
    envLines.push(`$env:SW_HOST_SERVERS = '${escapePowerShellSingleQuoted(serversHost)}'`);
    envLines.push(`$env:SW_HOST_NETWORKS = '${escapePowerShellSingleQuoted(networksHost)}'`);
  }

  envLines.push(`Set-Location -LiteralPath '${escapePowerShellSingleQuoted(projectRoot)}'`);
  envLines.push(`& '${escapePowerShellSingleQuoted(nodeExe)}' '${escapePowerShellSingleQuoted(scriptPath)}'`);

  const child = spawn(
    'powershell.exe',
    [
      '-NoExit',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      envLines.join('; ')
    ],
    {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }
  );
  child.unref();

  return {
    ok: true,
    message: workflowId === 'symphony'
      ? 'Launched HSD interactive reauthentication helper.'
      : 'Launched SolarWinds interactive reauthentication helper.'
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
