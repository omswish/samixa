CREATE TABLE IF NOT EXISTS asset_status_history (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason_type TEXT NOT NULL,
  status_reason_text TEXT NULL,
  truth_source TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_status_history_asset_time
  ON asset_status_history (asset_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_asset_status_history_open
  ON asset_status_history (asset_id, ended_at);
