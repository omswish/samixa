CREATE TABLE IF NOT EXISTS dashboard_state_current (
  state_key TEXT PRIMARY KEY,
  state_json JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_state_snapshot (
  snapshot_id BIGSERIAL PRIMARY KEY,
  state_key TEXT NOT NULL,
  state_json JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_state_snapshot_key_time
  ON dashboard_state_snapshot (state_key, captured_at DESC);

CREATE TABLE IF NOT EXISTS section_health_history (
  id BIGSERIAL PRIMARY KEY,
  section_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL,
  last_attempt_at TIMESTAMPTZ NULL,
  last_success_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_section_health_history_section_time
  ON section_health_history (section_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS gateway_ingest_event (
  id BIGSERIAL PRIMARY KEY,
  collector_source TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  http_status INTEGER NOT NULL,
  ingest_status TEXT NOT NULL,
  error_message TEXT NULL,
  payload_digest TEXT NULL,
  source_host TEXT NULL,
  listener_scope TEXT NOT NULL DEFAULT 'loopback'
);

CREATE INDEX IF NOT EXISTS idx_gateway_ingest_event_source_time
  ON gateway_ingest_event (collector_source, received_at DESC);
