import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export interface SectionMirrorRecord {
  sectionKey: string;
  sourceKey: string;
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  errorMessage: string | null;
}

export interface DashboardStateMirrorPayload {
  stateKey: string;
  stateJson: string;
  capturedAt: string;
  sections: SectionMirrorRecord[];
  normalizedAssets?: NormalizedAssetsMirrorPayload;
}

export interface GatewayIngestEventPayload {
  collectorSource: string;
  receivedAt: string;
  httpStatus: number;
  ingestStatus: 'accepted' | 'rejected' | 'parse_failed' | 'db_failed';
  errorMessage?: string | null;
  payloadDigest?: string | null;
  sourceHost?: string | null;
  listenerScope: string;
}

export interface CollectorRunPayload {
  collectorSource: string;
  sectionKey: string;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed';
  failureDomain?: string | null;
  errorMessage?: string | null;
  recordsWritten?: number | null;
  targetHost?: string | null;
  metaJson?: string;
}

export interface AssetCurrentRecord {
  assetId: string;
  assetType: string;
  displayName: string;
  status: string | null;
  statusOrigin: string;
  truthSource: string | null;
  fallbackSource: string | null;
  lastMetricAt: string | null;
  lastStatusChangeAt: string | null;
  lastSyncedAt: string | null;
  stateJson: string;
  updatedAt: string;
}

export interface AssetTelemetryRecord {
  assetId: string;
  assetType: string;
  metricName: string;
  metricValueNumeric: number | null;
  metricValueText: string | null;
  unit: string | null;
  collectedAt: string;
  truthSource: string;
  quality: 'observed' | 'last_synced' | 'derived';
}

export interface NormalizedAssetsMirrorPayload {
  assets: AssetCurrentRecord[];
  telemetry: AssetTelemetryRecord[];
}

export interface CollectorTargetConfigSeed {
  configKey: string;
  sourceName: string;
  targetName: string;
  targetUrl: string;
  host?: string | null;
  enabled?: boolean;
  owner?: string | null;
  pollIntervalSeconds?: number | null;
  notes?: string | null;
  metadataJson?: Record<string, unknown>;
}

export interface CollectorTargetConfigRecord {
  configKey: string;
  sourceName: string;
  targetName: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorSecretConfigSeed {
  configKey: string;
  sourceName: string;
  targetName: string;
  secretName: string;
  keyVersion?: string;
  secretCipherJson: unknown;
}

export interface CollectorSecretConfigRecord {
  configKey: string;
  sourceName: string;
  targetName: string;
  secretName: string;
  keyVersion: string;
  secretCipherJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AppUserSeed {
  email: string;
  displayName?: string | null;
  role: 'viewer' | 'admin';
  enabled?: boolean;
}

export interface AppUserRecord {
  userId: number;
  email: string;
  displayName: string | null;
  role: 'viewer' | 'admin';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AppLocalAuthCredentialSeed {
  username: 'admin' | 'operator';
  displayName: string;
  role: 'viewer' | 'admin';
  passwordSalt: string;
  passwordHash: string;
  passwordSource: 'env' | 'runtime' | 'postgres';
}

export interface AppLocalAuthCredentialRecord {
  username: 'admin' | 'operator';
  displayName: string;
  role: 'viewer' | 'admin';
  passwordSalt: string;
  passwordHash: string;
  passwordSource: 'env' | 'runtime' | 'postgres';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AppLocalAuthStatusRecord {
  mode: 'postgres' | 'runtime' | 'env';
  updatedAt: string | null;
  users: Record<'admin' | 'operator', {
    custom: boolean;
    source: 'postgres' | 'runtime' | 'env';
    lastLoginAt: string | null;
  }>;
}

export interface DashboardStateCurrentRecord {
  stateKey: string;
  stateJson: string;
  capturedAt: string;
}

export interface AssetTelemetryHistoryQuery {
  assetId: string;
  metricName?: string | null;
  since?: string | null;
  until?: string | null;
  limit?: number | null;
}

export interface AssetTelemetryHistoryPoint {
  assetId: string;
  assetType: string;
  metricName: string;
  metricValueNumeric: number | null;
  metricValueText: string | null;
  unit: string | null;
  collectedAt: string;
  truthSource: string;
  quality: 'observed' | 'last_synced' | 'derived';
}

export interface AppActionAuditQuery {
  actionType?: string | null;
  actionResult?: 'success' | 'failed' | 'denied' | null;
  actorUsername?: string | null;
  surface?: string | null;
  limit?: number | null;
}

export interface AppActionAuditRecord {
  auditId: number;
  occurredAt: string;
  actionType: string;
  actionResult: 'success' | 'failed' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  actorUsername: string | null;
  actorRole: string | null;
  surface: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  targetType: string | null;
  targetId: string | null;
  message: string | null;
  errorMessage: string | null;
  requestSummaryJson: unknown;
  resultSummaryJson: unknown;
  correlationId: string | null;
}

export interface AppActionAuditPayload {
  occurredAt?: string;
  actionType: string;
  actionResult: 'success' | 'failed' | 'denied';
  severity?: 'info' | 'warning' | 'critical';
  actorUsername?: string | null;
  actorRole?: string | null;
  surface?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  requestSummaryJson?: unknown;
  resultSummaryJson?: unknown;
  correlationId?: string | null;
}

interface ExistingAssetStateRow {
  asset_id: string;
  status: string | null;
  status_origin: string;
  truth_source: string | null;
  fallback_source: string | null;
  last_status_change_at: string | null;
}

const SCHEMA_DIR = path.resolve(__dirname, '../sql');

function getPostgresUrl() {
  return process.env.POSTGRES_URL;
}

function getPostgresSslEnabled() {
  return /^(1|true|require)$/i.test(process.env.POSTGRES_SSL || '');
}

class PostgresMirror {
  private readonly pool: Pool;
  private readonly initPromise: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();

  constructor() {
    this.pool = new Pool({
      connectionString: getPostgresUrl(),
      ssl: getPostgresSslEnabled() ? { rejectUnauthorized: false } : undefined
    });
    this.initPromise = this.initialize();
  }

  private async initialize() {
    const migrationFiles = fs.readdirSync(SCHEMA_DIR)
      .filter((filename) => filename.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

    for (const migrationFile of migrationFiles) {
      const schemaSql = fs.readFileSync(path.join(SCHEMA_DIR, migrationFile), 'utf8');
      await this.pool.query(schemaSql);
    }
  }

  private async writeNormalizedAssets(payload: NormalizedAssetsMirrorPayload) {
    const existingAssets = new Map<string, ExistingAssetStateRow>();
    const openStatusHistoryAssetIds = new Set<string>();
    if (payload.assets.length > 0) {
      const existingRows = await this.pool.query<ExistingAssetStateRow>(
        `
          SELECT
            asset_id,
            status,
            status_origin,
            truth_source,
            fallback_source,
            last_status_change_at
          FROM asset_current_state
          WHERE asset_id = ANY($1::text[])
        `,
        [payload.assets.map((asset) => asset.assetId)]
      );

      for (const row of existingRows.rows) {
        existingAssets.set(row.asset_id, row);
      }

      const openHistoryRows = await this.pool.query<{ asset_id: string }>(
        `
          SELECT asset_id
          FROM asset_status_history
          WHERE asset_id = ANY($1::text[])
            AND ended_at IS NULL
        `,
        [payload.assets.map((asset) => asset.assetId)]
      );

      for (const row of openHistoryRows.rows) {
        openStatusHistoryAssetIds.add(row.asset_id);
      }
    }

    const nextAssets = payload.assets.map((asset) => {
      const existing = existingAssets.get(asset.assetId);
      const statusChanged =
        existing?.status !== asset.status
        || existing?.status_origin !== asset.statusOrigin
        || existing?.truth_source !== asset.truthSource
        || existing?.fallback_source !== asset.fallbackSource;

      return {
        ...asset,
        lastStatusChangeAt: asset.status === null
          ? existing?.last_status_change_at ?? asset.lastStatusChangeAt ?? null
          : statusChanged
            ? asset.updatedAt
            : existing?.last_status_change_at ?? asset.lastStatusChangeAt ?? asset.updatedAt
      };
    });

    await this.pool.query('BEGIN');
    try {
    if (payload.assets.length > 0) {
      const values: any[] = [];
      const placeholders = nextAssets.map((asset, index) => {
        const base = index * 12;
        values.push(
          asset.assetId,
          asset.assetType,
          asset.displayName,
          asset.status,
          asset.statusOrigin,
          asset.truthSource,
          asset.fallbackSource,
          asset.lastMetricAt,
          asset.lastStatusChangeAt,
          asset.lastSyncedAt,
          asset.stateJson,
          asset.updatedAt
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::timestamptz, $${base + 9}::timestamptz, $${base + 10}::timestamptz, $${base + 11}::jsonb, $${base + 12}::timestamptz)`;
      });

      await this.pool.query(
        `
          INSERT INTO asset_current_state (
            asset_id,
            asset_type,
            display_name,
            status,
            status_origin,
            truth_source,
            fallback_source,
            last_metric_at,
            last_status_change_at,
            last_synced_at,
            state_json,
            updated_at
          )
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (asset_id) DO UPDATE SET
            asset_type = EXCLUDED.asset_type,
            display_name = EXCLUDED.display_name,
            status = EXCLUDED.status,
            status_origin = EXCLUDED.status_origin,
            truth_source = EXCLUDED.truth_source,
            fallback_source = EXCLUDED.fallback_source,
            last_metric_at = EXCLUDED.last_metric_at,
            last_status_change_at = EXCLUDED.last_status_change_at,
            last_synced_at = EXCLUDED.last_synced_at,
            state_json = EXCLUDED.state_json,
            updated_at = EXCLUDED.updated_at
        `,
        values
      );
    }

    const statusTransitions = nextAssets.filter((asset) => {
      if (asset.status === null) {
        return false;
      }

      const existing = existingAssets.get(asset.assetId);
      const hasOpenStatusHistory = openStatusHistoryAssetIds.has(asset.assetId);
      if (!existing) {
        return true;
      }

      return !hasOpenStatusHistory
        || existing.status !== asset.status
        || existing.status_origin !== asset.statusOrigin
        || existing.truth_source !== asset.truthSource
        || existing.fallback_source !== asset.fallbackSource;
    });

    if (statusTransitions.length > 0) {
      for (const asset of statusTransitions) {
        await this.pool.query(
          `
            UPDATE asset_status_history
            SET ended_at = $2::timestamptz
            WHERE asset_id = $1
              AND ended_at IS NULL
          `,
          [asset.assetId, asset.updatedAt]
        );
      }

      const values: any[] = [];
      const placeholders = statusTransitions.map((asset, index) => {
        const base = index * 8;
        const reasonType =
          asset.statusOrigin === 'collector_fallback' ? 'collector_fallback' :
          asset.statusOrigin === 'derived' ? 'derived_threshold' :
          'asset_observed';
        const reasonText =
          asset.statusOrigin === 'collector_fallback' && asset.fallbackSource
            ? `Fallback telemetry from ${asset.fallbackSource}`
            : null;

        values.push(
          asset.assetId,
          asset.assetType,
          asset.status,
          reasonType,
          reasonText,
          asset.truthSource,
          asset.updatedAt,
          null
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::timestamptz, $${base + 8}::timestamptz)`;
      });

      await this.pool.query(
        `
          INSERT INTO asset_status_history (
            asset_id,
            asset_type,
            status,
            status_reason_type,
            status_reason_text,
            truth_source,
            started_at,
            ended_at
          )
          VALUES ${placeholders.join(', ')}
        `,
        values
      );
    }

    if (payload.telemetry.length > 0) {
      const values: any[] = [];
      const placeholders = payload.telemetry.map((point, index) => {
        const base = index * 9;
        values.push(
          point.assetId,
          point.assetType,
          point.metricName,
          point.metricValueNumeric,
          point.metricValueText,
          point.unit,
          point.collectedAt,
          point.truthSource,
          point.quality
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::timestamptz, $${base + 8}, $${base + 9})`;
      });

      await this.pool.query(
        `
          INSERT INTO asset_telemetry_history (
            asset_id,
            asset_type,
            metric_name,
            metric_value_numeric,
            metric_value_text,
            unit,
            collected_at,
            truth_source,
            quality
          )
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (
            asset_id,
            metric_name,
            collected_at,
            truth_source,
            quality
          ) DO NOTHING
        `,
        values
      );
    }
      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  private async writeCollectorRuns(payload: CollectorRunPayload[]) {
    if (payload.length === 0) {
      return;
    }

    const values: any[] = [];
    const placeholders = payload.map((run, index) => {
      const base = index * 10;
      values.push(
        run.collectorSource,
        run.sectionKey,
        run.startedAt,
        run.finishedAt,
        run.status,
        run.failureDomain ?? null,
        run.errorMessage ?? null,
        run.recordsWritten ?? null,
        run.targetHost ?? null,
        run.metaJson ?? '{}'
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}::timestamptz, $${base + 4}::timestamptz, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}::jsonb)`;
    });

    await this.pool.query(
      `
        INSERT INTO collector_run (
          collector_source,
          section_key,
          started_at,
          finished_at,
          status,
          failure_domain,
          error_message,
          records_written,
          target_host,
          meta_json
        )
        VALUES ${placeholders.join(', ')}
      `,
      values
    );
  }

  private async writeDashboardState(payload: DashboardStateMirrorPayload) {
    await this.pool.query(
      `
        INSERT INTO dashboard_state_current (state_key, state_json, captured_at)
        VALUES ($1, $2::jsonb, $3::timestamptz)
        ON CONFLICT (state_key) DO UPDATE SET
          state_json = EXCLUDED.state_json,
          captured_at = EXCLUDED.captured_at
      `,
      [payload.stateKey, payload.stateJson, payload.capturedAt]
    );

    await this.pool.query(
      `
        INSERT INTO dashboard_state_snapshot (state_key, state_json, captured_at)
        VALUES ($1, $2::jsonb, $3::timestamptz)
      `,
      [payload.stateKey, payload.stateJson, payload.capturedAt]
    );

    if (payload.sections.length > 0) {
      const values: any[] = [];
      const placeholders = payload.sections.map((section, index) => {
        const base = index * 6;
        values.push(
          section.sectionKey,
          section.sourceKey,
          section.status,
          section.lastAttemptAt,
          section.lastSuccessAt,
          section.errorMessage
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::timestamptz, $${base + 5}::timestamptz, $${base + 6}, NOW())`;
      });

      await this.pool.query(
        `
          INSERT INTO section_health_history (
            section_key,
            source_key,
            status,
            last_attempt_at,
            last_success_at,
            error_message,
            recorded_at
          )
          VALUES ${placeholders.join(', ')}
        `,
        values
      );
    }

    if (payload.normalizedAssets) {
      await this.writeNormalizedAssets(payload.normalizedAssets);
    }
  }

  private async writeGatewayIngestEvent(payload: GatewayIngestEventPayload) {
    await this.pool.query(
      `
        INSERT INTO gateway_ingest_event (
          collector_source,
          received_at,
          http_status,
          ingest_status,
          error_message,
          payload_digest,
          source_host,
          listener_scope
        )
        VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8)
      `,
      [
        payload.collectorSource,
        payload.receivedAt,
        payload.httpStatus,
        payload.ingestStatus,
        payload.errorMessage ?? null,
        payload.payloadDigest ?? null,
        payload.sourceHost ?? null,
        payload.listenerScope
      ]
    );
  }

  private async writeAppActionAudit(payload: AppActionAuditPayload) {
    await this.pool.query(
      `
        INSERT INTO app_action_audit (
          occurred_at,
          action_type,
          action_result,
          severity,
          actor_username,
          actor_role,
          surface,
          source_ip,
          user_agent,
          target_type,
          target_id,
          message,
          error_message,
          request_summary_json,
          result_summary_json,
          correlation_id
        )
        VALUES (
          $1::timestamptz,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::jsonb,
          $15::jsonb,
          $16
        )
      `,
      [
        payload.occurredAt ?? new Date().toISOString(),
        payload.actionType,
        payload.actionResult,
        payload.severity ?? 'info',
        payload.actorUsername ?? null,
        payload.actorRole ?? null,
        payload.surface ?? null,
        payload.sourceIp ?? null,
        payload.userAgent ?? null,
        payload.targetType ?? null,
        payload.targetId ?? null,
        payload.message ?? null,
        payload.errorMessage ?? null,
        JSON.stringify(payload.requestSummaryJson ?? null),
        JSON.stringify(payload.resultSummaryJson ?? null),
        payload.correlationId ?? null
      ]
    );
  }

  private enqueue(task: () => Promise<void>) {
    this.writeChain = this.writeChain
      .then(() => this.initPromise)
      .then(task)
      .catch((error) => {
        console.error('[postgres] mirror write failed:', error);
      });
  }

  mirrorDashboardState(payload: DashboardStateMirrorPayload) {
    this.enqueue(() => this.writeDashboardState(payload));
  }

  recordGatewayIngestEvent(payload: GatewayIngestEventPayload) {
    this.enqueue(() => this.writeGatewayIngestEvent(payload));
  }

  recordCollectorRuns(payload: CollectorRunPayload[]) {
    this.enqueue(() => this.writeCollectorRuns(payload));
  }

  async syncDashboardState(payload: DashboardStateMirrorPayload) {
    await this.initPromise;
    await this.writeDashboardState(payload);
  }

  async getDashboardStateCurrent(stateKey: string): Promise<DashboardStateCurrentRecord | null> {
    await this.initPromise;
    const result = await this.pool.query<{
      state_key: string;
      state_json: unknown;
      captured_at: Date | string;
    }>(
      `
        SELECT
          state_key,
          state_json,
          captured_at
        FROM dashboard_state_current
        WHERE state_key = $1
        LIMIT 1
      `,
      [stateKey]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      stateKey: row.state_key,
      stateJson: typeof row.state_json === 'string' ? row.state_json : JSON.stringify(row.state_json ?? {}),
      capturedAt: new Date(row.captured_at).toISOString()
    };
  }

  async getAssetTelemetryHistory(query: AssetTelemetryHistoryQuery): Promise<AssetTelemetryHistoryPoint[]> {
    await this.initPromise;

    const values: Array<string | number> = [query.assetId];
    const conditions = ['asset_id = $1'];

    if (query.metricName) {
      values.push(query.metricName);
      conditions.push(`metric_name = $${values.length}`);
    }

    if (query.since) {
      values.push(query.since);
      conditions.push(`collected_at >= $${values.length}::timestamptz`);
    }

    if (query.until) {
      values.push(query.until);
      conditions.push(`collected_at <= $${values.length}::timestamptz`);
    }

    const limit = Number.isFinite(query.limit) && (query.limit ?? 0) > 0
      ? Math.min(Number(query.limit), 1000)
      : 288;
    values.push(limit);

    const result = await this.pool.query<{
      asset_id: string;
      asset_type: string;
      metric_name: string;
      metric_value_numeric: number | null;
      metric_value_text: string | null;
      unit: string | null;
      collected_at: Date | string;
      truth_source: string;
      quality: 'observed' | 'last_synced' | 'derived';
    }>(
      `
        SELECT
          asset_id,
          asset_type,
          metric_name,
          metric_value_numeric,
          metric_value_text,
          unit,
          collected_at,
          truth_source,
          quality
        FROM asset_telemetry_history
        WHERE ${conditions.join(' AND ')}
        ORDER BY collected_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows
      .map((row) => ({
        assetId: row.asset_id,
        assetType: row.asset_type,
        metricName: row.metric_name,
        metricValueNumeric: row.metric_value_numeric,
        metricValueText: row.metric_value_text,
        unit: row.unit,
        collectedAt: new Date(row.collected_at).toISOString(),
        truthSource: row.truth_source,
        quality: row.quality
      }))
      .reverse();
  }

  async bootstrapCollectorTargetConfig(seeds: CollectorTargetConfigSeed[]) {
    await this.initPromise;
    if (seeds.length === 0) {
      return;
    }

    const values: any[] = [];
    const placeholders = seeds.map((seed, index) => {
      const base = index * 10;
      values.push(
        seed.configKey,
        seed.sourceName,
        seed.targetName,
        seed.targetUrl,
        seed.host ?? null,
        seed.enabled ?? true,
        seed.owner ?? null,
        seed.notes ?? null,
        seed.pollIntervalSeconds ?? null,
        JSON.stringify(seed.metadataJson ?? {})
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}::jsonb)`;
    });

    await this.pool.query(
      `
        INSERT INTO collector_target_config (
          config_key,
          source_name,
          target_name,
          target_url,
          host,
          enabled,
          owner,
          notes,
          poll_interval_seconds,
          metadata_json
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (config_key) DO NOTHING
      `,
      values
    );
  }

  async getCollectorTargetConfigs(sourceName: string): Promise<CollectorTargetConfigRecord[]> {
    await this.initPromise;
    const result = await this.pool.query<{
      config_key: string;
      source_name: string;
      target_name: string;
      target_url: string;
      host: string | null;
      enabled: boolean;
      owner: string | null;
      poll_interval_seconds: number | null;
      notes: string | null;
      metadata_json: Record<string, unknown> | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        SELECT
          config_key,
          source_name,
          target_name,
          target_url,
          host,
          enabled,
          owner,
          poll_interval_seconds,
          notes,
          metadata_json,
          created_at,
          updated_at
        FROM collector_target_config
        WHERE source_name = $1
        ORDER BY target_name ASC
      `,
      [sourceName]
    );

    return result.rows.map((row) => ({
      configKey: row.config_key,
      sourceName: row.source_name,
      targetName: row.target_name,
      targetUrl: row.target_url,
      host: row.host,
      enabled: row.enabled,
      owner: row.owner,
      pollIntervalSeconds: row.poll_interval_seconds,
      notes: row.notes,
      metadataJson: row.metadata_json ?? {},
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  async bootstrapCollectorSecretConfig(seeds: CollectorSecretConfigSeed[]) {
    await this.initPromise;
    if (seeds.length === 0) {
      return;
    }

    const values: any[] = [];
    const placeholders = seeds.map((seed, index) => {
      const base = index * 6;
      values.push(
        seed.configKey,
        seed.sourceName,
        seed.targetName,
        seed.secretName,
        seed.keyVersion ?? 'v1',
        JSON.stringify(seed.secretCipherJson)
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`;
    });

    await this.pool.query(
      `
        INSERT INTO collector_secret_config (
          config_key,
          source_name,
          target_name,
          secret_name,
          key_version,
          secret_cipher_json
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (config_key, secret_name) DO NOTHING
      `,
      values
    );
  }

  async getCollectorSecretConfigs(sourceName: string): Promise<CollectorSecretConfigRecord[]> {
    await this.initPromise;
    const result = await this.pool.query<{
      config_key: string;
      source_name: string;
      target_name: string;
      secret_name: string;
      key_version: string;
      secret_cipher_json: unknown;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        SELECT
          config_key,
          source_name,
          target_name,
          secret_name,
          key_version,
          secret_cipher_json,
          created_at,
          updated_at
        FROM collector_secret_config
        WHERE source_name = $1
        ORDER BY target_name ASC, secret_name ASC
      `,
      [sourceName]
    );

    return result.rows.map((row) => ({
      configKey: row.config_key,
      sourceName: row.source_name,
      targetName: row.target_name,
      secretName: row.secret_name,
      keyVersion: row.key_version,
      secretCipherJson: row.secret_cipher_json ?? {},
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  async upsertCollectorTargetConfig(seed: CollectorTargetConfigSeed) {
    await this.initPromise;
    await this.pool.query(
      `
        INSERT INTO collector_target_config (
          config_key,
          source_name,
          target_name,
          target_url,
          host,
          enabled,
          owner,
          notes,
          poll_interval_seconds,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (config_key) DO UPDATE SET
          source_name = EXCLUDED.source_name,
          target_name = EXCLUDED.target_name,
          target_url = EXCLUDED.target_url,
          host = EXCLUDED.host,
          enabled = EXCLUDED.enabled,
          owner = EXCLUDED.owner,
          notes = EXCLUDED.notes,
          poll_interval_seconds = EXCLUDED.poll_interval_seconds,
          metadata_json = EXCLUDED.metadata_json
      `,
      [
        seed.configKey,
        seed.sourceName,
        seed.targetName,
        seed.targetUrl,
        seed.host ?? null,
        seed.enabled ?? true,
        seed.owner ?? null,
        seed.notes ?? null,
        seed.pollIntervalSeconds ?? null,
        JSON.stringify(seed.metadataJson ?? {})
      ]
    );
  }

  async replaceCollectorSecretConfig(
    sourceName: string,
    targetName: string,
    configKey: string,
    seeds: CollectorSecretConfigSeed[]
  ) {
    await this.initPromise;
    await this.pool.query('BEGIN');
    try {
      await this.pool.query(
        `
          DELETE FROM collector_secret_config
          WHERE source_name = $1
            AND target_name = $2
            AND config_key = $3
            AND secret_name IN ('username', 'password')
        `,
        [sourceName, targetName, configKey]
      );

      if (seeds.length > 0) {
        const values: any[] = [];
        const placeholders = seeds.map((seed, index) => {
          const base = index * 6;
          values.push(
            seed.configKey,
            seed.sourceName,
            seed.targetName,
            seed.secretName,
            seed.keyVersion ?? 'v1',
            JSON.stringify(seed.secretCipherJson)
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`;
        });

        await this.pool.query(
          `
            INSERT INTO collector_secret_config (
              config_key,
              source_name,
              target_name,
              secret_name,
              key_version,
              secret_cipher_json
            )
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (config_key, secret_name) DO UPDATE SET
              source_name = EXCLUDED.source_name,
              target_name = EXCLUDED.target_name,
              key_version = EXCLUDED.key_version,
              secret_cipher_json = EXCLUDED.secret_cipher_json,
              updated_at = NOW()
          `,
          values
        );
      }

      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  async bootstrapAppUsers(seeds: AppUserSeed[]) {
    await this.initPromise;
    if (seeds.length === 0) {
      return;
    }

    const values: any[] = [];
    const placeholders = seeds.map((seed, index) => {
      const base = index * 4;
      values.push(
        seed.email.toLowerCase(),
        seed.displayName ?? null,
        seed.role,
        seed.enabled ?? true
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await this.pool.query(
      `
        INSERT INTO app_user (
          email,
          display_name,
          role,
          enabled
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (email) DO NOTHING
      `,
      values
    );
  }

  async listAppUsers(): Promise<AppUserRecord[]> {
    await this.initPromise;
    const result = await this.pool.query<{
      user_id: number;
      email: string;
      display_name: string | null;
      role: 'viewer' | 'admin';
      enabled: boolean;
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        SELECT
          user_id,
          email,
          display_name,
          role,
          enabled,
          created_at,
          updated_at,
          last_login_at
        FROM app_user
        ORDER BY role DESC, email ASC
      `
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      enabled: row.enabled,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    }));
  }

  async getAppUserByEmail(email: string): Promise<AppUserRecord | null> {
    await this.initPromise;
    const result = await this.pool.query<{
      user_id: number;
      email: string;
      display_name: string | null;
      role: 'viewer' | 'admin';
      enabled: boolean;
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        SELECT
          user_id,
          email,
          display_name,
          role,
          enabled,
          created_at,
          updated_at,
          last_login_at
        FROM app_user
        WHERE email = $1
        LIMIT 1
      `,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      enabled: row.enabled,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
  }

  async upsertAppUser(seed: AppUserSeed): Promise<AppUserRecord> {
    await this.initPromise;
    const result = await this.pool.query<{
      user_id: number;
      email: string;
      display_name: string | null;
      role: 'viewer' | 'admin';
      enabled: boolean;
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        INSERT INTO app_user (
          email,
          display_name,
          role,
          enabled
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          enabled = EXCLUDED.enabled
        RETURNING
          user_id,
          email,
          display_name,
          role,
          enabled,
          created_at,
          updated_at,
          last_login_at
      `,
      [seed.email.toLowerCase(), seed.displayName ?? null, seed.role, seed.enabled ?? true]
    );

    const row = result.rows[0];
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      enabled: row.enabled,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
  }

  async touchAppUserLogin(email: string) {
    await this.initPromise;
    await this.pool.query(
      `
        UPDATE app_user
        SET last_login_at = NOW()
        WHERE email = $1
      `,
      [email.toLowerCase()]
    );
  }

  async bootstrapLocalAuthCredentials(seeds: AppLocalAuthCredentialSeed[]) {
    await this.initPromise;
    if (seeds.length === 0) {
      return;
    }

    const values: any[] = [];
    const placeholders = seeds.map((seed, index) => {
      const base = index * 6;
      values.push(
        seed.username,
        seed.displayName,
        seed.role,
        seed.passwordSalt,
        seed.passwordHash,
        seed.passwordSource
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await this.pool.query(
      `
        INSERT INTO app_local_auth_credential (
          username,
          display_name,
          role,
          password_salt,
          password_hash,
          password_source
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (username) DO NOTHING
      `,
      values
    );
  }

  async listLocalAuthCredentials(): Promise<AppLocalAuthCredentialRecord[]> {
    await this.initPromise;
    const result = await this.pool.query<{
      username: 'admin' | 'operator';
      display_name: string;
      role: 'viewer' | 'admin';
      password_salt: string;
      password_hash: string;
      password_source: 'env' | 'runtime' | 'postgres';
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        SELECT
          username,
          display_name,
          role,
          password_salt,
          password_hash,
          password_source,
          created_at,
          updated_at,
          last_login_at
        FROM app_local_auth_credential
        ORDER BY username ASC
      `
    );

    return result.rows.map((row) => ({
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      passwordSource: row.password_source,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    }));
  }

  async getLocalAuthCredential(username: 'admin' | 'operator'): Promise<AppLocalAuthCredentialRecord | null> {
    await this.initPromise;
    const result = await this.pool.query<{
      username: 'admin' | 'operator';
      display_name: string;
      role: 'viewer' | 'admin';
      password_salt: string;
      password_hash: string;
      password_source: 'env' | 'runtime' | 'postgres';
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        SELECT
          username,
          display_name,
          role,
          password_salt,
          password_hash,
          password_source,
          created_at,
          updated_at,
          last_login_at
        FROM app_local_auth_credential
        WHERE username = $1
        LIMIT 1
      `,
      [username]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      passwordSource: row.password_source,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
  }

  async upsertLocalAuthCredential(seed: AppLocalAuthCredentialSeed): Promise<AppLocalAuthCredentialRecord> {
    await this.initPromise;
    const result = await this.pool.query<{
      username: 'admin' | 'operator';
      display_name: string;
      role: 'viewer' | 'admin';
      password_salt: string;
      password_hash: string;
      password_source: 'env' | 'runtime' | 'postgres';
      created_at: Date | string;
      updated_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `
        INSERT INTO app_local_auth_credential (
          username,
          display_name,
          role,
          password_salt,
          password_hash,
          password_source
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (username) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          password_salt = EXCLUDED.password_salt,
          password_hash = EXCLUDED.password_hash,
          password_source = EXCLUDED.password_source
        RETURNING
          username,
          display_name,
          role,
          password_salt,
          password_hash,
          password_source,
          created_at,
          updated_at,
          last_login_at
      `,
      [
        seed.username,
        seed.displayName,
        seed.role,
        seed.passwordSalt,
        seed.passwordHash,
        seed.passwordSource
      ]
    );

    const row = result.rows[0];
    return {
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      passwordSource: row.password_source,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
  }

  async touchLocalAuthCredentialLogin(username: 'admin' | 'operator') {
    await this.initPromise;
    await this.pool.query(
      `
        UPDATE app_local_auth_credential
        SET last_login_at = NOW()
        WHERE username = $1
      `,
      [username]
    );
  }

  async listAppActionAudit(query: AppActionAuditQuery): Promise<AppActionAuditRecord[]> {
    await this.initPromise;

    const values: Array<string | number> = [];
    const conditions: string[] = [];

    if (query.actionType) {
      values.push(query.actionType);
      conditions.push(`action_type = $${values.length}`);
    }

    if (query.actionResult) {
      values.push(query.actionResult);
      conditions.push(`action_result = $${values.length}`);
    }

    if (query.actorUsername) {
      values.push(query.actorUsername);
      conditions.push(`actor_username = $${values.length}`);
    }

    if (query.surface) {
      values.push(query.surface);
      conditions.push(`surface = $${values.length}`);
    }

    const limit = Number.isFinite(query.limit) && (query.limit ?? 0) > 0
      ? Math.min(Number(query.limit), 1000)
      : 100;
    values.push(limit);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await this.pool.query<{
      audit_id: number;
      occurred_at: Date | string;
      action_type: string;
      action_result: 'success' | 'failed' | 'denied';
      severity: 'info' | 'warning' | 'critical';
      actor_username: string | null;
      actor_role: string | null;
      surface: string | null;
      source_ip: string | null;
      user_agent: string | null;
      target_type: string | null;
      target_id: string | null;
      message: string | null;
      error_message: string | null;
      request_summary_json: unknown;
      result_summary_json: unknown;
      correlation_id: string | null;
    }>(
      `
        SELECT
          audit_id,
          occurred_at,
          action_type,
          action_result,
          severity,
          actor_username,
          actor_role,
          surface,
          source_ip,
          user_agent,
          target_type,
          target_id,
          message,
          error_message,
          request_summary_json,
          result_summary_json,
          correlation_id
        FROM app_action_audit
        ${whereClause}
        ORDER BY occurred_at DESC, audit_id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map((row) => ({
      auditId: row.audit_id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      actionType: row.action_type,
      actionResult: row.action_result,
      severity: row.severity,
      actorUsername: row.actor_username,
      actorRole: row.actor_role,
      surface: row.surface,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      targetType: row.target_type,
      targetId: row.target_id,
      message: row.message,
      errorMessage: row.error_message,
      requestSummaryJson: row.request_summary_json ?? null,
      resultSummaryJson: row.result_summary_json ?? null,
      correlationId: row.correlation_id
    }));
  }

  async recordAppActionAudit(payload: AppActionAuditPayload) {
    await this.initPromise;
    await this.writeAppActionAudit(payload);
  }

  async drain() {
    await this.writeChain;
  }

  async close() {
    await this.drain();
    await this.pool.end();
  }
}

let postgresMirror: PostgresMirror | null = null;

function getPostgresMirror() {
  if (!getPostgresUrl()) {
    return null;
  }

  if (!postgresMirror) {
    postgresMirror = new PostgresMirror();
  }

  return postgresMirror;
}

export function mirrorDashboardStateToPostgres(payload: DashboardStateMirrorPayload) {
  getPostgresMirror()?.mirrorDashboardState(payload);
}

export function recordGatewayIngestEventToPostgres(payload: GatewayIngestEventPayload) {
  getPostgresMirror()?.recordGatewayIngestEvent(payload);
}

export function recordCollectorRunsToPostgres(payload: CollectorRunPayload[]) {
  getPostgresMirror()?.recordCollectorRuns(payload);
}

export function isPostgresMirrorEnabled() {
  return Boolean(getPostgresUrl());
}

export function isPostgresPrimaryMetricsEnabled() {
  return isPostgresMirrorEnabled() && /^(1|true|yes|primary)$/i.test(process.env.POSTGRES_PRIMARY_METRICS || '');
}

export async function syncDashboardStateToPostgresNow(payload: DashboardStateMirrorPayload) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.syncDashboardState(payload);
}

export async function getDashboardStateCurrentFromPostgres(stateKey: string) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return null;
  }

  return mirror.getDashboardStateCurrent(stateKey);
}

export async function getAssetTelemetryHistoryFromPostgres(query: AssetTelemetryHistoryQuery) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.getAssetTelemetryHistory(query);
}

export async function bootstrapCollectorTargetConfigNow(seeds: CollectorTargetConfigSeed[]) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.bootstrapCollectorTargetConfig(seeds);
}

export async function getCollectorTargetConfigsFromPostgres(sourceName: string) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.getCollectorTargetConfigs(sourceName);
}

export async function bootstrapCollectorSecretConfigNow(seeds: CollectorSecretConfigSeed[]) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.bootstrapCollectorSecretConfig(seeds);
}

export async function getCollectorSecretConfigsFromPostgres(sourceName: string) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.getCollectorSecretConfigs(sourceName);
}

export async function upsertCollectorTargetConfigInPostgres(seed: CollectorTargetConfigSeed) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.upsertCollectorTargetConfig(seed);
}

export async function replaceCollectorSecretConfigInPostgres(
  sourceName: string,
  targetName: string,
  configKey: string,
  seeds: CollectorSecretConfigSeed[]
) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.replaceCollectorSecretConfig(sourceName, targetName, configKey, seeds);
}

export async function bootstrapAppUsersNow(seeds: AppUserSeed[]) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.bootstrapAppUsers(seeds);
}

export async function listAppUsersFromPostgres() {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.listAppUsers();
}

export async function getAppUserByEmailFromPostgres(email: string) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return null;
  }

  return mirror.getAppUserByEmail(email);
}

export async function upsertAppUserInPostgres(seed: AppUserSeed) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  return mirror.upsertAppUser(seed);
}

export async function touchAppUserLoginInPostgres(email: string) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return;
  }

  await mirror.touchAppUserLogin(email);
}

export async function bootstrapLocalAuthCredentialsNow(seeds: AppLocalAuthCredentialSeed[]) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.bootstrapLocalAuthCredentials(seeds);
}

export async function listLocalAuthCredentialsFromPostgres() {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.listLocalAuthCredentials();
}

export async function getLocalAuthCredentialFromPostgres(username: 'admin' | 'operator') {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return null;
  }

  return mirror.getLocalAuthCredential(username);
}

export async function upsertLocalAuthCredentialInPostgres(seed: AppLocalAuthCredentialSeed) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  return mirror.upsertLocalAuthCredential(seed);
}

export async function touchLocalAuthCredentialLoginInPostgres(username: 'admin' | 'operator') {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return;
  }

  await mirror.touchLocalAuthCredentialLogin(username);
}

export async function listAppActionAuditFromPostgres(query: AppActionAuditQuery) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    return [];
  }

  return mirror.listAppActionAudit(query);
}

export async function recordAppActionAuditInPostgres(payload: AppActionAuditPayload) {
  const mirror = getPostgresMirror();
  if (!mirror) {
    throw new Error('POSTGRES_URL is not configured. Postgres mirror is disabled.');
  }

  await mirror.recordAppActionAudit(payload);
}

export async function closePostgresMirror() {
  if (!postgresMirror) {
    return;
  }

  await postgresMirror.close();
  postgresMirror = null;
}
