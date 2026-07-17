CREATE TABLE IF NOT EXISTS collector_secret_config (
  secret_id BIGSERIAL PRIMARY KEY,
  config_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  secret_cipher_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_collector_secret_config_target_secret
    UNIQUE (config_key, secret_name)
);

CREATE INDEX IF NOT EXISTS idx_collector_secret_config_source_target
  ON collector_secret_config (source_name, target_name);

CREATE TABLE IF NOT EXISTS collector_secret_config_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  config_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL DEFAULT CURRENT_USER,
  session_user_name TEXT NOT NULL DEFAULT SESSION_USER,
  application_name TEXT NULL DEFAULT current_setting('application_name', true),
  client_addr INET NULL DEFAULT inet_client_addr(),
  txid BIGINT NOT NULL DEFAULT txid_current(),
  changed_fields TEXT[] NULL,
  old_row_json JSONB NULL,
  new_row_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_collector_secret_config_audit_key_time
  ON collector_secret_config_audit (config_key, secret_name, changed_at DESC);

CREATE OR REPLACE FUNCTION set_collector_secret_config_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := NOW();
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit_collector_secret_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_row JSONB;
  current_row JSONB;
  changed_keys TEXT[];
BEGIN
  previous_row := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  current_row := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  IF TG_OP = 'INSERT' THEN
    changed_keys := ARRAY(
      SELECT jsonb_object_keys(current_row)
      ORDER BY 1
    );
  ELSIF TG_OP = 'DELETE' THEN
    changed_keys := ARRAY(
      SELECT jsonb_object_keys(previous_row)
      ORDER BY 1
    );
  ELSE
    changed_keys := ARRAY(
      SELECT key
      FROM (
        SELECT COALESCE(old_entry.key, new_entry.key) AS key,
               old_entry.value AS old_value,
               new_entry.value AS new_value
        FROM jsonb_each(previous_row) AS old_entry
        FULL OUTER JOIN jsonb_each(current_row) AS new_entry
          ON old_entry.key = new_entry.key
      ) AS field_diff
      WHERE old_value IS DISTINCT FROM new_value
      ORDER BY key
    );
  END IF;

  INSERT INTO collector_secret_config_audit (
    config_key,
    source_name,
    target_name,
    secret_name,
    operation,
    changed_fields,
    old_row_json,
    new_row_json
  )
  VALUES (
    COALESCE(NEW.config_key, OLD.config_key),
    COALESCE(NEW.source_name, OLD.source_name),
    COALESCE(NEW.target_name, OLD.target_name),
    COALESCE(NEW.secret_name, OLD.secret_name),
    TG_OP,
    changed_keys,
    previous_row,
    current_row
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_collector_secret_config_timestamps ON collector_secret_config;
CREATE TRIGGER trg_collector_secret_config_timestamps
BEFORE INSERT OR UPDATE ON collector_secret_config
FOR EACH ROW
EXECUTE FUNCTION set_collector_secret_config_timestamps();

DROP TRIGGER IF EXISTS trg_collector_secret_config_audit ON collector_secret_config;
CREATE TRIGGER trg_collector_secret_config_audit
AFTER INSERT OR UPDATE OR DELETE ON collector_secret_config
FOR EACH ROW
EXECUTE FUNCTION audit_collector_secret_config_change();
