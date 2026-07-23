CREATE TABLE IF NOT EXISTS app_action_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type TEXT NOT NULL,
  action_result TEXT NOT NULL CHECK (action_result IN ('success', 'failed', 'denied')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  actor_username TEXT NULL,
  actor_role TEXT NULL,
  surface TEXT NULL,
  source_ip TEXT NULL,
  user_agent TEXT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  message TEXT NULL,
  error_message TEXT NULL,
  request_summary_json JSONB NULL,
  result_summary_json JSONB NULL,
  correlation_id TEXT NULL,
  changed_by TEXT NOT NULL DEFAULT CURRENT_USER,
  session_user_name TEXT NOT NULL DEFAULT SESSION_USER,
  application_name TEXT NULL DEFAULT current_setting('application_name', true),
  client_addr INET NULL DEFAULT inet_client_addr(),
  txid BIGINT NOT NULL DEFAULT txid_current()
);

CREATE INDEX IF NOT EXISTS idx_app_action_audit_time
  ON app_action_audit (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_action_audit_actor_time
  ON app_action_audit (actor_username, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_action_audit_action_time
  ON app_action_audit (action_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_action_audit_target_time
  ON app_action_audit (target_type, target_id, occurred_at DESC);
