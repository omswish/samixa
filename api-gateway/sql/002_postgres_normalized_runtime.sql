CREATE TABLE IF NOT EXISTS collector_run (
  run_id BIGSERIAL PRIMARY KEY,
  collector_source TEXT NOT NULL,
  section_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  failure_domain TEXT NULL,
  error_message TEXT NULL,
  records_written INTEGER NULL,
  target_host TEXT NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collector_run_source_section_time
  ON collector_run (collector_source, section_key, started_at DESC);

CREATE TABLE IF NOT EXISTS asset_current_state (
  asset_id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NULL,
  status_origin TEXT NOT NULL,
  truth_source TEXT NULL,
  fallback_source TEXT NULL,
  last_metric_at TIMESTAMPTZ NULL,
  last_status_change_at TIMESTAMPTZ NULL,
  last_synced_at TIMESTAMPTZ NULL,
  state_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_current_state_type_name
  ON asset_current_state (asset_type, display_name);

CREATE TABLE IF NOT EXISTS asset_telemetry_history (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value_numeric DOUBLE PRECISION NULL,
  metric_value_text TEXT NULL,
  unit TEXT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  truth_source TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'observed'
);

CREATE INDEX IF NOT EXISTS idx_asset_telemetry_history_asset_time
  ON asset_telemetry_history (asset_id, collected_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_telemetry_history_point
  ON asset_telemetry_history (
    asset_id,
    metric_name,
    collected_at,
    truth_source,
    quality
  );
