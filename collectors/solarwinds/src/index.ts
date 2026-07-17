import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { NETWORK_STORAGE_STATE_PATH, prepareRuntimeStorage, SERVER_STORAGE_STATE_PATH } from './sessionPaths';
import { loadSolarWindsRuntimeConfig } from './runtimeConfig';
import { loadSolarWindsRuntimeSecrets } from './runtimeSecrets';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const API_URL = process.env.API_URL || 'http://localhost:4000/api/update';
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set ${name} in the environment.`);
  }

  return value;
}

const NAVIGATION_TIMEOUT = 30000;
const LOGIN_BUTTON_SELECTOR = '#ctl00_BodyContent_LoginButton, input[type="submit"], button:has-text("Login")';
const USERNAME_SELECTOR = '#ctl00_BodyContent_Username, input[name*="username"], input[type="text"]';
const PASSWORD_SELECTOR = '#ctl00_BodyContent_Password, input[name*="password"], input[type="password"]';

const DEFAULT_SERVER_NAMES = [
  'HIL-HIDDOR-AV01.abgplanet.abg.com',
  'HIL-HIDDOR-BK01',
  'HIL-HIDDOR-CSCTS1',
  'HIL-HIDDOR-CSCTS2',
  'HILHIDDORDT0320',
  'HIL-HIDDOR-FS01.abgplanet.abg.com',
  'HILHIDDORILMSAP',
  'HILHIDDORILMSDB',
  'HIL-HIDDOR-PIMW.abgplanet.abg.com',
  'HIL-HIDDOR-PSDM.abgplanet.abg.com',
  'HIL-HIDDOR-US01',
  'HIL-HIDDOR-US02',
  'HIL-HIDDOR-US03',
  'HIL-HIDDOR-US04',
  'HIL-HIDDOR-US05',
  'HIL-HIDDOR-US06'
];

const DEFAULT_NETWORK_NODE_MAP = [
  { id: 'sw-net-1', provider: 'RJIO (ISP1)', nodeId: 'N:1419', nodeNumericId: 1419, kind: 'carrier' as const },
  { id: 'sw-net-2', provider: 'RailTel (ISP2)', nodeId: 'N:1417', nodeNumericId: 1417, kind: 'carrier' as const },
  { id: 'sw-net-3', provider: 'HIL-UTK-EC-1 (SDWAN-A)', nodeId: 'N:401', nodeNumericId: 401, interfaceId: 4744, kind: 'sdwan' as const },
  { id: 'sw-net-4', provider: 'HIL-UTK-EC-2 (SDWAN-B)', nodeId: 'N:402', nodeNumericId: 402, interfaceId: 12134, kind: 'sdwan' as const }
];

type AssetStatus = 'operational' | 'degraded' | 'down';
type HostKey = 'servers' | 'networks';

interface ServerMetric {
  name: string;
  cpu?: number;
  memory?: number;
  disk?: string;
  status?: AssetStatus;
  nodeId?: number;
  pollingIp?: string;
  machineType?: string;
  hardwareType?: string;
  lastBoot?: string;
  availabilityToday?: number;
  sourceOfTruth?: 'solarwinds';
  platform?: 'on-prem';
}

interface NetworkMetric {
  id: string;
  latency?: number;
  utilization?: number;
  status?: AssetStatus;
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
}

interface SectionResult<T> {
  attemptedAt: string;
  reportedAt?: string;
  data?: T;
  error?: string;
}

interface UpdateMetaPayload {
  attemptedAt: string;
  finishedAt?: string;
  ok: boolean;
  error?: string;
  targetHost?: string;
}

interface HostConfig {
  key: HostKey;
  label: string;
  host: string;
  targetUrl: string;
  storageStatePath: string;
  metadata: Record<string, unknown>;
}

interface NetworkEntitySnapshot {
  displayName?: string;
  pollingIp?: string;
  status?: AssetStatus;
}

interface CarrierMetadata {
  siteName?: string;
  portSpeed?: string;
  circuitId?: string;
  linkType?: string;
}

interface InterfaceDetailSnapshot {
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
}

interface ServerInventoryEntry {
  name: string;
  nodeId: number;
}

interface NodeDetailsEnvelope {
  d?: {
    NodeStatusAltText?: string;
    NodeStatusDescription?: string;
    IPAddressString?: string;
    HrefIPAddress?: string;
    MachineType?: string;
    SysName?: string;
    LastBoot?: string;
    HardwareType?: string;
    CpuNo?: number;
    EffectiveCategory?: string;
  };
}

interface PerfstackMetricResponse {
  measurements?: Array<{
    dateTimeStamp?: string;
    value?: number | null;
  }>;
}

interface PerfstackEntityRelationship {
  id: string;
  instanceType?: string;
  displayName?: string;
  description?: string | null;
}

const DEFAULT_SERVER_NODE_MAP: ServerInventoryEntry[] = [
  { name: 'HIL-HIDDOR-AV01.abgplanet.abg.com', nodeId: 651 },
  { name: 'HIL-HIDDOR-BK01', nodeId: 1028 },
  { name: 'HIL-HIDDOR-CSCTS1', nodeId: 311 },
  { name: 'HIL-HIDDOR-CSCTS2', nodeId: 319 },
  { name: 'HILHIDDORDT0320', nodeId: 299 },
  { name: 'HIL-HIDDOR-FS01.abgplanet.abg.com', nodeId: 216 },
  { name: 'HILHIDDORILMSAP', nodeId: 1026 },
  { name: 'HILHIDDORILMSDB', nodeId: 1027 },
  { name: 'HIL-HIDDOR-PIMW.abgplanet.abg.com', nodeId: 221 },
  { name: 'HIL-HIDDOR-PSDM.abgplanet.abg.com', nodeId: 568 },
  { name: 'HIL-HIDDOR-US01', nodeId: 1058 },
  { name: 'HIL-HIDDOR-US02', nodeId: 349 },
  { name: 'HIL-HIDDOR-US03', nodeId: 347 },
  { name: 'HIL-HIDDOR-US04', nodeId: 652 },
  { name: 'HIL-HIDDOR-US05', nodeId: 1024 },
  { name: 'HIL-HIDDOR-US06', nodeId: 1025 }
];

type NetworkTargetConfig = {
  id: string;
  provider: string;
  nodeId: string;
  nodeNumericId: number;
  interfaceId?: number;
  kind: 'carrier' | 'sdwan';
};

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter(Boolean);
}

function getConfiguredServerNames(metadata: Record<string, unknown>): string[] {
  const configured = parseStringList(metadata.monitoredServers);
  return configured.length > 0 ? configured : DEFAULT_SERVER_NAMES;
}

function getConfiguredNetworkTargets(metadata: Record<string, unknown>): NetworkTargetConfig[] {
  const configured = parseStringList(metadata.networkObjectIds);
  if (configured.length === 0) {
    return DEFAULT_NETWORK_NODE_MAP;
  }

  return configured.map((rawValue, index) => {
    const numericMatch = rawValue.match(/(\d+)/);
    const numericId = numericMatch ? Number.parseInt(numericMatch[1], 10) : index + 1;
    const fallback = DEFAULT_NETWORK_NODE_MAP.find((entry) => entry.nodeNumericId === numericId);
    return {
      id: fallback?.id ?? `sw-net-${index + 1}`,
      provider: fallback?.provider ?? `Network ${index + 1}`,
      nodeId: numericMatch ? `N:${numericId}` : rawValue,
      nodeNumericId: numericId,
      interfaceId: fallback?.interfaceId,
      kind: fallback?.kind ?? (index < 2 ? 'carrier' : 'sdwan')
    };
  });
}

let browserPromise: Promise<Browser> | null = null;
let cycleInProgress = false;
let nextCycleTimer: NodeJS.Timeout | null = null;

async function postUpdate(payload: object) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace('.abgplanet.abg.com', '')
    .replace(/[^a-z0-9]/g, '');
}

function findKnownServerName(text: string, serverNames: string[]): string | null {
  const normalizedText = normalizeToken(text);
  for (const serverName of serverNames) {
    if (normalizedText.includes(normalizeToken(serverName))) {
      return serverName;
    }
  }

  return null;
}

function parseRankedServerTable(
  tableText: string,
  headerPattern: RegExp,
  field: 'cpu' | 'memory',
  target: Map<string, ServerMetric>
) {
  const normalizedTable = tableText.replace(/\s+/g, ' ').trim();
  if (!headerPattern.test(normalizedTable)) {
    return;
  }

  const tableBody = normalizedTable.replace(headerPattern, '').trim();
  const matches = [...tableBody.matchAll(/([A-Z0-9.-]+(?:\.abgplanet\.abg\.com)?)\s+(\d+(?:\.\d+)?)\s*%/gi)];

  for (const match of matches) {
    const matchedName = findKnownServerName(match[1], DEFAULT_SERVER_NAMES);
    if (!matchedName) {
      continue;
    }

    const existing = target.get(matchedName) ?? { name: matchedName };
    existing[field] = Number(parseFloat(match[2]).toFixed(2));
    target.set(matchedName, existing);
  }
}

async function readStatusFromRow(row: Locator): Promise<AssetStatus> {
  const altTexts = await row.locator('img').evaluateAll((images) =>
    images.map((image) => (image.getAttribute('alt') || '').toLowerCase())
  );

  if (altTexts.some((alt) => alt.includes('down') || alt.includes('critical'))) {
    return 'down';
  }
  if (altTexts.some((alt) => alt.includes('warning'))) {
    return 'degraded';
  }

  return 'operational';
}

function parseAssetStatus(value: string | undefined | null): AssetStatus | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('warning') || normalized.includes('degraded') || normalized.includes('unknown')) {
    return 'degraded';
  }
  if (normalized.includes('down') || normalized.includes('critical')) {
    return 'down';
  }
  if (normalized.includes('up') || normalized.includes('operational')) {
    return 'operational';
  }

  return undefined;
}

function parseNumericStatus(status: unknown): AssetStatus | undefined {
  if (typeof status !== 'number') {
    return undefined;
  }

  if (status === 1) {
    return 'operational';
  }
  if (status === 2 || status === 3 || status === 9) {
    return 'degraded';
  }
  if (status === 14 || status === 0) {
    return 'down';
  }

  return undefined;
}

function parsePercentText(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return undefined;
  }

  return Number(parseFloat(match[1]).toFixed(2));
}

function parseCarrierMetadata(displayName: string | undefined): CarrierMetadata {
  if (!displayName) {
    return {};
  }

  const normalized = displayName.replace(/\s+/g, ' ').trim();
  const siteMatch = normalized.match(/^([A-Za-z0-9-]+)/);
  const providerMatch = normalized.match(/\b(Railtel|RJIO|JIO|Jio)\b/i);
  const portSpeedMatch = normalized.match(/(\d+\s*Mbps)/i);
  const circuitMatch = normalized.match(/\b(CKT-[A-Za-z0-9-]+|ILL_[A-Za-z0-9_]+)\b/i);
  const providerToken = providerMatch?.[1];
  const normalizedProvider = providerToken
    ? /jio|rjio/i.test(providerToken)
      ? 'JIO'
      : 'Railtel'
    : undefined;

  return {
    siteName: siteMatch?.[1],
    portSpeed: portSpeedMatch?.[1]?.replace(/\s+/g, ' '),
    circuitId: circuitMatch?.[1],
    linkType: normalizedProvider ? `${normalizedProvider} ILL` : undefined
  };
}

function parseMetricNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  return Number(parseFloat(match[0]).toFixed(2));
}

function captureTextGroup(bodyText: string, pattern: RegExp): string | undefined {
  const match = bodyText.match(pattern);
  return match?.[1]?.trim();
}

function captureNumericGroup(bodyText: string, pattern: RegExp): number | undefined {
  const value = captureTextGroup(bodyText, pattern);
  return parseMetricNumber(value);
}

function parseInterfaceDetailsText(bodyText: string): InterfaceDetailSnapshot {
  const sanitized = bodyText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const utilizationMatches = [...sanitized.matchAll(/(\d+(?:\.\d+)?) % Transmit Percent Utilization (\d+(?:\.\d+)?) % Received Percent Utilization/g)];
  const realTimeUtilization = utilizationMatches[0];
  const dailyUtilization = utilizationMatches[1];

  return {
    alias: captureTextGroup(sanitized, /Alias\s+(.+?)\s+Index/i),
    interfaceType: captureTextGroup(sanitized, /Interface Type\s+(.+?)\s+MAC Address/i),
    ipAddress: captureTextGroup(sanitized, /IP Address\s+(.+?)\s+Administrative Status/i),
    administrativeStatus: captureTextGroup(sanitized, /Administrative Status\s+(.+?)\s+Operational Status/i),
    operationalStatus: captureTextGroup(sanitized, /Operational Status\s+(.+?)\s+Last Status Change/i),
    lastStatusChange: captureTextGroup(sanitized, /Last Status Change\s+(.+?)\s+Receive\s+Transmit/i),
    bandwidthReceiveMbps: captureNumericGroup(sanitized, /Interface Bandwidth\s+([0-9.]+\s*Mbps)\s+[0-9.]+\s*Mbps/i),
    bandwidthTransmitMbps: captureNumericGroup(sanitized, /Interface Bandwidth\s+[0-9.]+\s*Mbps\s+([0-9.]+\s*Mbps)/i),
    currentTrafficReceiveMbps: captureNumericGroup(sanitized, /Current Traffic\s+([0-9.]+\s*Mbps)\s+[0-9.]+\s*Mbps/i),
    currentTrafficTransmitMbps: captureNumericGroup(sanitized, /Current Traffic\s+[0-9.]+\s*Mbps\s+([0-9.]+\s*Mbps)/i),
    packetsPerSecondReceive: captureNumericGroup(sanitized, /Packets per Second\s+([0-9.]+\s*pps)\s+[0-9.]+\s*pps/i),
    packetsPerSecondTransmit: captureNumericGroup(sanitized, /Packets per Second\s+[0-9.]+\s*pps\s+([0-9.]+\s*pps)/i),
    averagePacketSizeReceive: captureNumericGroup(sanitized, /Average Packet Size\s+([0-9.]+\s*bytes)\s+[0-9.]+\s*bytes/i),
    averagePacketSizeTransmit: captureNumericGroup(sanitized, /Average Packet Size\s+[0-9.]+\s*bytes\s+([0-9.]+\s*bytes)/i),
    configuredSpeedMbps: captureNumericGroup(sanitized, /Configured Interface Speed\s+([0-9.]+\s*Mbps)/i),
    realtimeTransmitUtilization: realTimeUtilization ? Number(parseFloat(realTimeUtilization[1]).toFixed(2)) : undefined,
    realtimeReceiveUtilization: realTimeUtilization ? Number(parseFloat(realTimeUtilization[2]).toFixed(2)) : undefined,
    dailyTransmitUtilization: dailyUtilization ? Number(parseFloat(dailyUtilization[1]).toFixed(2)) : undefined,
    dailyReceiveUtilization: dailyUtilization ? Number(parseFloat(dailyUtilization[2]).toFixed(2)) : undefined
  };
}

async function ensureBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      channel: 'msedge',
      headless: true
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }

  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) {
    await browser.close();
  }
}

function buildBootstrapRequiredMessage(hostConfig: HostConfig, reason: string): string {
  return `${reason} Run npm run login --workspace collectors/solarwinds to seed or refresh the ${hostConfig.label.toLowerCase()} session.`;
}

function buildHostConfigs(runtimeConfig: Awaited<ReturnType<typeof loadSolarWindsRuntimeConfig>>): Record<HostKey, HostConfig> {
  return {
    servers: {
      key: 'servers',
      label: 'Servers',
      host: runtimeConfig.targets.servers.host,
      targetUrl: runtimeConfig.targets.servers.targetUrl,
      storageStatePath: SERVER_STORAGE_STATE_PATH,
      metadata: runtimeConfig.targets.servers.metadata
    },
    networks: {
      key: 'networks',
      label: 'Networks',
      host: runtimeConfig.targets.networks.host,
      targetUrl: runtimeConfig.targets.networks.targetUrl,
      storageStatePath: NETWORK_STORAGE_STATE_PATH,
      metadata: runtimeConfig.targets.networks.metadata
    }
  };
}

async function createHostContext(hostConfig: HostConfig): Promise<{ context: BrowserContext; hostConfig: HostConfig; hasSavedSession: boolean }> {
  prepareRuntimeStorage();

  const hasSavedSession = fs.existsSync(hostConfig.storageStatePath);
  const contextOptions: BrowserContextOptions = {
    viewport: { width: 1440, height: 900 }
  };

  if (hasSavedSession) {
    contextOptions.storageState = hostConfig.storageStatePath;
  }

  const browser = await ensureBrowser();
  const context = await browser.newContext(contextOptions);
  context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
  context.setDefaultTimeout(15000);
  return { context, hostConfig, hasSavedSession };
}

async function bodyText(page: Page): Promise<string> {
  try {
    return await page.locator('body').innerText();
  } catch {
    return '';
  }
}

async function isLoginPromptVisible(page: Page): Promise<boolean> {
  if (page.url().toLowerCase().includes('/login.aspx')) {
    return true;
  }

  return (await page.locator(LOGIN_BUTTON_SELECTOR).count()) > 0;
}

async function attemptCredentialLogin(page: Page, username: string, password: string) {
  const userField = page.locator(USERNAME_SELECTOR).first();
  const passField = page.locator(PASSWORD_SELECTOR).first();
  const loginButton = page.locator(LOGIN_BUTTON_SELECTOR).first();

  await userField.waitFor({ state: 'visible', timeout: 10000 });
  await passField.waitFor({ state: 'visible', timeout: 10000 });
  await userField.fill(username);
  await passField.fill(password);

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      loginButton.click()
    ]);
  } catch {
    // Some Orion views update inline without a full navigation.
  }

  await page.waitForTimeout(1500);
}

async function ensureAuthenticatedPage(
  hostConfig: HostConfig,
  credentials: { username: string; password: string },
  readySelector: string
): Promise<{ context: BrowserContext; page: Page }> {
  const { context, hasSavedSession } = await createHostContext(hostConfig);
  const page = await context.newPage();

  try {
    await page.goto(hostConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

    if (await isLoginPromptVisible(page)) {
      await attemptCredentialLogin(page, credentials.username, credentials.password);
    }

    if (await isLoginPromptVisible(page)) {
      const loginBodyText = await bodyText(page);
      if (/problem authorizing the specified windows account/i.test(loginBodyText)) {
        const message = hasSavedSession
          ? buildBootstrapRequiredMessage(hostConfig, `Saved SolarWinds session is no longer authorized on ${hostConfig.host}.`)
          : buildBootstrapRequiredMessage(hostConfig, `SolarWinds automatic credential login was rejected on ${hostConfig.host}.`);
        throw new Error(message);
      }

      const message = hasSavedSession
        ? buildBootstrapRequiredMessage(hostConfig, `SolarWinds saved session expired before reaching ${hostConfig.host}.`)
        : buildBootstrapRequiredMessage(hostConfig, `SolarWinds login did not complete on ${hostConfig.host}.`);
      throw new Error(message);
    }

    if (!page.url().toLowerCase().includes(hostConfig.targetUrl.toLowerCase())) {
      await page.goto(hostConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    }

    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
    await context.storageState({ path: hostConfig.storageStatePath });
    return { context, page };
  } catch (err) {
    await context.close();
    throw err;
  }
}

async function fetchJsonFromPage<T>(page: Page, url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<T> {
  const result = await page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
      credentials: 'include'
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  }, { url, init });

  if (!result.ok) {
    throw new Error(`SolarWinds request failed (${result.status}) for ${url}`);
  }

  return JSON.parse(result.text) as T;
}

async function postJsonWithXsrfFromPage<T>(page: Page, url: string, body: object): Promise<T> {
  const result = await page.evaluate(async ({ url, body }) => {
    const xsrfToken = document.cookie
      .split('; ')
      .find((part) => part.startsWith('XSRF-TOKEN='))
      ?.split('=')
      .slice(1)
      .join('=');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        ...(xsrfToken ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) } : {})
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  }, { url, body });

  if (!result.ok) {
    throw new Error(`SolarWinds request failed (${result.status}) for ${url}`);
  }

  return JSON.parse(result.text) as T;
}

async function fetchNetworkEntitySnapshot(page: Page, nodeNumericId: number): Promise<NetworkEntitySnapshot> {
  const result = await fetchJsonFromPage<{ data?: Array<{ displayName?: string; ipAddress?: string; status?: number; statusDescription?: string }> }>(
    page,
    `/api2/maps/v1/entities/0_Orion.Nodes_${nodeNumericId}/`
  );

  const entity = result.data?.[0];
  if (!entity) {
    return {};
  }

  return {
    displayName: entity.displayName,
    pollingIp: entity.ipAddress,
    status: parseNumericStatus(entity.status) ?? parseAssetStatus(entity.statusDescription)
  };
}

async function fetchAvailabilityToday(page: Page, nodeNumericId: number): Promise<number | undefined> {
  const result = await page.evaluate(async (nodeId) => {
    const xsrfToken = document.cookie
      .split('; ')
      .find((part) => part.startsWith('XSRF-TOKEN='))
      ?.split('=')
      .slice(1)
      .join('=');

    const response = await fetch('/Orion/Services/AsyncResources.asmx/GetAvailabilityStats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        ...(xsrfToken ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) } : {})
      },
      credentials: 'include',
      body: `{ nodeId: ${nodeId} }`
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  }, nodeNumericId);

  if (!result.ok) {
    throw new Error(`SolarWinds request failed (${result.status}) for /Orion/Services/AsyncResources.asmx/GetAvailabilityStats`);
  }

  const parsed = JSON.parse(result.text) as { d?: { Rows?: Array<[string, string, string?]> } };

  const rows = parsed.d?.Rows ?? [];
  const todayRow = rows.find((row) => row[0] === 'Today');
  if (!todayRow) {
    return undefined;
  }

  return parsePercentText(todayRow[1]);
}

async function fetchServerNodeDetails(page: Page, nodeId: number): Promise<NodeDetailsEnvelope['d']> {
  const result = await postJsonWithXsrfFromPage<NodeDetailsEnvelope>(
    page,
    '/Orion/Services/AsyncResources.asmx/GetNodeDetails',
    { nodeId, viewLimitationId: 0 }
  );

  return result.d;
}

function buildPerfstackEntityMetricUrl(entityId: string, metricId: string): string {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 12 * 60 * 60 * 1000);

  return `/api2/perfstack/metrics/${entityId}-${metricId}/?displayNameSource=&endTime=${encodeURIComponent(endTime.toISOString())}&groupBy=&lang=en-gb&limitationId=&resolution=180&startTime=${encodeURIComponent(startTime.toISOString())}&viewId=2`;
}

function buildPerfstackMetricUrl(nodeId: number, metricId: string): string {
  return buildPerfstackEntityMetricUrl(`0_Orion.Nodes_${nodeId}`, metricId);
}

function extractLatestMeasurementValue(metric: PerfstackMetricResponse): number | undefined {
  const measurements = Array.isArray(metric.measurements) ? metric.measurements : [];
  const latest = [...measurements]
    .reverse()
    .find((measurement) => typeof measurement.value === 'number' && !Number.isNaN(measurement.value));

  if (typeof latest?.value !== 'number') {
    return undefined;
  }

  return Number(latest.value.toFixed(2));
}

async function fetchLatestPerfstackMetric(page: Page, nodeId: number, metricIds: string[]): Promise<number | undefined> {
  for (const metricId of metricIds) {
    const metric = await fetchJsonFromPage<PerfstackMetricResponse>(page, buildPerfstackMetricUrl(nodeId, metricId));
    const latestValue = extractLatestMeasurementValue(metric);
    if (latestValue !== undefined) {
      return latestValue;
    }
  }

  return undefined;
}

async function fetchLatestPerfstackEntityMetric(page: Page, entityId: string, metricIds: string[]): Promise<number | undefined> {
  for (const metricId of metricIds) {
    const metric = await fetchJsonFromPage<PerfstackMetricResponse>(page, buildPerfstackEntityMetricUrl(entityId, metricId));
    const latestValue = extractLatestMeasurementValue(metric);
    if (latestValue !== undefined) {
      return latestValue;
    }
  }

  return undefined;
}

async function fetchPerfstackRelationships(page: Page, entityId: string): Promise<PerfstackEntityRelationship[]> {
  return fetchJsonFromPage<PerfstackEntityRelationship[]>(
    page,
    `/api2/perfstack/entities/${entityId}/relationships/?lang=en-gb&viewId=2`
  );
}

async function fetchFixedDiskUsage(page: Page, nodeId: number): Promise<number | undefined> {
  try {
    const relationships = await fetchPerfstackRelationships(page, `0_Orion.Nodes_${nodeId}`);
    const fixedDisks = relationships.filter((relationship) =>
      relationship.instanceType === 'Orion.Volumes'
      && typeof relationship.id === 'string'
      && typeof relationship.description === 'string'
      && relationship.description.toLowerCase().includes('fixed disk')
    );

    if (fixedDisks.length === 0) {
      return undefined;
    }

    const usages = await Promise.all(
      fixedDisks.map(async (volume) => {
        try {
          return await fetchLatestPerfstackEntityMetric(page, volume.id, ['Orion.VolumeUsageHistory.PercentDiskUsed']);
        } catch {
          return undefined;
        }
      })
    );

    const validUsages = usages.filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
    if (validUsages.length === 0) {
      return undefined;
    }

    return Number(Math.max(...validUsages).toFixed(2));
  } catch (err: any) {
    console.warn(`[${new Date().toISOString()}] SolarWinds fixed-disk usage probe failed for node ${nodeId}: ${err.message}`);
    return undefined;
  }
}

async function discoverServerInventory(page: Page, serverNames: string[]): Promise<ServerInventoryEntry[]> {
  const links = await page.locator('a[href*="NodeDetails.aspx?NetObject=N:"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      href: node.getAttribute('href') || ''
    }))
  );

  const inventory = new Map<string, ServerInventoryEntry>();
  for (const link of links) {
    const name = findKnownServerName(link.text, serverNames);
    const nodeIdMatch = link.href.match(/NetObject=N:(\d+)/i);
    if (!name || !nodeIdMatch) {
      continue;
    }

    if (!inventory.has(name)) {
      inventory.set(name, {
        name,
        nodeId: Number.parseInt(nodeIdMatch[1], 10)
      });
    }
  }

  // The SummaryView widget set is not deterministic on every load, so fall back
  // to the verified node inventory when a server link is absent from the page.
  return serverNames.map((name) => {
    const discovered = inventory.get(name);
    if (discovered) {
      return discovered;
    }

    return DEFAULT_SERVER_NODE_MAP.find((entry) => entry.name === name) ?? {
      name,
      nodeId: -1
    };
  }).filter((entry) => entry.nodeId > 0);
}

async function scrapeServerNode(page: Page, entry: ServerInventoryEntry): Promise<ServerMetric> {
  const [details, availabilityToday, cpu, memory, diskUsage] = await Promise.all([
    fetchServerNodeDetails(page, entry.nodeId),
    fetchAvailabilityToday(page, entry.nodeId),
    fetchLatestPerfstackMetric(page, entry.nodeId, ['Orion.CPUMultiLoad.AvgLoad', 'Orion.CPULoad.AvgLoad']),
    fetchLatestPerfstackMetric(page, entry.nodeId, ['Orion.CPULoad.AvgPercentMemoryUsed']),
    fetchFixedDiskUsage(page, entry.nodeId)
  ]);

  return {
    name: entry.name,
    nodeId: entry.nodeId,
    cpu,
    memory,
    disk: diskUsage !== undefined ? `${diskUsage}%` : undefined,
    status: parseAssetStatus(details?.NodeStatusDescription) ?? parseAssetStatus(details?.NodeStatusAltText),
    pollingIp: details?.IPAddressString || details?.HrefIPAddress,
    machineType: details?.MachineType,
    hardwareType: details?.HardwareType,
    lastBoot: details?.LastBoot,
    availabilityToday,
    sourceOfTruth: 'solarwinds',
    platform: 'on-prem'
  };
}

async function scrapeInterfaceDetailPage(context: BrowserContext, networkHost: string, interfaceId: number): Promise<InterfaceDetailSnapshot> {
  const detailPage = await context.newPage();

  try {
    await detailPage.goto(
      `http://${networkHost}/Orion/Interfaces/InterfaceDetails.aspx?NetObject=I:${interfaceId}&view=InterfaceDetails`,
      { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT }
    );
    await detailPage.waitForTimeout(2000);
    const bodyText = await detailPage.locator('body').innerText();
    return parseInterfaceDetailsText(bodyText);
  } finally {
    await detailPage.close();
  }
}

async function scrapeServers(page: Page, serverNames: string[]): Promise<ServerMetric[]> {
  const inventory = await discoverServerInventory(page, serverNames);
  const servers = await Promise.all(inventory.map((entry) => scrapeServerNode(page, entry)));
  if (servers.length === 0) {
    throw new Error('SolarWinds server scrape did not expose any recognized server rows');
  }

  return servers;
}

async function scrapeNetworks(
  context: BrowserContext,
  page: Page,
  networkHost: string,
  networkTargets: NetworkTargetConfig[]
): Promise<NetworkMetric[]> {
  const networks = new Map<string, NetworkMetric>();
  const rows = await page.locator('table.NeedsZebraStripes tr').all();

  for (const row of rows) {
    const nodeLink = row.locator('a[href*="NodeDetails.aspx?NetObject=N:"]').first();
    if (await nodeLink.count() === 0) {
      continue;
    }

    const nodeName = (await nodeLink.innerText()).trim();
    const nodeHref = await nodeLink.getAttribute('href');
    const nodeIdMatch = nodeHref?.match(/NetObject=N:(\d+)/i);
    const target = networkTargets.find((candidate) => String(candidate.nodeNumericId) === nodeIdMatch?.[1]);
    const networkId = target?.id ?? null;

    if (!networkId) {
      continue;
    }

    const cells = await row.locator('td').evaluateAll((tds) =>
      tds.map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim())
    );
    const interfaceName = cells[3] || undefined;
    const transmitUtilization = parsePercentText(cells[4]);
    const receiveUtilization = parsePercentText(cells[5]);
    const utilizationCandidates = [transmitUtilization, receiveUtilization].filter((value): value is number => value !== undefined);
    const utilization = utilizationCandidates.length > 0
      ? Number(Math.max(...utilizationCandidates).toFixed(2))
      : undefined;

    networks.set(networkId, {
      id: networkId,
      displayName: nodeName,
      interfaceName,
      transmitUtilization,
      receiveUtilization,
      utilization,
      status: await readStatusFromRow(row),
      uptime: 100
    });
  }

  await Promise.all(networkTargets.map(async (target) => {
    const probeTime = new Date().toISOString();
    const [entityResult, uptimeResult] = await Promise.allSettled([
      fetchNetworkEntitySnapshot(page, target.nodeNumericId),
      fetchAvailabilityToday(page, target.nodeNumericId)
    ]);

    if (entityResult.status === 'rejected') {
      console.warn(`[${probeTime}] SolarWinds network entity probe failed for ${target.nodeId}: ${entityResult.reason?.message ?? entityResult.reason}`);
    }

    if (uptimeResult.status === 'rejected') {
      console.warn(`[${probeTime}] SolarWinds network availability probe failed for ${target.nodeId}: ${uptimeResult.reason?.message ?? uptimeResult.reason}`);
    }

    const entity = entityResult.status === 'fulfilled' ? entityResult.value : {};
    const uptime = uptimeResult.status === 'fulfilled' ? uptimeResult.value : undefined;
    const carrierMetadata = target.kind === 'carrier'
      ? parseCarrierMetadata(entity.displayName)
      : {};

    if (entityResult.status === 'rejected' && uptimeResult.status === 'rejected' && !networks.has(target.id)) {
      networks.set(target.id, {
        id: target.id,
        uptime: 100
      });
      return;
    }

    networks.set(target.id, {
      id: target.id,
      ...(networks.get(target.id) ?? {}),
      displayName: entity.displayName ?? networks.get(target.id)?.displayName,
      pollingIp: entity.pollingIp ?? networks.get(target.id)?.pollingIp,
      status: entity.status ?? networks.get(target.id)?.status,
      uptime: uptime ?? networks.get(target.id)?.uptime ?? 100,
      ...carrierMetadata
    });
  }));

  for (const target of networkTargets) {
    if (target.kind !== 'sdwan' || !target.interfaceId) {
      continue;
    }

    try {
      const detailSnapshot = await scrapeInterfaceDetailPage(context, networkHost, target.interfaceId);
      networks.set(target.id, {
        id: target.id,
        ...(networks.get(target.id) ?? {}),
        ...detailSnapshot
      });
    } catch (err: any) {
      console.warn(`[${new Date().toISOString()}] SolarWinds interface detail scrape failed for ${target.id}: ${err.message}`);
    }
  }

  const result = [...networks.values()];
  if (result.length === 0) {
    throw new Error('SolarWinds network views did not expose any recognized links');
  }

  return result;
}

async function collectSolarWindsData() {
  if (cycleInProgress) {
    console.warn(`[${new Date().toISOString()}] Previous SolarWinds cycle is still running. Skipping overlap.`);
    return;
  }

  cycleInProgress = true;
  const cycleStartedAt = Date.now();
  const cycleAttemptedAt = new Date().toISOString();
  console.log(`[${cycleAttemptedAt}] Starting SolarWinds scraping session...`);
  const [runtimeConfig, runtimeSecrets] = await Promise.all([
    loadSolarWindsRuntimeConfig(API_URL),
    loadSolarWindsRuntimeSecrets(API_URL)
  ]);
  const hostConfigs = buildHostConfigs(runtimeConfig);
  const configuredServerNames = getConfiguredServerNames(runtimeConfig.targets.servers.metadata);
  const configuredNetworkTargets = getConfiguredNetworkTargets(runtimeConfig.targets.networks.metadata);

  const serverResult: SectionResult<ServerMetric[]> = { attemptedAt: cycleAttemptedAt };
  const networkResult: SectionResult<NetworkMetric[]> = { attemptedAt: cycleAttemptedAt };

  try {
    const credentials = {
      username: requireEnv('SW_USER', runtimeSecrets.username ?? undefined),
      password: requireEnv('SW_PASS', runtimeSecrets.password ?? undefined)
    };

    let serverContext: BrowserContext | undefined;
    try {
      const { context, page } = await ensureAuthenticatedPage(
        hostConfigs.servers,
        credentials,
        'table.NeedsZebraStripes, table.sw-custom-query-table'
      );
      serverContext = context;
      serverResult.data = await scrapeServers(page, configuredServerNames);
      serverResult.reportedAt = new Date().toISOString();
      await context.storageState({ path: hostConfigs.servers.storageStatePath });
    } catch (err: any) {
      serverResult.error = err.message;
      serverResult.reportedAt = new Date().toISOString();
      console.error(`[${new Date().toISOString()}] SolarWinds server scrape failed:`, err.message);
    } finally {
      if (serverContext) {
        await serverContext.close();
      }
    }

    let networkContext: BrowserContext | undefined;
    try {
      const { context, page } = await ensureAuthenticatedPage(
        hostConfigs.networks,
        credentials,
        'table.NeedsZebraStripes'
      );
      networkContext = context;
      networkResult.data = await scrapeNetworks(context, page, hostConfigs.networks.host, configuredNetworkTargets);
      networkResult.reportedAt = new Date().toISOString();
      await context.storageState({ path: hostConfigs.networks.storageStatePath });
    } catch (err: any) {
      networkResult.error = err.message;
      networkResult.reportedAt = new Date().toISOString();
      console.error(`[${new Date().toISOString()}] SolarWinds network scrape failed:`, err.message);
    } finally {
      if (networkContext) {
        await networkContext.close();
      }
    }

    await postUpdate({
      solarwinds: {
        meta: {
          attemptedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          sections: {
            servers: {
              attemptedAt: serverResult.attemptedAt,
              finishedAt: serverResult.reportedAt ?? serverResult.attemptedAt,
              ok: Boolean(serverResult.data),
              error: serverResult.error,
              targetHost: hostConfigs.servers.host
            },
            networks: {
              attemptedAt: networkResult.attemptedAt,
              finishedAt: networkResult.reportedAt ?? networkResult.attemptedAt,
              ok: Boolean(networkResult.data),
              error: networkResult.error,
              targetHost: hostConfigs.networks.host
            }
          }
        },
        ...(serverResult.data ? { servers: serverResult.data } : {}),
        ...(networkResult.data ? { networks: networkResult.data } : {})
      }
    });
    console.log(`[${new Date().toISOString()}] SolarWinds metrics posted successfully.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Error in SolarWinds scraper:`, err.message);
    try {
      await postUpdate({
        solarwinds: {
          meta: {
            attemptedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            ok: false,
            error: err.message,
            sections: {
              servers: {
                attemptedAt: serverResult.attemptedAt,
                finishedAt: serverResult.reportedAt ?? serverResult.attemptedAt,
                ok: false,
                error: serverResult.error ?? err.message,
                targetHost: hostConfigs.servers.host
              } satisfies UpdateMetaPayload,
              networks: {
                attemptedAt: networkResult.attemptedAt,
                finishedAt: networkResult.reportedAt ?? networkResult.attemptedAt,
                ok: false,
                error: networkResult.error ?? err.message,
                targetHost: hostConfigs.networks.host
              } satisfies UpdateMetaPayload
            }
          }
        }
      });
    } catch (reportErr: any) {
      console.error(`[${new Date().toISOString()}] Failed to report SolarWinds collector failure to gateway:`, reportErr.message);
    }
  } finally {
    cycleInProgress = false;
    const elapsed = Date.now() - cycleStartedAt;
    scheduleNextCycle(Math.max(1000, runtimeConfig.pollIntervalMs - elapsed));
  }
}

function scheduleNextCycle(delayMs: number) {
  if (nextCycleTimer) {
    clearTimeout(nextCycleTimer);
  }

  nextCycleTimer = setTimeout(() => {
    void collectSolarWindsData();
  }, delayMs);
}

async function shutdown() {
  if (nextCycleTimer) {
    clearTimeout(nextCycleTimer);
  }

  await closeBrowser();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

console.log('SolarWinds scraper service started.');
void collectSolarWindsData();
