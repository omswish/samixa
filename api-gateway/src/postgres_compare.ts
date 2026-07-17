import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getDashboardStateMirrorPayload } from './db';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface AssetCurrentCompareRow {
  asset_id: string;
  asset_type: string;
  display_name: string;
  status: string | null;
  status_origin: string;
  truth_source: string | null;
  fallback_source: string | null;
  last_metric_at: Date | string | null;
}

interface AssetTelemetryCompareRow {
  asset_id: string;
  metric_name: string;
  metric_value_numeric: number | null;
  metric_value_text: string | null;
  unit: string | null;
  collected_at: Date | string;
  truth_source: string;
  quality: string;
}

function normalizeTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeNullable(value: string | null | undefined) {
  return value ?? null;
}

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error('POSTGRES_URL is not configured. Cannot run parity comparison.');
  }

  const mirrorPayload = getDashboardStateMirrorPayload();
  const normalized = mirrorPayload.normalizedAssets;
  if (!normalized) {
    throw new Error('Normalized assets are not available in the current dashboard payload.');
  }

  const pool = new Pool({
    connectionString: postgresUrl,
    ssl: /^(1|true|require)$/i.test(process.env.POSTGRES_SSL || '') ? { rejectUnauthorized: false } : undefined
  });

  try {
    const currentAssets = await pool.query<AssetCurrentCompareRow>(
      `
        SELECT
          asset_id,
          asset_type,
          display_name,
          status,
          status_origin,
          truth_source,
          fallback_source,
          last_metric_at
        FROM asset_current_state
      `
    );

    const latestTelemetry = await pool.query<AssetTelemetryCompareRow>(
      `
        SELECT DISTINCT ON (asset_id, metric_name, truth_source, quality)
          asset_id,
          metric_name,
          metric_value_numeric,
          metric_value_text,
          unit,
          collected_at,
          truth_source,
          quality
        FROM asset_telemetry_history
        ORDER BY asset_id, metric_name, truth_source, quality, collected_at DESC
      `
    );

    const assetMismatches: string[] = [];
    const expectedAssets = new Map(normalized.assets.map((asset) => [asset.assetId, asset]));
    const actualAssets = new Map(currentAssets.rows.map((asset) => [asset.asset_id, asset]));

    for (const [assetId, expected] of expectedAssets) {
      const actual = actualAssets.get(assetId);
      if (!actual) {
        assetMismatches.push(`missing asset_current_state row for ${assetId}`);
        continue;
      }

      if (
        actual.asset_type !== expected.assetType
        || actual.display_name !== expected.displayName
        || normalizeNullable(actual.status) !== normalizeNullable(expected.status)
        || actual.status_origin !== expected.statusOrigin
        || normalizeNullable(actual.truth_source) !== normalizeNullable(expected.truthSource)
        || normalizeNullable(actual.fallback_source) !== normalizeNullable(expected.fallbackSource)
        || normalizeTimestamp(actual.last_metric_at) !== normalizeTimestamp(expected.lastMetricAt)
      ) {
        assetMismatches.push(`asset mismatch for ${assetId}`);
      }
    }

    for (const assetId of actualAssets.keys()) {
      if (!expectedAssets.has(assetId)) {
        assetMismatches.push(`unexpected asset_current_state row for ${assetId}`);
      }
    }

    const telemetryMismatches: string[] = [];
    const expectedTelemetry = new Map(
      normalized.telemetry.map((point) => [
        `${point.assetId}|${point.metricName}|${point.truthSource}|${point.quality}`,
        point
      ])
    );
    const actualTelemetry = new Map(
      latestTelemetry.rows.map((point) => [
        `${point.asset_id}|${point.metric_name}|${point.truth_source}|${point.quality}`,
        point
      ])
    );

    for (const [key, expected] of expectedTelemetry) {
      const actual = actualTelemetry.get(key);
      if (!actual) {
        telemetryMismatches.push(`missing telemetry row for ${key}`);
        continue;
      }

      const numericMatches =
        (expected.metricValueNumeric === null && actual.metric_value_numeric === null)
        || (expected.metricValueNumeric !== null && actual.metric_value_numeric !== null && Math.abs(expected.metricValueNumeric - actual.metric_value_numeric) < 0.0001);

      if (
        !numericMatches
        || normalizeNullable(actual.metric_value_text) !== normalizeNullable(expected.metricValueText)
        || normalizeNullable(actual.unit) !== normalizeNullable(expected.unit)
        || normalizeTimestamp(actual.collected_at) !== normalizeTimestamp(expected.collectedAt)
      ) {
        telemetryMismatches.push(`telemetry mismatch for ${key}`);
      }
    }

    const summary = {
      expectedAssetCount: normalized.assets.length,
      actualAssetCount: currentAssets.rowCount ?? 0,
      expectedTelemetryCount: normalized.telemetry.length,
      actualLatestTelemetryCount: latestTelemetry.rowCount ?? 0,
      assetMismatchCount: assetMismatches.length,
      telemetryMismatchCount: telemetryMismatches.length
    };

    console.log(JSON.stringify({
      summary,
      assetMismatches: assetMismatches.slice(0, 20),
      telemetryMismatches: telemetryMismatches.slice(0, 20)
    }, null, 2));

    if (assetMismatches.length > 0 || telemetryMismatches.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[postgres-compare] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
