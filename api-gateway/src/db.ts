import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

type CollectorSource = 'nutanix' | 'solarwinds' | 'symphony';
type SectionKey = 'nutanix' | 'servers' | 'networks' | 'symphony';
type SectionStatus = 'ok' | 'stale' | 'error' | 'never';
type SourceStatus = SectionStatus | 'partial';
type AssetStatus = 'operational' | 'degraded' | 'down';
type NutanixNodeStatus = 'normal' | 'warning' | 'critical' | 'offline';
type ServerSourceOfTruth = 'nutanix' | 'solarwinds';
type ServerPlatform = 'hci-vm' | 'on-prem';

interface ServerNode {
  id: string;
  name: string;
  location: string;
  status: AssetStatus;
  cpu: number | null;
  memory: number | null;
  disk: string | null;
  backupStatus: 'successful' | 'failed' | 'N/A';
  sourceOfTruth: ServerSourceOfTruth | null;
  platform: ServerPlatform | null;
  solarwindsNodeId: number | null;
  pollingIp: string | null;
  machineType: string | null;
  hardwareType: string | null;
  lastBoot: string | null;
  availabilityToday: number | null;
  history: number[];
  nutanixCpu: number | null;
  nutanixMemory: number | null;
  nutanixDisk: string | null;
  nutanixStatus: AssetStatus | null;
  nutanixHistory: number[];
  solarwindsCpu: number | null;
  solarwindsMemory: number | null;
  solarwindsDisk: string | null;
  solarwindsStatus: AssetStatus | null;
  solarwindsHistory: number[];
  effectiveTelemetrySource?: ServerSourceOfTruth | null;
  usingFallback?: boolean;
}

interface NetworkLink {
  id: string;
  provider: string;
  status: AssetStatus;
  uptime: number;
  latency: number | null;
  utilization: number | null;
  displayName?: string;
  pollingIp?: string;
  interfaceName?: string;
  transmitUtilization?: number | null;
  receiveUtilization?: number | null;
  siteName?: string;
  portSpeed?: string;
  circuitId?: string;
  linkType?: string;
  alias?: string;
  interfaceType?: string;
  ipAddress?: string;
  administrativeStatus?: string;
  operationalStatus?: string;
  lastStatusChange?: string;
  bandwidthReceiveMbps?: number | null;
  bandwidthTransmitMbps?: number | null;
  configuredSpeedMbps?: number | null;
  currentTrafficReceiveMbps?: number | null;
  currentTrafficTransmitMbps?: number | null;
  packetsPerSecondReceive?: number | null;
  packetsPerSecondTransmit?: number | null;
  averagePacketSizeReceive?: number | null;
  averagePacketSizeTransmit?: number | null;
  realtimeTransmitUtilization?: number | null;
  realtimeReceiveUtilization?: number | null;
  dailyTransmitUtilization?: number | null;
  dailyReceiveUtilization?: number | null;
  history: number[];
}

interface NutanixState {
  uptime: string;
  nodesCount: number;
  nodes: Array<{ name: string; status: NutanixNodeStatus }>;
  storageUsage: number;
  historyCpu: number[];
  historyMem: number[];
  physicalMemoryUsage: number;
  logicalMemoryUsage: number;
  storageUsedTib: number;
  storageCapacityTib: number;
  memoryUsedGib: number;
  memoryCapacityGib: number;
}

interface TicketBreakdown {
  new: number;
  assigned: number;
  inProgress: number;
  pending: number;
}

interface SymphonyState {
  openIncidents: number;
  openIncidentsBreakdown: TicketBreakdown;
  serviceRequests: number;
  serviceRequestsBreakdown: TicketBreakdown;
  workOrders: number;
  workOrdersBreakdown: TicketBreakdown;
  changeRecords: number;
  changeRecordsBreakdown: TicketBreakdown;
  priority1Incidents: number;
  priority2Incidents: number;
  onboardingRequests: number;
  securityRequests: number;
  serviceRequestsSla: number;
  incidentsResponseSla: number;
  incidentsResolutionSla: number;
  requestsResponseSla: number;
  requestsResolutionSla: number;
}

interface StoredSectionState {
  key: SectionKey;
  label: string;
  source: CollectorSource;
  pollIntervalMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

interface SectionHealth extends StoredSectionState {
  status: SectionStatus;
}

interface SourceHealth {
  source: CollectorSource;
  label: string;
  sectionKeys: SectionKey[];
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  status: SourceStatus;
}

interface StoredDbSchema {
  servers: ServerNode[];
  networks: NetworkLink[];
  nutanix: NutanixState;
  symphony: SymphonyState;
  sections: Record<SectionKey, StoredSectionState>;
  lastUpdate: string;
}

export interface DbSchema extends Omit<StoredDbSchema, 'sections'> {
  sections: Record<SectionKey, SectionHealth>;
  sources: Record<CollectorSource, SourceHealth>;
}

interface UpdateMeta {
  attemptedAt?: string;
  ok?: boolean;
  error?: string;
}

interface DefaultServerMetadata {
  sourceOfTruth: ServerSourceOfTruth;
  platform: ServerPlatform;
  solarwindsNodeId: number | null;
}

const STATE_KEY = 'dashboard_state';
const SECTION_KEYS: SectionKey[] = ['nutanix', 'servers', 'networks', 'symphony'];
const SOURCE_SECTION_KEYS: Record<CollectorSource, SectionKey[]> = {
  nutanix: ['nutanix'],
  solarwinds: ['servers', 'networks'],
  symphony: ['symphony']
};

const DEFAULT_SERVER_METADATA: Record<string, DefaultServerMetadata> = {
  'HIL-HIDDOR-AV01.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 651 },
  'HIL-HIDDOR-BK01.abgplanet.abg.com': { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: 1028 },
  'HIL-HIDDOR-CSCTS1.abgplanet.abg.com': { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: 311 },
  'HIL-HIDDOR-CSCTS2.abgplanet.abg.com': { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: 319 },
  'HILHIDDORDT0320.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 299 },
  'HIL-HIDDOR-FS01.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 216 },
  'HILHIDDORILMSAP': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 1026 },
  'HILHIDDORILMSDB': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 1027 },
  'HIL-HIDDOR-PIMW.abgplanet.abg.com': { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: 221 },
  'HIL-HIDDOR-PSDM.abgplanet.abg.com': { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: 568 },
  'HIL-HIDDOR-US01.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 1058 },
  'HIL-HIDDOR-US02.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 349 },
  'HIL-HIDDOR-US03.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 347 },
  'HIL-HIDDOR-US04.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 652 },
  'HIL-HIDDOR-US05.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 1024 },
  'HIL-HIDDOR-US06.abgplanet.abg.com': { sourceOfTruth: 'nutanix', platform: 'hci-vm', solarwindsNodeId: 1025 }
};

function createDefaultServer(id: string, name: string): ServerNode {
  const metadata = DEFAULT_SERVER_METADATA[name] ?? { sourceOfTruth: 'solarwinds', platform: 'on-prem', solarwindsNodeId: null };

  return {
    id,
    name,
    location: 'Utkal DC',
    status: 'operational',
    cpu: null,
    memory: null,
    disk: null,
    backupStatus: 'N/A',
    sourceOfTruth: metadata.sourceOfTruth,
    platform: metadata.platform,
    solarwindsNodeId: metadata.solarwindsNodeId,
    pollingIp: null,
    machineType: null,
    hardwareType: null,
    lastBoot: null,
    availabilityToday: null,
    history: [],
    nutanixCpu: null,
    nutanixMemory: null,
    nutanixDisk: null,
    nutanixStatus: null,
    nutanixHistory: [],
    solarwindsCpu: null,
    solarwindsMemory: null,
    solarwindsDisk: null,
    solarwindsStatus: null,
    solarwindsHistory: []
  };
}

const DEFAULT_SERVERS: ServerNode[] = [
  createDefaultServer('sw-srv-1', 'HIL-HIDDOR-AV01.abgplanet.abg.com'),
  createDefaultServer('sw-srv-2', 'HIL-HIDDOR-BK01.abgplanet.abg.com'),
  createDefaultServer('sw-srv-3', 'HIL-HIDDOR-CSCTS1.abgplanet.abg.com'),
  createDefaultServer('sw-srv-4', 'HIL-HIDDOR-CSCTS2.abgplanet.abg.com'),
  createDefaultServer('sw-srv-5', 'HILHIDDORDT0320.abgplanet.abg.com'),
  createDefaultServer('sw-srv-6', 'HIL-HIDDOR-FS01.abgplanet.abg.com'),
  createDefaultServer('sw-srv-7', 'HILHIDDORILMSAP'),
  createDefaultServer('sw-srv-8', 'HILHIDDORILMSDB'),
  createDefaultServer('sw-srv-9', 'HIL-HIDDOR-PIMW.abgplanet.abg.com'),
  createDefaultServer('sw-srv-10', 'HIL-HIDDOR-PSDM.abgplanet.abg.com'),
  createDefaultServer('sw-srv-11', 'HIL-HIDDOR-US01.abgplanet.abg.com'),
  createDefaultServer('sw-srv-12', 'HIL-HIDDOR-US02.abgplanet.abg.com'),
  createDefaultServer('sw-srv-13', 'HIL-HIDDOR-US03.abgplanet.abg.com'),
  createDefaultServer('sw-srv-14', 'HIL-HIDDOR-US04.abgplanet.abg.com'),
  createDefaultServer('sw-srv-15', 'HIL-HIDDOR-US05.abgplanet.abg.com'),
  createDefaultServer('sw-srv-16', 'HIL-HIDDOR-US06.abgplanet.abg.com')
];

const DEFAULT_NETWORKS: NetworkLink[] = [
  { id: 'sw-net-1', provider: 'RJIO (ISP1)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
  { id: 'sw-net-2', provider: 'RailTel (ISP2)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
  { id: 'sw-net-3', provider: 'HIL-UTK-EC-1 (SDWAN-A)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
  { id: 'sw-net-4', provider: 'HIL-UTK-EC-2 (SDWAN-B)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] }
];

const SOURCE_LABELS: Record<CollectorSource, string> = {
  nutanix: 'Nutanix API',
  solarwinds: 'SolarWinds Collector',
  symphony: 'Symphony Collector'
};

const SECTION_TEMPLATES: Record<SectionKey, Omit<StoredSectionState, 'lastAttemptAt' | 'lastSuccessAt' | 'lastError'>> = {
  nutanix: { key: 'nutanix', label: 'Nutanix HCI Cluster Health', source: 'nutanix', pollIntervalMs: 30000 },
  servers: { key: 'servers', label: 'Server Nodes', source: 'solarwinds', pollIntervalMs: 30000 },
  networks: { key: 'networks', label: 'ISP Gateways & SDWAN', source: 'solarwinds', pollIntervalMs: 30000 },
  symphony: { key: 'symphony', label: 'Hindalco Service Desk', source: 'symphony', pollIntervalMs: 60000 }
};
const NUTANIX_FALLBACK_DELAY_MS = 10 * 60 * 1000;

const dbPath = resolveDbPath();
const dbDir = path.dirname(dbPath);
const seedState = loadSeedState(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    state_key TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const selectStateStmt = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?');
const upsertStateStmt = db.prepare(`
  INSERT INTO app_state (state_key, state_json, updated_at)
  VALUES (@state_key, @state_json, @updated_at)
  ON CONFLICT(state_key) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at
`);

let state = loadState();

function resolveDbPath(): string {
  const configuredPath = process.env.DB_PATH;
  if (!configuredPath) {
    return path.resolve(__dirname, '../data/itdash.db');
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, configuredPath);
}

function loadSeedState(targetDbPath: string): StoredDbSchema | null {
  const targetKind = detectFileKind(targetDbPath);
  if (targetKind === 'sqlite') {
    return null;
  }

  if (targetKind === 'json') {
    const migrated = readJsonState(targetDbPath);
    const backupPath = `${targetDbPath}.legacy-json.bak`;
    fs.copyFileSync(targetDbPath, backupPath);
    fs.unlinkSync(targetDbPath);
    return migrated;
  }

  if (targetKind === 'unknown') {
    throw new Error(`Unsupported DB file format at ${targetDbPath}`);
  }

  const legacyJsonPath = path.join(path.dirname(targetDbPath), 'db.json');
  if (legacyJsonPath !== targetDbPath && detectFileKind(legacyJsonPath) === 'json') {
    return readJsonState(legacyJsonPath);
  }

  return null;
}

function detectFileKind(filePath: string): 'missing' | 'sqlite' | 'json' | 'unknown' {
  if (!fs.existsSync(filePath)) {
    return 'missing';
  }

  const header = fs.readFileSync(filePath, { encoding: null }).subarray(0, 16).toString('utf8');
  if (header.startsWith('SQLite format 3')) {
    return 'sqlite';
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (raw.startsWith('{')) {
    return 'json';
  }

  return 'unknown';
}

function readJsonState(filePath: string): StoredDbSchema {
  const raw = fs.readFileSync(filePath, 'utf8');
  return normalizeState(JSON.parse(raw));
}

function createDefaultSections(): Record<SectionKey, StoredSectionState> {
  return {
    nutanix: { ...SECTION_TEMPLATES.nutanix, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
    servers: { ...SECTION_TEMPLATES.servers, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
    networks: { ...SECTION_TEMPLATES.networks, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
    symphony: { ...SECTION_TEMPLATES.symphony, lastAttemptAt: null, lastSuccessAt: null, lastError: null }
  };
}

function createDefaultState(): StoredDbSchema {
  return {
    servers: clone(DEFAULT_SERVERS),
    networks: clone(DEFAULT_NETWORKS),
    nutanix: {
      uptime: 'N/A',
      nodesCount: 0,
      nodes: [],
      storageUsage: 0,
      historyCpu: [],
      historyMem: [],
      physicalMemoryUsage: 0,
      logicalMemoryUsage: 0,
      storageUsedTib: 0,
      storageCapacityTib: 0,
      memoryUsedGib: 0,
      memoryCapacityGib: 0
    },
    symphony: {
      openIncidents: 0,
      openIncidentsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
      serviceRequests: 0,
      serviceRequestsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
      workOrders: 0,
      workOrdersBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
      changeRecords: 0,
      changeRecordsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
      priority1Incidents: 0,
      priority2Incidents: 0,
      onboardingRequests: 0,
      securityRequests: 0,
      serviceRequestsSla: 100,
      incidentsResponseSla: 100,
      incidentsResolutionSla: 100,
      requestsResponseSla: 100,
      requestsResolutionSla: 100
    },
    sections: createDefaultSections(),
    lastUpdate: new Date().toISOString()
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeState(raw: any): StoredDbSchema {
  const base = createDefaultState();

  if (Array.isArray(raw?.servers)) {
    base.servers = mergeServers(raw.servers);
  }

  if (Array.isArray(raw?.networks)) {
    base.networks = mergeNetworks(raw.networks);
  }

  base.nutanix = {
    ...base.nutanix,
    ...(raw?.nutanix ?? {}),
    nodes: Array.isArray(raw?.nutanix?.nodes)
      ? raw.nutanix.nodes
          .map((node: any) => ({
            name: typeof node?.name === 'string' ? node.name : 'Node',
            status: normalizeNutanixNodeStatus(node?.status) ?? 'offline'
          }))
      : base.nutanix.nodes,
    historyCpu: Array.isArray(raw?.nutanix?.historyCpu) ? raw.nutanix.historyCpu : base.nutanix.historyCpu,
    historyMem: Array.isArray(raw?.nutanix?.historyMem) ? raw.nutanix.historyMem : base.nutanix.historyMem
  };

  base.symphony = {
    ...base.symphony,
    ...(raw?.symphony ?? {})
  };

  if (raw?.sections) {
    for (const key of SECTION_KEYS) {
      const incoming = raw.sections[key];
      if (!incoming) {
        continue;
      }

      base.sections[key] = {
        ...base.sections[key],
        lastAttemptAt: incoming.lastAttemptAt ?? base.sections[key].lastAttemptAt,
        lastSuccessAt: incoming.lastSuccessAt ?? base.sections[key].lastSuccessAt,
        lastError: incoming.lastError ?? base.sections[key].lastError
      };
    }
  }

  base.lastUpdate = typeof raw?.lastUpdate === 'string' ? raw.lastUpdate : base.lastUpdate;
  return base;
}

function mergeServers(incomingServers: any[]): ServerNode[] {
  const merged = clone(DEFAULT_SERVERS);
  const byId = new Map(merged.map((server) => [server.id, server]));
  const byName = new Map(merged.map((server) => [cleanHostname(server.name), server]));

  for (const incoming of incomingServers) {
    const target = byId.get(incoming.id) ?? byName.get(cleanHostname(incoming.name ?? ''));
    if (!target) {
      continue;
    }

    Object.assign(target, incoming);
    target.name = normalizeServerName(target.name);
    target.status = normalizeAssetStatus(target.status) ?? target.status;
    target.history = Array.isArray(target.history) ? target.history : [];
    target.backupStatus = target.backupStatus === 'failed' || target.backupStatus === 'successful' ? target.backupStatus : 'N/A';
    target.sourceOfTruth = normalizeServerSource(target.sourceOfTruth);
    target.platform = normalizeServerPlatform(target.platform);
    target.solarwindsNodeId = typeof target.solarwindsNodeId === 'number' ? target.solarwindsNodeId : null;
    target.pollingIp = typeof target.pollingIp === 'string' ? target.pollingIp : null;
    target.machineType = typeof target.machineType === 'string' ? target.machineType : null;
    target.hardwareType = typeof target.hardwareType === 'string' ? target.hardwareType : null;
    target.lastBoot = typeof target.lastBoot === 'string' ? target.lastBoot : null;
    target.availabilityToday = typeof target.availabilityToday === 'number' ? target.availabilityToday : null;
    target.nutanixCpu = typeof target.nutanixCpu === 'number' ? target.nutanixCpu : null;
    target.nutanixMemory = typeof target.nutanixMemory === 'number' ? target.nutanixMemory : null;
    target.nutanixDisk = typeof target.nutanixDisk === 'string' ? target.nutanixDisk : null;
    target.nutanixStatus = normalizeAssetStatus(target.nutanixStatus) ?? null;
    target.nutanixHistory = Array.isArray(target.nutanixHistory) ? target.nutanixHistory : [];
    target.solarwindsCpu = typeof target.solarwindsCpu === 'number' ? target.solarwindsCpu : null;
    target.solarwindsMemory = typeof target.solarwindsMemory === 'number' ? target.solarwindsMemory : null;
    target.solarwindsDisk = typeof target.solarwindsDisk === 'string' ? target.solarwindsDisk : null;
    target.solarwindsStatus = normalizeAssetStatus(target.solarwindsStatus) ?? null;
    target.solarwindsHistory = Array.isArray(target.solarwindsHistory) ? target.solarwindsHistory : [];
    target.effectiveTelemetrySource = normalizeServerSource(target.effectiveTelemetrySource);
    target.usingFallback = typeof target.usingFallback === 'boolean' ? target.usingFallback : false;
  }

  return merged;
}

function mergeNetworks(incomingNetworks: any[]): NetworkLink[] {
  const merged = clone(DEFAULT_NETWORKS);
  const byId = new Map(merged.map((network) => [network.id, network]));

  for (const incoming of incomingNetworks) {
    const target = byId.get(incoming.id);
    if (!target) {
      continue;
    }

    Object.assign(target, incoming);
    target.status = normalizeAssetStatus(target.status) ?? target.status;
    target.history = Array.isArray(target.history) ? target.history : [];
  }

  return merged;
}

function normalizeNutanixNodeStatus(value: any): NutanixNodeStatus | null {
  if (value === 'normal' || value === 'warning' || value === 'critical' || value === 'offline') {
    return value;
  }

  return null;
}

function loadState(): StoredDbSchema {
  const row = selectStateStmt.get(STATE_KEY) as { state_json: string } | undefined;
  if (!row) {
    const initialState = seedState ?? createDefaultState();
    saveState(initialState);
    return initialState;
  }

  return normalizeState(JSON.parse(row.state_json));
}

function saveState(nextState: StoredDbSchema): void {
  upsertStateStmt.run({
    state_key: STATE_KEY,
    state_json: JSON.stringify(nextState),
    updated_at: new Date().toISOString()
  });
}

function persist(): void {
  saveState(state);
}

function pushToHistory(history: number[], value: number): number[] {
  const nextHistory = [...history, value];
  return nextHistory.length > 20 ? nextHistory.slice(nextHistory.length - 20) : nextHistory;
}

function cleanHostname(name: string): string {
  return name.toLowerCase()
    .replace('.abgplanet.abg.com', '')
    .trim();
}

function isWindowsServer(name: string): boolean {
  const lowercase = name.toLowerCase();
  return !lowercase.includes('ilmsap') && !lowercase.includes('ilmsdb');
}

function normalizeServerName(name: string): string {
  if (!name) {
    return name;
  }

  if (isWindowsServer(name) && !name.toLowerCase().endsWith('.abgplanet.abg.com')) {
    return `${name}.abgplanet.abg.com`;
  }

  return name;
}

function normalizeAssetStatus(status?: string | null): AssetStatus | undefined {
  if (!status) {
    return undefined;
  }

  const normalized = status.toLowerCase();
  if (normalized.includes('warning') || normalized.includes('degraded') || normalized.includes('unknown')) {
    return 'degraded';
  }
  if (normalized.includes('critical') || normalized.includes('down')) {
    return 'down';
  }
  if (normalized.includes('ok') || normalized.includes('up') || normalized.includes('operational')) {
    return 'operational';
  }

  return undefined;
}

function normalizeServerSource(source?: string | null): ServerSourceOfTruth | null {
  if (source === 'nutanix' || source === 'solarwinds') {
    return source;
  }

  return null;
}

function normalizeServerPlatform(platform?: string | null): ServerPlatform | null {
  if (platform === 'hci-vm' || platform === 'on-prem') {
    return platform;
  }

  return null;
}

function isNutanixBackedServer(server: ServerNode): boolean {
  return server.sourceOfTruth === 'nutanix'
    || server.platform === 'hci-vm';
}

function markSectionAttempt(sectionKey: SectionKey, attemptedAt: string): void {
  state.sections[sectionKey].lastAttemptAt = attemptedAt;
}

function markSectionSuccess(sectionKey: SectionKey, attemptedAt: string): void {
  state.sections[sectionKey].lastAttemptAt = attemptedAt;
  state.sections[sectionKey].lastSuccessAt = attemptedAt;
  state.sections[sectionKey].lastError = null;
}

function markSectionError(sectionKey: SectionKey, attemptedAt: string, error: string): void {
  state.sections[sectionKey].lastAttemptAt = attemptedAt;
  state.sections[sectionKey].lastError = error;
}

function maybeUpdateLastSync(timestamp: string): void {
  if (!state.lastUpdate || new Date(timestamp).getTime() >= new Date(state.lastUpdate).getTime()) {
    state.lastUpdate = timestamp;
  }
}

function deriveSectionStatus(section: StoredSectionState): SectionStatus {
  if (!section.lastAttemptAt && !section.lastSuccessAt) {
    return 'never';
  }

  const lastAttemptAt = section.lastAttemptAt ? new Date(section.lastAttemptAt).getTime() : 0;
  const lastSuccessAt = section.lastSuccessAt ? new Date(section.lastSuccessAt).getTime() : 0;
  if (section.lastError && lastAttemptAt >= lastSuccessAt) {
    return 'error';
  }

  if (!section.lastSuccessAt) {
    return 'never';
  }

  const ageMs = Date.now() - lastSuccessAt;
  if (ageMs > section.pollIntervalMs * 2.5) {
    return 'stale';
  }

  return 'ok';
}

function deriveSources(sections: Record<SectionKey, SectionHealth>): Record<CollectorSource, SourceHealth> {
  const result = {} as Record<CollectorSource, SourceHealth>;

  (Object.keys(SOURCE_SECTION_KEYS) as CollectorSource[]).forEach((source) => {
    const sectionKeys = SOURCE_SECTION_KEYS[source];
    const sourceSections = sectionKeys.map((key) => sections[key]);
    const statuses = sourceSections.map((section) => section.status);
    const hasOk = statuses.includes('ok');
    const hasNonOk = statuses.some((status) => status !== 'ok');

    let status: SourceStatus;
    if (statuses.every((value) => value === 'never')) {
      status = 'never';
    } else if (statuses.every((value) => value === 'ok')) {
      status = 'ok';
    } else if (hasOk && hasNonOk) {
      status = 'partial';
    } else if (statuses.includes('error')) {
      status = 'error';
    } else if (statuses.includes('stale')) {
      status = 'stale';
    } else {
      status = statuses[0];
    }

    const lastAttemptAt = sourceSections
      .map((section) => section.lastAttemptAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const lastSuccessAt = sourceSections
      .map((section) => section.lastSuccessAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const lastError = sourceSections.find((section) => section.status === 'error' && section.lastError)?.lastError ?? null;

    result[source] = {
      source,
      label: SOURCE_LABELS[source],
      sectionKeys,
      lastAttemptAt,
      lastSuccessAt,
      lastError,
      status
    };
  });

  return result;
}

function hasFreshNutanixServerTelemetry(server: ServerNode): boolean {
  return server.nutanixCpu !== null
    || server.nutanixMemory !== null
    || server.nutanixDisk !== null
    || server.nutanixStatus !== null
    || server.nutanixHistory.length > 0;
}

function hasSolarWindsServerTelemetry(server: ServerNode): boolean {
  return server.solarwindsCpu !== null
    || server.solarwindsMemory !== null
    || server.solarwindsDisk !== null
    || server.solarwindsStatus !== null
    || server.solarwindsHistory.length > 0;
}

function shouldUseSolarWindsFallback(server: ServerNode, sections: Record<SectionKey, SectionHealth>): boolean {
  if (!isNutanixBackedServer(server) || !hasSolarWindsServerTelemetry(server)) {
    return false;
  }

  const lastNutanixSuccess = sections.nutanix.lastSuccessAt ? new Date(sections.nutanix.lastSuccessAt).getTime() : 0;
  if (!lastNutanixSuccess) {
    return true;
  }

  return (Date.now() - lastNutanixSuccess) > NUTANIX_FALLBACK_DELAY_MS;
}

function materializeServer(server: ServerNode, sections: Record<SectionKey, SectionHealth>): ServerNode {
  const usingFallback = shouldUseSolarWindsFallback(server, sections);
  const prefersNutanix = isNutanixBackedServer(server);
  const effectiveSource: ServerSourceOfTruth | null =
    usingFallback ? 'solarwinds' :
    prefersNutanix ? 'nutanix' :
    'solarwinds';

  const cpu = effectiveSource === 'nutanix'
    ? (server.nutanixCpu ?? server.cpu)
    : (server.solarwindsCpu ?? server.cpu);
  const memory = effectiveSource === 'nutanix'
    ? (server.nutanixMemory ?? server.memory)
    : (server.solarwindsMemory ?? server.memory);
  const disk = effectiveSource === 'nutanix'
    ? (server.nutanixDisk ?? server.disk)
    : (server.solarwindsDisk ?? server.disk);
  const status = effectiveSource === 'nutanix'
    ? (server.nutanixStatus ?? server.status)
    : (server.solarwindsStatus ?? server.status);
  const history = effectiveSource === 'nutanix'
    ? (server.nutanixHistory.length > 0 ? server.nutanixHistory : server.history)
    : (server.solarwindsHistory.length > 0 ? server.solarwindsHistory : server.history);

  return {
    ...server,
    cpu,
    memory,
    disk,
    status,
    history,
    effectiveTelemetrySource: effectiveSource,
    usingFallback
  };
}

function currentTimestamp(meta?: UpdateMeta): string {
  return meta?.attemptedAt ?? new Date().toISOString();
}

export function getDashboardState(): DbSchema {
  const snapshot = normalizeState(state);
  const sections = {} as Record<SectionKey, SectionHealth>;

  for (const key of SECTION_KEYS) {
    sections[key] = {
      ...snapshot.sections[key],
      status: deriveSectionStatus(snapshot.sections[key])
    };
  }

  const { sections: _storedSections, ...rest } = snapshot;
  return {
    ...rest,
    servers: snapshot.servers.map((server) => materializeServer(server, sections)),
    sections,
    sources: deriveSources(sections)
  };
}

export function updateNutanix(data: {
  meta?: UpdateMeta;
  uptime?: string;
  nodesCount?: number;
  nodes?: Array<{ name: string; status: NutanixNodeStatus }>;
  storageUsage?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  physicalMemoryUsage?: number;
  logicalMemoryUsage?: number;
  storageUsedTib?: number;
  storageCapacityTib?: number;
  memoryUsedGib?: number;
  memoryCapacityGib?: number;
  vms?: Array<{ name: string; diskUsage?: string; backupStatus?: 'successful' | 'failed' | 'N/A'; cpu?: number; memory?: number; status?: string }>;
}): void {
  const attemptedAt = currentTimestamp(data.meta);
  markSectionAttempt('nutanix', attemptedAt);

  if (data.meta?.ok === false) {
    markSectionError('nutanix', attemptedAt, data.meta.error ?? 'Nutanix collector failed');
    persist();
    return;
  }

  const hasPayload = [
    data.uptime,
    data.nodesCount,
    data.nodes,
    data.storageUsage,
    data.cpuUsage,
    data.memoryUsage,
    data.physicalMemoryUsage,
    data.logicalMemoryUsage,
    data.storageUsedTib,
    data.storageCapacityTib,
    data.memoryUsedGib,
    data.memoryCapacityGib
  ].some((value) => value !== undefined) || Array.isArray(data.vms);

  if (!hasPayload) {
    markSectionError('nutanix', attemptedAt, data.meta?.error ?? 'Nutanix collector returned no usable payload');
    persist();
    return;
  }

  if (data.uptime !== undefined) state.nutanix.uptime = data.uptime;
  if (data.nodesCount !== undefined) state.nutanix.nodesCount = data.nodesCount;
  if (Array.isArray(data.nodes)) {
    state.nutanix.nodes = data.nodes
      .map((node) => ({
        name: node.name,
        status: normalizeNutanixNodeStatus(node.status) ?? 'offline'
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
  if (data.storageUsage !== undefined) state.nutanix.storageUsage = data.storageUsage;
  if (data.physicalMemoryUsage !== undefined) state.nutanix.physicalMemoryUsage = data.physicalMemoryUsage;
  if (data.logicalMemoryUsage !== undefined) state.nutanix.logicalMemoryUsage = data.logicalMemoryUsage;
  if (data.storageUsedTib !== undefined) state.nutanix.storageUsedTib = data.storageUsedTib;
  if (data.storageCapacityTib !== undefined) state.nutanix.storageCapacityTib = data.storageCapacityTib;
  if (data.memoryUsedGib !== undefined) state.nutanix.memoryUsedGib = data.memoryUsedGib;
  if (data.memoryCapacityGib !== undefined) state.nutanix.memoryCapacityGib = data.memoryCapacityGib;

  if (data.cpuUsage !== undefined) {
    state.nutanix.historyCpu = pushToHistory(state.nutanix.historyCpu, data.cpuUsage);
  }
  if (data.memoryUsage !== undefined) {
    state.nutanix.historyMem = pushToHistory(state.nutanix.historyMem, data.memoryUsage);
  }

  if (data.vms) {
    for (const vm of data.vms) {
      const server = state.servers.find((candidate) => cleanHostname(candidate.name) === cleanHostname(vm.name));
      if (!server) {
        continue;
      }

      if (vm.diskUsage !== undefined) {
        server.disk = vm.diskUsage;
        server.nutanixDisk = vm.diskUsage;
      }
      if (vm.backupStatus !== undefined) {
        server.backupStatus = vm.backupStatus;
      }
      server.sourceOfTruth = 'nutanix';
      server.platform = 'hci-vm';
      if (vm.cpu !== undefined) {
        server.cpu = vm.cpu;
        server.history = pushToHistory(server.history, vm.cpu);
        server.nutanixCpu = vm.cpu;
        server.nutanixHistory = pushToHistory(server.nutanixHistory, vm.cpu);
      }
      if (vm.memory !== undefined) {
        server.memory = vm.memory;
        server.nutanixMemory = vm.memory;
      }
      if (vm.status !== undefined) {
        const normalizedStatus = normalizeAssetStatus(vm.status) ?? server.status;
        server.status = normalizedStatus;
        server.nutanixStatus = normalizedStatus;
      }
    }
  }

  markSectionSuccess('nutanix', attemptedAt);
  maybeUpdateLastSync(attemptedAt);
  persist();
}

export function updateSolarWinds(data: {
  meta?: UpdateMeta & {
    sections?: {
      servers?: UpdateMeta;
      networks?: UpdateMeta;
    };
  };
  servers?: Array<{
    name: string;
    cpu?: number;
    memory?: number;
    disk?: string;
    status?: string;
    nodeId?: number;
    pollingIp?: string;
    machineType?: string;
    hardwareType?: string;
    lastBoot?: string;
    availabilityToday?: number;
    sourceOfTruth?: ServerSourceOfTruth;
    platform?: ServerPlatform;
  }>;
  networks?: Array<{
    id: string;
    latency?: number;
    utilization?: number;
    status?: string;
    uptime?: number;
    displayName?: string;
    pollingIp?: string;
    interfaceName?: string;
    transmitUtilization?: number;
    receiveUtilization?: number;
    siteName?: string;
    portSpeed?: string;
    circuitId?: string;
    linkType?: string;
    alias?: string;
    interfaceType?: string;
    ipAddress?: string;
    administrativeStatus?: string;
    operationalStatus?: string;
    lastStatusChange?: string;
    bandwidthReceiveMbps?: number;
    bandwidthTransmitMbps?: number;
    configuredSpeedMbps?: number;
    currentTrafficReceiveMbps?: number;
    currentTrafficTransmitMbps?: number;
    packetsPerSecondReceive?: number;
    packetsPerSecondTransmit?: number;
    averagePacketSizeReceive?: number;
    averagePacketSizeTransmit?: number;
    realtimeTransmitUtilization?: number;
    realtimeReceiveUtilization?: number;
    dailyTransmitUtilization?: number;
    dailyReceiveUtilization?: number;
  }>;
}): void {
  const attemptedAt = currentTimestamp(data.meta);
  const serverMeta = data.meta?.sections?.servers;
  const networkMeta = data.meta?.sections?.networks;

  const sectionAttempts: Array<{ key: SectionKey; meta?: UpdateMeta }> = [
    { key: 'servers', meta: serverMeta ?? data.meta },
    { key: 'networks', meta: networkMeta ?? data.meta }
  ];

  for (const section of sectionAttempts) {
    markSectionAttempt(section.key, currentTimestamp(section.meta));
  }

  let anySuccess = false;

  if (serverMeta?.ok === false || (data.meta?.ok === false && !serverMeta && !data.servers)) {
    markSectionError('servers', currentTimestamp(serverMeta ?? data.meta), serverMeta?.error ?? data.meta?.error ?? 'SolarWinds server scrape failed');
  } else if (Array.isArray(data.servers) && data.servers.length > 0) {
    for (const incoming of data.servers) {
      const server = state.servers.find((candidate) => cleanHostname(candidate.name) === cleanHostname(incoming.name));
      if (!server) {
        continue;
      }

      if (incoming.nodeId !== undefined) {
        server.solarwindsNodeId = incoming.nodeId;
      }
      if (incoming.pollingIp !== undefined) {
        server.pollingIp = incoming.pollingIp;
      }
      if (incoming.machineType !== undefined) {
        server.machineType = incoming.machineType;
      }
      if (incoming.hardwareType !== undefined) {
        server.hardwareType = incoming.hardwareType;
      }
      if (incoming.lastBoot !== undefined) {
        server.lastBoot = incoming.lastBoot;
      }
      if (incoming.availabilityToday !== undefined) {
        server.availabilityToday = incoming.availabilityToday;
      }
      if (incoming.cpu !== undefined) {
        server.solarwindsCpu = incoming.cpu;
        server.solarwindsHistory = pushToHistory(server.solarwindsHistory, incoming.cpu);
      }
      if (incoming.memory !== undefined) {
        server.solarwindsMemory = incoming.memory;
      }
      if (incoming.disk !== undefined) {
        server.solarwindsDisk = incoming.disk;
      }
      if (incoming.status !== undefined) {
        server.solarwindsStatus = normalizeAssetStatus(incoming.status) ?? server.solarwindsStatus;
      }

      if (!isNutanixBackedServer(server)) {
        server.sourceOfTruth = incoming.sourceOfTruth ?? 'solarwinds';
        server.platform = incoming.platform ?? 'on-prem';

        if (incoming.cpu !== undefined) {
          server.cpu = incoming.cpu;
          server.history = pushToHistory(server.history, incoming.cpu);
        }
        if (incoming.memory !== undefined) {
          server.memory = incoming.memory;
        }
        if (incoming.disk !== undefined) {
          server.disk = incoming.disk;
        }
        if (incoming.status !== undefined) {
          server.status = normalizeAssetStatus(incoming.status) ?? server.status;
        }
      }
    }

    markSectionSuccess('servers', currentTimestamp(serverMeta ?? data.meta));
    anySuccess = true;
  } else if (serverMeta) {
    markSectionError('servers', currentTimestamp(serverMeta), serverMeta.error ?? 'SolarWinds server scrape returned no usable rows');
  }

  if (networkMeta?.ok === false || (data.meta?.ok === false && !networkMeta && !data.networks)) {
    markSectionError('networks', currentTimestamp(networkMeta ?? data.meta), networkMeta?.error ?? data.meta?.error ?? 'SolarWinds network scrape failed');
  } else if (Array.isArray(data.networks) && data.networks.length > 0) {
    for (const incoming of data.networks) {
      const network = state.networks.find((candidate) => candidate.id === incoming.id);
      if (!network) {
        continue;
      }

      if (incoming.latency !== undefined) {
        network.latency = incoming.latency;
      }
      if (incoming.utilization !== undefined) {
        network.utilization = incoming.utilization;
        network.history = pushToHistory(network.history, incoming.utilization);
      }
      if (incoming.displayName !== undefined) {
        network.displayName = incoming.displayName;
      }
      if (incoming.pollingIp !== undefined) {
        network.pollingIp = incoming.pollingIp;
      }
      if (incoming.interfaceName !== undefined) {
        network.interfaceName = incoming.interfaceName;
      }
      if (incoming.transmitUtilization !== undefined) {
        network.transmitUtilization = incoming.transmitUtilization;
      }
      if (incoming.receiveUtilization !== undefined) {
        network.receiveUtilization = incoming.receiveUtilization;
      }
      if (incoming.siteName !== undefined) {
        network.siteName = incoming.siteName;
      }
      if (incoming.portSpeed !== undefined) {
        network.portSpeed = incoming.portSpeed;
      }
      if (incoming.circuitId !== undefined) {
        network.circuitId = incoming.circuitId;
      }
      if (incoming.linkType !== undefined) {
        network.linkType = incoming.linkType;
      }
      if (incoming.alias !== undefined) {
        network.alias = incoming.alias;
      }
      if (incoming.interfaceType !== undefined) {
        network.interfaceType = incoming.interfaceType;
      }
      if (incoming.ipAddress !== undefined) {
        network.ipAddress = incoming.ipAddress;
      }
      if (incoming.administrativeStatus !== undefined) {
        network.administrativeStatus = incoming.administrativeStatus;
      }
      if (incoming.operationalStatus !== undefined) {
        network.operationalStatus = incoming.operationalStatus;
      }
      if (incoming.lastStatusChange !== undefined) {
        network.lastStatusChange = incoming.lastStatusChange;
      }
      if (incoming.bandwidthReceiveMbps !== undefined) {
        network.bandwidthReceiveMbps = incoming.bandwidthReceiveMbps;
      }
      if (incoming.bandwidthTransmitMbps !== undefined) {
        network.bandwidthTransmitMbps = incoming.bandwidthTransmitMbps;
      }
      if (incoming.configuredSpeedMbps !== undefined) {
        network.configuredSpeedMbps = incoming.configuredSpeedMbps;
      }
      if (incoming.currentTrafficReceiveMbps !== undefined) {
        network.currentTrafficReceiveMbps = incoming.currentTrafficReceiveMbps;
      }
      if (incoming.currentTrafficTransmitMbps !== undefined) {
        network.currentTrafficTransmitMbps = incoming.currentTrafficTransmitMbps;
      }
      if (incoming.packetsPerSecondReceive !== undefined) {
        network.packetsPerSecondReceive = incoming.packetsPerSecondReceive;
      }
      if (incoming.packetsPerSecondTransmit !== undefined) {
        network.packetsPerSecondTransmit = incoming.packetsPerSecondTransmit;
      }
      if (incoming.averagePacketSizeReceive !== undefined) {
        network.averagePacketSizeReceive = incoming.averagePacketSizeReceive;
      }
      if (incoming.averagePacketSizeTransmit !== undefined) {
        network.averagePacketSizeTransmit = incoming.averagePacketSizeTransmit;
      }
      if (incoming.realtimeTransmitUtilization !== undefined) {
        network.realtimeTransmitUtilization = incoming.realtimeTransmitUtilization;
      }
      if (incoming.realtimeReceiveUtilization !== undefined) {
        network.realtimeReceiveUtilization = incoming.realtimeReceiveUtilization;
      }
      if (incoming.dailyTransmitUtilization !== undefined) {
        network.dailyTransmitUtilization = incoming.dailyTransmitUtilization;
      }
      if (incoming.dailyReceiveUtilization !== undefined) {
        network.dailyReceiveUtilization = incoming.dailyReceiveUtilization;
      }
      if (incoming.status !== undefined) {
        network.status = normalizeAssetStatus(incoming.status) ?? network.status;
      }
      if (incoming.uptime !== undefined) {
        network.uptime = incoming.uptime;
      }
    }

    markSectionSuccess('networks', currentTimestamp(networkMeta ?? data.meta));
    anySuccess = true;
  } else if (networkMeta) {
    markSectionError('networks', currentTimestamp(networkMeta), networkMeta.error ?? 'SolarWinds network scrape returned no usable rows');
  }

  if (anySuccess) {
    maybeUpdateLastSync(attemptedAt);
  }

  persist();
}

export function updateSymphony(data: {
  meta?: UpdateMeta;
  openIncidents?: number;
  openIncidentsBreakdown?: TicketBreakdown;
  serviceRequests?: number;
  serviceRequestsBreakdown?: TicketBreakdown;
  workOrders?: number;
  workOrdersBreakdown?: TicketBreakdown;
  changeRecords?: number;
  changeRecordsBreakdown?: TicketBreakdown;
  priority1Incidents?: number;
  priority2Incidents?: number;
  onboardingRequests?: number;
  securityRequests?: number;
  serviceRequestsSla?: number;
  incidentsResponseSla?: number;
  incidentsResolutionSla?: number;
  requestsResponseSla?: number;
  requestsResolutionSla?: number;
}): void {
  const attemptedAt = currentTimestamp(data.meta);
  markSectionAttempt('symphony', attemptedAt);

  if (data.meta?.ok === false) {
    markSectionError('symphony', attemptedAt, data.meta.error ?? 'Symphony collector failed');
    persist();
    return;
  }

  const hasPayload = [
    data.openIncidents,
    data.serviceRequests,
    data.workOrders,
    data.changeRecords,
    data.priority1Incidents,
    data.priority2Incidents,
    data.onboardingRequests,
    data.securityRequests,
    data.serviceRequestsSla,
    data.incidentsResponseSla,
    data.incidentsResolutionSla,
    data.requestsResponseSla,
    data.requestsResolutionSla
  ].some((value) => value !== undefined);

  if (!hasPayload) {
    markSectionError('symphony', attemptedAt, data.meta?.error ?? 'Symphony collector returned no usable payload');
    persist();
    return;
  }

  if (data.openIncidents !== undefined) state.symphony.openIncidents = data.openIncidents;
  if (data.openIncidentsBreakdown) state.symphony.openIncidentsBreakdown = data.openIncidentsBreakdown;
  if (data.serviceRequests !== undefined) state.symphony.serviceRequests = data.serviceRequests;
  if (data.serviceRequestsBreakdown) state.symphony.serviceRequestsBreakdown = data.serviceRequestsBreakdown;
  if (data.workOrders !== undefined) state.symphony.workOrders = data.workOrders;
  if (data.workOrdersBreakdown) state.symphony.workOrdersBreakdown = data.workOrdersBreakdown;
  if (data.changeRecords !== undefined) state.symphony.changeRecords = data.changeRecords;
  if (data.changeRecordsBreakdown) state.symphony.changeRecordsBreakdown = data.changeRecordsBreakdown;
  if (data.priority1Incidents !== undefined) state.symphony.priority1Incidents = data.priority1Incidents;
  if (data.priority2Incidents !== undefined) state.symphony.priority2Incidents = data.priority2Incidents;
  if (data.onboardingRequests !== undefined) state.symphony.onboardingRequests = data.onboardingRequests;
  if (data.securityRequests !== undefined) state.symphony.securityRequests = data.securityRequests;
  if (data.serviceRequestsSla !== undefined) state.symphony.serviceRequestsSla = data.serviceRequestsSla;
  if (data.incidentsResponseSla !== undefined) state.symphony.incidentsResponseSla = data.incidentsResponseSla;
  if (data.incidentsResolutionSla !== undefined) state.symphony.incidentsResolutionSla = data.incidentsResolutionSla;
  if (data.requestsResponseSla !== undefined) state.symphony.requestsResponseSla = data.requestsResponseSla;
  if (data.requestsResolutionSla !== undefined) state.symphony.requestsResolutionSla = data.requestsResolutionSla;

  markSectionSuccess('symphony', attemptedAt);
  maybeUpdateLastSync(attemptedAt);
  persist();
}
