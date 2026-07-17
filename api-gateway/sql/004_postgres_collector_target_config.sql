CREATE TABLE IF NOT EXISTS collector_target_config (
  config_key TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  host TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  owner TEXT NULL,
  poll_interval_seconds INTEGER NULL,
  notes TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collector_target_config_source
  ON collector_target_config (source_name, target_name);
