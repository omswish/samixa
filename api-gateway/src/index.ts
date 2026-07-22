import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { createHash } from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import {
  getDashboardState,
  getDashboardStateMirrorPayload,
  hydrateStateFromPostgres,
  updateNutanix,
  updateSolarWinds,
  updateSymphony
} from './db';
import {
  bootstrapLocalAuthCredentialsNow,
  getLocalAuthCredentialFromPostgres,
  getAssetTelemetryHistoryFromPostgres,
  CollectorRunPayload,
  isPostgresMirrorEnabled,
  isPostgresPrimaryMetricsEnabled,
  listAppActionAuditFromPostgres,
  listLocalAuthCredentialsFromPostgres,
  mirrorDashboardStateToPostgres,
  recordAppActionAuditInPostgres,
  recordCollectorRunsToPostgres,
  recordGatewayIngestEventToPostgres,
  replaceCollectorSecretConfigInPostgres,
  syncDashboardStateToPostgresNow,
  touchLocalAuthCredentialLoginInPostgres,
  upsertLocalAuthCredentialInPostgres,
  upsertCollectorTargetConfigInPostgres
} from './postgres';
import {
  authenticateLegacyLocalAppUser,
  buildLocalAuthBootstrapSeeds,
  createLocalAppPasswordRecord,
  getLegacyLocalAuthStatus,
  getLocalAppPrincipal,
  saveLegacyLocalAppPasswords,
  verifyLocalAppPassword
} from './localAppAuth';
import { ensureCollectorTargetConfigBootstrap, loadRuntimeCollectorConfig, RuntimeConfigSourceName } from './runtimeConfig';
import { ensureCollectorSecretConfigBootstrap, loadRuntimeCollectorSecrets } from './runtimeSecrets';
import { encryptSecret } from './secretCrypto';
import { replaceLocalCollectorSecretConfig, upsertLocalCollectorTargetConfig } from './localCollectorStore';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const server = http.createServer(app);
const listenerScope = host === '127.0.0.1' || host === 'localhost' ? 'loopback' : 'network';

// WebSocket Server
const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send current state immediately on connection
  try {
    const currentState = getDashboardState();
    ws.send(JSON.stringify({ type: 'FULL_STATE', data: currentState }));
  } catch (err) {
    console.error('Error fetching initial DB state:', err);
  }

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.type === 'REQUEST_FULL_STATE') {
        const currentState = getDashboardState();
        ws.send(JSON.stringify({ type: 'FULL_STATE', data: currentState }));
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Broadcast helper
function broadcastUpdate(source: string) {
  try {
    const updatedState = getDashboardState();
    const payload = JSON.stringify({
      type: 'METRIC_UPDATE',
      source,
      data: updatedState,
      timestamp: new Date().toISOString()
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('Failed to broadcast updates:', err);
  }
}

// REST Routes
app.get('/api/status', (req, res) => {
  try {
    const state = getDashboardState();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telemetry-history', async (req, res) => {
  if (!isPostgresMirrorEnabled()) {
    res.status(503).json({ error: 'Postgres telemetry history is not enabled.' });
    return;
  }

  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim() : '';
  const metricName = typeof req.query.metricName === 'string' ? req.query.metricName.trim() : null;
  const since = typeof req.query.since === 'string' ? req.query.since.trim() : null;
  const until = typeof req.query.until === 'string' ? req.query.until.trim() : null;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : null;

  if (!assetId) {
    res.status(400).json({ error: 'assetId is required.' });
    return;
  }

  if (since && Number.isNaN(Date.parse(since))) {
    res.status(400).json({ error: 'Invalid since timestamp.' });
    return;
  }

  if (until && Number.isNaN(Date.parse(until))) {
    res.status(400).json({ error: 'Invalid until timestamp.' });
    return;
  }

  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    res.status(400).json({ error: 'limit must be a positive number.' });
    return;
  }

  try {
    const points = await getAssetTelemetryHistoryFromPostgres({
      assetId,
      metricName,
      since,
      until,
      limit
    });

    res.json({
      assetId,
      metricName,
      points
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telemetry-history', async (req, res) => {
  if (!isPostgresMirrorEnabled()) {
    res.status(503).json({ error: 'Postgres telemetry history is not enabled.' });
    return;
  }

  const queries = Array.isArray(req.body?.queries) ? req.body.queries : null;
  if (!queries) {
    res.status(400).json({ error: 'queries array is required.' });
    return;
  }

  const normalizedQueries = queries.map((query: Record<string, unknown>) => ({
    assetId: typeof query?.assetId === 'string' ? query.assetId.trim() : '',
    metricName: typeof query?.metricName === 'string' ? query.metricName.trim() : null,
    since: typeof query?.since === 'string' ? query.since.trim() : null,
    until: typeof query?.until === 'string' ? query.until.trim() : null,
    limit: typeof query?.limit === 'number'
      ? query.limit
      : typeof query?.limit === 'string'
        ? Number(query.limit)
        : null
  }));

  for (const query of normalizedQueries) {
    if (!query.assetId) {
      res.status(400).json({ error: 'Each query requires assetId.' });
      return;
    }

    if (query.since && Number.isNaN(Date.parse(query.since))) {
      res.status(400).json({ error: `Invalid since timestamp for ${query.assetId}.` });
      return;
    }

    if (query.until && Number.isNaN(Date.parse(query.until))) {
      res.status(400).json({ error: `Invalid until timestamp for ${query.assetId}.` });
      return;
    }

    if (query.limit !== null && (!Number.isFinite(query.limit) || query.limit <= 0)) {
      res.status(400).json({ error: `limit must be a positive number for ${query.assetId}.` });
      return;
    }
  }

  try {
    const series = await Promise.all(
      normalizedQueries.map(async (query: {
        assetId: string;
        metricName: string | null;
        since: string | null;
        until: string | null;
        limit: number | null;
      }) => ({
        assetId: query.assetId,
        metricName: query.metricName,
        points: await getAssetTelemetryHistoryFromPostgres(query)
      }))
    );

    res.json({ series });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function digestPayload(payload: unknown): string | null {
  try {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  } catch {
    return null;
  }
}

function inferCollectorSource(payload: any): string {
  if (payload?.nutanix) {
    return 'nutanix';
  }
  if (payload?.solarwinds) {
    return 'solarwinds';
  }
  if (payload?.symphony) {
    return 'symphony';
  }

  return 'unknown';
}

function classifyFailureDomain(errorMessage?: string | null): string | null {
  if (!errorMessage) {
    return null;
  }

  const message = errorMessage.toLowerCase();
  if (message.includes('timeout')) {
    return 'timeout';
  }
  if (
    message.includes('session expired')
    || message.includes('authentication')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('login')
    || message.includes('password')
  ) {
    return 'authentication';
  }
  if (
    message.includes('err_address_unreachable')
    || message.includes('err_name_not_resolved')
    || message.includes('err_network')
    || message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('econnrefused')
    || message.includes('ehostunreach')
  ) {
    return 'network';
  }
  if (message.includes('locator') || message.includes('selector')) {
    return 'selector';
  }
  if (
    message.includes('widget')
    || message.includes('dashboard')
    || message.includes('could not be read reliably')
    || message.includes('returned no usable payload')
  ) {
    return 'portal';
  }

  return 'unknown';
}

function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) {
    return false;
  }

  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function requireLoopback(req: express.Request, res: express.Response): boolean {
  if (isLoopbackAddress(req.socket.remoteAddress)) {
    return true;
  }

  res.status(403).json({ error: 'This endpoint is available only from loopback clients.' });
  return false;
}

function parseTargetUrlHost(targetUrl: string): string | null {
  try {
    return new URL(targetUrl).host;
  } catch {
    return null;
  }
}

async function buildAdminSettingsPayload() {
  const [nutanixConfig, solarwindsConfig, symphonyConfig] = await Promise.all([
    loadRuntimeCollectorConfig('nutanix'),
    loadRuntimeCollectorConfig('solarwinds'),
    loadRuntimeCollectorConfig('symphony')
  ]);
  const [nutanixSecrets, solarwindsSecrets, symphonySecrets] = await Promise.all([
    loadRuntimeCollectorSecrets('nutanix'),
    loadRuntimeCollectorSecrets('solarwinds'),
    loadRuntimeCollectorSecrets('symphony')
  ]);
  const buildTarget = (
    targetName: string,
    configPayload: Awaited<ReturnType<typeof loadRuntimeCollectorConfig>>,
    secretPayload: Awaited<ReturnType<typeof loadRuntimeCollectorSecrets>>
  ) => {
    const configTarget = configPayload.targets[targetName];
    const secretTarget = secretPayload.targets[targetName];

    return {
      configKey: configTarget?.configKey ?? secretTarget?.configKey ?? null,
      targetName,
      targetUrl: configTarget?.targetUrl ?? '',
      host: configTarget?.host ?? null,
      enabled: configTarget?.enabled ?? false,
      owner: configTarget?.owner ?? null,
      pollIntervalSeconds: configTarget?.pollIntervalSeconds ?? null,
      notes: configTarget?.notes ?? null,
      metadata: configTarget?.metadata ?? {},
      username: secretTarget?.username ?? null,
      passwordConfigured: Boolean(secretTarget?.password),
      configOrigin: configTarget?.configOrigin ?? configPayload.backingStore,
      secretOrigin: secretTarget?.secretOrigin ?? secretPayload.backingStore
    };
  };

  return {
    collectors: {
      nutanix: {
        primary: buildTarget('primary', nutanixConfig, nutanixSecrets)
      },
      solarwinds: {
        servers: buildTarget('servers', solarwindsConfig, solarwindsSecrets),
        networks: buildTarget('networks', solarwindsConfig, solarwindsSecrets)
      },
      symphony: {
        primary: buildTarget('primary', symphonyConfig, symphonySecrets)
      }
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface AdminCollectorTargetInput {
  configKey?: unknown;
  targetUrl?: unknown;
  enabled?: unknown;
  owner?: unknown;
  notes?: unknown;
  pollIntervalSeconds?: unknown;
  metadata?: unknown;
  username?: unknown;
  password?: unknown;
  clearPassword?: unknown;
}

interface AdminSettingsCollectorsInput {
  nutanix?: { primary?: AdminCollectorTargetInput };
  solarwinds?: {
    servers?: AdminCollectorTargetInput;
    networks?: AdminCollectorTargetInput;
  };
  symphony?: { primary?: AdminCollectorTargetInput };
}

type InternalAuthUsername = 'admin' | 'operator';

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function isAuditResult(value: unknown): value is 'success' | 'failed' | 'denied' {
  return value === 'success' || value === 'failed' || value === 'denied';
}

function isAuditSeverity(value: unknown): value is 'info' | 'warning' | 'critical' {
  return value === 'info' || value === 'warning' || value === 'critical';
}

function buildCollectorRuns(payload: any): CollectorRunPayload[] {
  const runs: CollectorRunPayload[] = [];
  const defaultTimestamp = new Date().toISOString();

  if (payload?.nutanix) {
    const meta = payload.nutanix.meta ?? {};
    const success = meta.ok !== false;
    runs.push({
      collectorSource: 'nutanix',
      sectionKey: 'nutanix',
      startedAt: meta.attemptedAt ?? defaultTimestamp,
      finishedAt: meta.finishedAt ?? meta.attemptedAt ?? defaultTimestamp,
      status: success ? 'success' : 'failed',
      failureDomain: success ? null : classifyFailureDomain(meta.error),
      errorMessage: meta.error ?? null,
      recordsWritten: Array.isArray(payload.nutanix.vms) ? payload.nutanix.vms.length : null,
      targetHost: meta.targetHost ?? process.env.NUTANIX_HOST ?? null,
      metaJson: JSON.stringify(meta)
    });
  }

  if (payload?.solarwinds) {
    const meta = payload.solarwinds.meta ?? {};
    const sections = meta.sections ?? {};

    const sectionDefinitions: Array<{
      sectionKey: 'servers' | 'networks';
      data: unknown;
      targetHost: string | null;
    }> = [
      {
        sectionKey: 'servers',
        data: payload.solarwinds.servers,
        targetHost: sections.servers?.targetHost ?? process.env.SW_HOST_SERVERS ?? null
      },
      {
        sectionKey: 'networks',
        data: payload.solarwinds.networks,
        targetHost: sections.networks?.targetHost ?? process.env.SW_HOST_NETWORKS ?? null
      }
    ];

    for (const definition of sectionDefinitions) {
      const sectionMeta = sections[definition.sectionKey] ?? {};
      const hasRows = Array.isArray(definition.data);
      const success = sectionMeta.ok === false ? false : hasRows;

      if (!sectionMeta.attemptedAt && !hasRows && meta.ok !== false) {
        continue;
      }

      runs.push({
        collectorSource: 'solarwinds',
        sectionKey: definition.sectionKey,
        startedAt: sectionMeta.attemptedAt ?? meta.attemptedAt ?? defaultTimestamp,
        finishedAt: sectionMeta.finishedAt ?? sectionMeta.attemptedAt ?? meta.finishedAt ?? meta.attemptedAt ?? defaultTimestamp,
        status: success ? 'success' : 'failed',
        failureDomain: success ? null : classifyFailureDomain(sectionMeta.error ?? meta.error),
        errorMessage: sectionMeta.error ?? meta.error ?? null,
        recordsWritten: hasRows ? (definition.data as any[]).length : 0,
        targetHost: definition.targetHost,
        metaJson: JSON.stringify({ overall: meta, section: sectionMeta })
      });
    }
  }

  if (payload?.symphony) {
    const meta = payload.symphony.meta ?? {};
    const success = meta.ok !== false;
    const symphonyMetricCount = [
      payload.symphony.openIncidents,
      payload.symphony.serviceRequests,
      payload.symphony.workOrders,
      payload.symphony.changeRecords,
      payload.symphony.priority1Incidents,
      payload.symphony.priority2Incidents,
      payload.symphony.onboardingRequests,
      payload.symphony.securityRequests,
      payload.symphony.serviceRequestsSla,
      payload.symphony.incidentsResponseSla,
      payload.symphony.incidentsResolutionSla,
      payload.symphony.requestsResponseSla,
      payload.symphony.requestsResolutionSla
    ].filter((value) => value !== undefined).length;

    runs.push({
      collectorSource: 'symphony',
      sectionKey: 'symphony',
      startedAt: meta.attemptedAt ?? defaultTimestamp,
      finishedAt: meta.finishedAt ?? meta.attemptedAt ?? defaultTimestamp,
      status: success ? 'success' : 'failed',
      failureDomain: success ? null : classifyFailureDomain(meta.error),
      errorMessage: meta.error ?? null,
      recordsWritten: success ? symphonyMetricCount : 0,
      targetHost: meta.targetHost ?? null,
      metaJson: JSON.stringify(meta)
    });
  }

  return runs;
}

function normalizeInternalAuthUsername(value: unknown): InternalAuthUsername | null {
  return value === 'admin' || value === 'operator' ? value : null;
}

async function getAppAuthStatusPayload() {
  if (!isPostgresMirrorEnabled()) {
    return getLegacyLocalAuthStatus();
  }

  const credentials = await listLocalAuthCredentialsFromPostgres();
  if (credentials.length === 0) {
    return getLegacyLocalAuthStatus();
  }

  const credentialMap = new Map(credentials.map((entry) => [entry.username, entry]));
  const users = {
    admin: credentialMap.get('admin'),
    operator: credentialMap.get('operator')
  };

  return {
    mode: 'postgres' as const,
    updatedAt: credentials
      .map((entry) => entry.updatedAt)
      .sort()
      .at(-1) ?? null,
    users: {
      admin: {
        custom: users.admin ? users.admin.passwordSource !== 'env' : false,
        source: users.admin?.passwordSource ?? 'env',
        lastLoginAt: users.admin?.lastLoginAt ?? null,
        loginId: getLocalAppPrincipal('admin')?.loginId || 'admin',
        displayName: users.admin?.displayName || 'Admin'
      },
      operator: {
        custom: users.operator ? users.operator.passwordSource !== 'env' : false,
        source: users.operator?.passwordSource ?? 'env',
        lastLoginAt: users.operator?.lastLoginAt ?? null,
        loginId: getLocalAppPrincipal('operator')?.loginId || 'operator',
        displayName: users.operator?.displayName || 'Operator'
      }
    }
  };
}

async function resolveAuthenticatedAppUser(
  username: InternalAuthUsername,
  password: string,
  options?: {
    requireAdmin?: boolean;
  }
) {
  if (!isPostgresMirrorEnabled()) {
    return authenticateLegacyLocalAppUser(username, password, options);
  }

  const principal = getLocalAppPrincipal(username);
  if (!principal) {
    return null;
  }

  if (options?.requireAdmin && principal.role !== 'admin') {
    return null;
  }

  const credential = await getLocalAuthCredentialFromPostgres(username);
  if (!credential) {
    return authenticateLegacyLocalAppUser(username, password, options);
  }

  const passwordValid = verifyLocalAppPassword(password, {
    salt: credential.passwordSalt,
    hash: credential.passwordHash
  });
  if (!passwordValid) {
    return null;
  }

  await touchLocalAuthCredentialLoginInPostgres(username);
  return principal;
}

async function resolveAppUser(username: InternalAuthUsername) {
  const principal = getLocalAppPrincipal(username);
  if (!principal) {
    return null;
  }

  if (!isPostgresMirrorEnabled()) {
    return principal;
  }

  const credential = await getLocalAuthCredentialFromPostgres(username);
  if (!credential) {
    return principal;
  }

  return {
    username: credential.username,
    displayName: credential.displayName,
    loginId: principal.loginId,
    role: credential.role
  };
}

app.post('/api/update', async (req, res) => {
  const { nutanix, solarwinds, symphony } = req.body;
  const payloadDigest = digestPayload(req.body);
  const collectorSource = inferCollectorSource(req.body);
  const sourceHost = req.socket.remoteAddress || null;
  const collectorRuns = buildCollectorRuns(req.body);

  try {
    let source = '';
    if (nutanix) {
      updateNutanix(nutanix);
      source = 'nutanix';
    }
    if (solarwinds) {
      updateSolarWinds(solarwinds);
      source = 'solarwinds';
    }
    if (symphony) {
      updateSymphony(symphony);
      source = 'symphony';
    }

    let postgresPrimaryWarning: string | null = null;
    if (source && isPostgresPrimaryMetricsEnabled()) {
      try {
        await syncDashboardStateToPostgresNow(getDashboardStateMirrorPayload());
      } catch (error: any) {
        postgresPrimaryWarning = error?.message || 'Postgres primary state sync failed';
        console.error('[postgres] primary state sync failed; serving local fallback cache:', error);
      }
    }

    if (source) {
      recordCollectorRunsToPostgres(collectorRuns);
      broadcastUpdate(source);
      recordGatewayIngestEventToPostgres({
        collectorSource: source,
        receivedAt: new Date().toISOString(),
        httpStatus: 200,
        ingestStatus: 'accepted',
        payloadDigest,
        sourceHost,
        listenerScope
      });
      res.json({
        success: true,
        message: `Updated data from ${source}`,
        ...(postgresPrimaryWarning ? { warning: postgresPrimaryWarning } : {})
      });
    } else {
      recordGatewayIngestEventToPostgres({
        collectorSource,
        receivedAt: new Date().toISOString(),
        httpStatus: 400,
        ingestStatus: 'rejected',
        errorMessage: 'Invalid update payload. Must contain nutanix, solarwinds, or symphony object.',
        payloadDigest,
        sourceHost,
        listenerScope
      });
      res.status(400).json({ error: 'Invalid update payload. Must contain nutanix, solarwinds, or symphony object.' });
    }
  } catch (err: any) {
    console.error('Error processing update:', err);
    recordCollectorRunsToPostgres(collectorRuns);
    recordGatewayIngestEventToPostgres({
      collectorSource,
      receivedAt: new Date().toISOString(),
      httpStatus: 500,
      ingestStatus: 'db_failed',
      errorMessage: err.message,
      payloadDigest,
      sourceHost,
      listenerScope
    });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runtime-config/:source', async (req, res) => {
  const sourceName = req.params.source as RuntimeConfigSourceName;
  if (!['nutanix', 'solarwinds', 'symphony'].includes(sourceName)) {
    res.status(404).json({ error: 'Unknown runtime config source.' });
    return;
  }

  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    res.status(403).json({ error: 'Runtime config is available only from loopback clients.' });
    return;
  }

  try {
    const payload = await loadRuntimeCollectorConfig(sourceName);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runtime-secrets/:source', async (req, res) => {
  const sourceName = req.params.source as RuntimeConfigSourceName;
  if (!['nutanix', 'solarwinds', 'symphony'].includes(sourceName)) {
    res.status(404).json({ error: 'Unknown runtime secret source.' });
    return;
  }

  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    res.status(403).json({ error: 'Runtime secrets are available only from loopback clients.' });
    return;
  }

  try {
    const payload = await loadRuntimeCollectorSecrets(sourceName);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  try {
    res.json(await buildAdminSettingsPayload());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  const collectors = req.body?.collectors as AdminSettingsCollectorsInput | undefined;

  if (!isPlainObject(collectors)) {
    res.status(400).json({ error: 'Invalid settings payload.' });
    return;
  }

  const typedCollectors = collectors as AdminSettingsCollectorsInput;

  try {
    const saveToPostgres = isPostgresMirrorEnabled();
    const existingSecrets = {
      nutanix: await loadRuntimeCollectorSecrets('nutanix'),
      solarwinds: await loadRuntimeCollectorSecrets('solarwinds'),
      symphony: await loadRuntimeCollectorSecrets('symphony')
    };

    const targetWrites = [
      {
        sourceName: 'nutanix' as const,
        targetName: 'primary',
        target: typedCollectors.nutanix?.primary
      },
      {
        sourceName: 'solarwinds' as const,
        targetName: 'servers',
        target: typedCollectors.solarwinds?.servers
      },
      {
        sourceName: 'solarwinds' as const,
        targetName: 'networks',
        target: typedCollectors.solarwinds?.networks
      },
      {
        sourceName: 'symphony' as const,
        targetName: 'primary',
        target: typedCollectors.symphony?.primary
      }
    ];

    for (const write of targetWrites) {
      if (!isPlainObject(write.target)) {
        continue;
      }

      const configKey = typeof write.target.configKey === 'string' && write.target.configKey.trim()
        ? write.target.configKey.trim()
        : `${write.sourceName}:${write.targetName}`;
      const targetUrl = typeof write.target.targetUrl === 'string' ? write.target.targetUrl.trim() : '';
      if (!targetUrl) {
        throw new Error(`Target URL is required for ${write.sourceName}:${write.targetName}.`);
      }

      const targetSeed = {
        configKey,
        sourceName: write.sourceName,
        targetName: write.targetName,
        targetUrl,
        host: parseTargetUrlHost(targetUrl),
        enabled: write.target.enabled !== false,
        owner: typeof write.target.owner === 'string' ? write.target.owner.trim() || null : null,
        notes: typeof write.target.notes === 'string' ? write.target.notes.trim() || null : null,
        pollIntervalSeconds: Number.isFinite(Number(write.target.pollIntervalSeconds))
          ? Number(write.target.pollIntervalSeconds)
          : null,
        metadataJson: sanitizeMetadata(write.target.metadata)
      };

      if (saveToPostgres) {
        await upsertCollectorTargetConfigInPostgres(targetSeed);
      } else {
        upsertLocalCollectorTargetConfig(targetSeed);
      }

      const existingSecretTarget = existingSecrets[write.sourceName].targets[write.targetName];
      const nextUsername = typeof write.target.username === 'string'
        ? write.target.username.trim()
        : existingSecretTarget?.username ?? null;
      const nextPassword = typeof write.target.password === 'string'
        ? write.target.password
        : undefined;
      const clearPassword = Boolean(write.target.clearPassword);

      const secretSeeds: Array<{
        configKey: string;
        sourceName: 'nutanix' | 'solarwinds' | 'symphony';
        targetName: string;
        secretName: 'username' | 'password';
        keyVersion: string;
        secretCipherJson: ReturnType<typeof encryptSecret>;
      }> = [];
      if (nextUsername) {
        secretSeeds.push({
          configKey,
          sourceName: write.sourceName,
          targetName: write.targetName,
          secretName: 'username',
          keyVersion: 'v1',
          secretCipherJson: encryptSecret(nextUsername)
        });
      }

      const passwordValue = clearPassword
        ? null
        : nextPassword !== undefined
          ? nextPassword
          : existingSecretTarget?.password ?? null;

      if (passwordValue) {
        secretSeeds.push({
          configKey,
          sourceName: write.sourceName,
          targetName: write.targetName,
          secretName: 'password',
          keyVersion: 'v1',
          secretCipherJson: encryptSecret(passwordValue)
        });
      }

      if (saveToPostgres) {
        await replaceCollectorSecretConfigInPostgres(write.sourceName, write.targetName, configKey, secretSeeds);
      } else {
        replaceLocalCollectorSecretConfig(write.sourceName, write.targetName, configKey, secretSeeds);
      }
    }
    res.json(await buildAdminSettingsPayload());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/app-auth', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  try {
    res.json(await getAppAuthStatusPayload());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/app-auth', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  const adminPassword = typeof req.body?.adminPassword === 'string' ? req.body.adminPassword.trim() : '';
  const operatorPassword = typeof req.body?.operatorPassword === 'string' ? req.body.operatorPassword.trim() : '';

  if (!adminPassword && !operatorPassword) {
    res.status(400).json({ error: 'Enter at least one password to update.' });
    return;
  }

  if (adminPassword && adminPassword.length < 4) {
    res.status(400).json({ error: 'Admin password must be at least 4 characters.' });
    return;
  }

  if (operatorPassword && operatorPassword.length < 4) {
    res.status(400).json({ error: 'Operator password must be at least 4 characters.' });
    return;
  }

  try {
    if (isPostgresMirrorEnabled()) {
      const writes: Array<Promise<unknown>> = [];

      if (adminPassword) {
        const record = createLocalAppPasswordRecord(adminPassword);
        writes.push(upsertLocalAuthCredentialInPostgres({
          username: 'admin',
          displayName: 'Admin',
          role: 'admin',
          passwordSalt: record.salt,
          passwordHash: record.hash,
          passwordSource: 'postgres'
        }));
      }

      if (operatorPassword) {
        const record = createLocalAppPasswordRecord(operatorPassword);
        writes.push(upsertLocalAuthCredentialInPostgres({
          username: 'operator',
          displayName: 'Operator',
          role: 'viewer',
          passwordSalt: record.salt,
          passwordHash: record.hash,
          passwordSource: 'postgres'
        }));
      }

      await Promise.all(writes);
    } else {
      saveLegacyLocalAppPasswords({
        adminPassword: adminPassword || null,
        operatorPassword: operatorPassword || null
      });
    }

    res.json({
      status: await getAppAuthStatusPayload(),
      message: [
        adminPassword ? 'Admin password updated.' : null,
        operatorPassword ? 'Operator password updated.' : null
      ].filter(Boolean).join(' ')
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/auth/verify', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  const username = normalizeInternalAuthUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const requireAdmin = req.body?.requireAdmin === true;

  if (!username) {
    res.status(400).json({ error: 'Valid username is required.' });
    return;
  }

  if (!password) {
    res.status(400).json({ error: 'Password is required.' });
    return;
  }

  try {
    const principal = await resolveAuthenticatedAppUser(username, password, { requireAdmin });
    if (!principal) {
      res.status(403).json({ error: 'Invalid credentials.' });
      return;
    }

    res.json({ user: principal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal/auth/user/:username', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  const username = normalizeInternalAuthUsername(req.params.username);
  if (!username) {
    res.status(404).json({ error: 'Unknown application user.' });
    return;
  }

  try {
    const principal = await resolveAppUser(username);
    if (!principal) {
      res.status(404).json({ error: 'Unknown application user.' });
      return;
    }

    res.json({ user: principal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  if (!isPostgresMirrorEnabled()) {
    res.status(503).json({ error: 'Postgres audit store is not enabled.' });
    return;
  }

  const actionType = typeof req.query.actionType === 'string' ? req.query.actionType.trim() : null;
  const actionResult = req.query.actionResult === 'success' || req.query.actionResult === 'failed' || req.query.actionResult === 'denied'
    ? req.query.actionResult
    : null;
  const actorUsername = typeof req.query.actorUsername === 'string' ? req.query.actorUsername.trim() : null;
  const surface = typeof req.query.surface === 'string' ? req.query.surface.trim() : null;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : null;

  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    res.status(400).json({ error: 'limit must be a positive number.' });
    return;
  }

  try {
    const rows = await listAppActionAuditFromPostgres({
      actionType,
      actionResult,
      actorUsername,
      surface,
      limit
    });
    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/audit', async (req, res) => {
  if (!requireLoopback(req, res)) {
    return;
  }

  if (!isPostgresMirrorEnabled()) {
    res.status(503).json({ error: 'Postgres audit store is not enabled.' });
    return;
  }

  const actionType = typeof req.body?.actionType === 'string' ? req.body.actionType.trim() : '';
  const actionResult = req.body?.actionResult;
  const severity = req.body?.severity;
  const occurredAt = typeof req.body?.occurredAt === 'string' && req.body.occurredAt.trim()
    ? req.body.occurredAt.trim()
    : new Date().toISOString();

  if (!actionType) {
    res.status(400).json({ error: 'actionType is required.' });
    return;
  }

  if (!isAuditResult(actionResult)) {
    res.status(400).json({ error: 'actionResult must be success, failed, or denied.' });
    return;
  }

  if (severity !== undefined && !isAuditSeverity(severity)) {
    res.status(400).json({ error: 'severity must be info, warning, or critical.' });
    return;
  }

  if (Number.isNaN(Date.parse(occurredAt))) {
    res.status(400).json({ error: 'occurredAt must be a valid timestamp.' });
    return;
  }

  try {
    await recordAppActionAuditInPostgres({
      occurredAt,
      actionType,
      actionResult,
      severity: isAuditSeverity(severity) ? severity : 'info',
      actorUsername: typeof req.body?.actorUsername === 'string' ? req.body.actorUsername.trim() || null : null,
      actorRole: typeof req.body?.actorRole === 'string' ? req.body.actorRole.trim() || null : null,
      surface: typeof req.body?.surface === 'string' ? req.body.surface.trim() || null : null,
      sourceIp: typeof req.body?.sourceIp === 'string' ? req.body.sourceIp.trim() || null : null,
      userAgent: typeof req.body?.userAgent === 'string' ? req.body.userAgent.trim() || null : null,
      targetType: typeof req.body?.targetType === 'string' ? req.body.targetType.trim() || null : null,
      targetId: typeof req.body?.targetId === 'string' ? req.body.targetId.trim() || null : null,
      message: typeof req.body?.message === 'string' ? req.body.message.trim() || null : null,
      errorMessage: typeof req.body?.errorMessage === 'string' ? req.body.errorMessage.trim() || null : null,
      requestSummaryJson: req.body?.requestSummaryJson ?? null,
      resultSummaryJson: req.body?.resultSummaryJson ?? null,
      correlationId: typeof req.body?.correlationId === 'string' ? req.body.correlationId.trim() || null : null
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function bootstrapPostgresRuntime() {
  if (!isPostgresMirrorEnabled()) {
    console.log('[postgres] mirror disabled; SQLite remains primary');
    return;
  }

  if (isPostgresPrimaryMetricsEnabled()) {
    try {
      const hydrated = await hydrateStateFromPostgres();
      if (hydrated) {
        console.log('[postgres] primary metrics mode enabled; runtime state hydrated from Postgres');
      } else {
        console.log('[postgres] primary metrics mode enabled; no Postgres state found, seeding from local cache');
        await syncDashboardStateToPostgresNow(getDashboardStateMirrorPayload());
      }
    } catch (error) {
      console.error('[postgres] primary metrics bootstrap failed; continuing with local fallback cache:', error);
    }
  } else {
    console.log('[postgres] mirror enabled; seeding current dashboard state');
    mirrorDashboardStateToPostgres(getDashboardStateMirrorPayload());
  }

  void ensureCollectorTargetConfigBootstrap()
    .then(() => {
      console.log('[postgres] collector target config bootstrap complete');
    })
    .catch((error) => {
      console.error('[postgres] collector target config bootstrap failed:', error);
    });
  void ensureCollectorSecretConfigBootstrap()
    .then(() => {
      console.log('[postgres] collector secret config bootstrap complete');
    })
    .catch((error) => {
      console.error('[postgres] collector secret config bootstrap failed:', error);
    });
  try {
    await bootstrapLocalAuthCredentialsNow(buildLocalAuthBootstrapSeeds());
    console.log('[postgres] local app auth bootstrap complete');
  } catch (error) {
    console.error('[postgres] local app auth bootstrap failed:', error);
  }
}

async function startServer() {
  await bootstrapPostgresRuntime();

  server.listen(port, host, () => {
    console.log(`API Gateway central hub listening on http://${host}:${port}`);
  });
}

void startServer().catch((error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});
