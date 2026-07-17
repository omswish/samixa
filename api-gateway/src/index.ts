import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { createHash } from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { getDashboardState, getDashboardStateMirrorPayload, updateNutanix, updateSolarWinds, updateSymphony } from './db';
import {
  CollectorRunPayload,
  isPostgresMirrorEnabled,
  mirrorDashboardStateToPostgres,
  recordCollectorRunsToPostgres,
  recordGatewayIngestEventToPostgres,
  replaceCollectorSecretConfigInPostgres,
  upsertCollectorTargetConfigInPostgres
} from './postgres';
import { ensureCollectorTargetConfigBootstrap, loadRuntimeCollectorConfig, RuntimeConfigSourceName } from './runtimeConfig';
import { ensureCollectorSecretConfigBootstrap, loadRuntimeCollectorSecrets } from './runtimeSecrets';
import { encryptSecret } from './secretCrypto';

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

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
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

app.post('/api/update', (req, res) => {
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
      res.json({ success: true, message: `Updated data from ${source}` });
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

  if (!isPostgresMirrorEnabled()) {
    res.status(503).json({ error: 'Postgres-backed settings are not enabled.' });
    return;
  }

  const collectors = req.body?.collectors as AdminSettingsCollectorsInput | undefined;

  if (!isPlainObject(collectors)) {
    res.status(400).json({ error: 'Invalid settings payload.' });
    return;
  }

  const typedCollectors = collectors as AdminSettingsCollectorsInput;

  try {
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

      await upsertCollectorTargetConfigInPostgres({
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
      });

      const existingSecretTarget = existingSecrets[write.sourceName].targets[write.targetName];
      const nextUsername = typeof write.target.username === 'string'
        ? write.target.username.trim()
        : existingSecretTarget?.username ?? null;
      const nextPassword = typeof write.target.password === 'string'
        ? write.target.password
        : undefined;
      const clearPassword = Boolean(write.target.clearPassword);

      const secretSeeds = [];
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

      await replaceCollectorSecretConfigInPostgres(write.sourceName, write.targetName, configKey, secretSeeds);
    }
    res.json(await buildAdminSettingsPayload());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(port, host, () => {
  console.log(`API Gateway central hub listening on http://${host}:${port}`);
  if (isPostgresMirrorEnabled()) {
    console.log('[postgres] mirror enabled; seeding current dashboard state');
    mirrorDashboardStateToPostgres(getDashboardStateMirrorPayload());
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
  } else {
    console.log('[postgres] mirror disabled; SQLite remains primary');
  }
});
