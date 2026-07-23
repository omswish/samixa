CREATE TABLE IF NOT EXISTS app_local_auth_credential (
  username TEXT PRIMARY KEY CHECK (username IN ('admin', 'operator')),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'admin')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_source TEXT NOT NULL CHECK (password_source IN ('env', 'runtime', 'postgres')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_local_auth_credential_role
  ON app_local_auth_credential (role);

CREATE TABLE IF NOT EXISTS app_local_auth_credential_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_app_local_auth_credential_audit_user_time
  ON app_local_auth_credential_audit (username, changed_at DESC);

CREATE OR REPLACE FUNCTION set_app_local_auth_credential_timestamps()
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

CREATE OR REPLACE FUNCTION redact_app_local_auth_credential_row(input_row app_local_auth_credential)
RETURNS JSONB
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'username', input_row.username,
    'display_name', input_row.display_name,
    'role', input_row.role,
    'password_source', input_row.password_source,
    'created_at', input_row.created_at,
    'updated_at', input_row.updated_at,
    'last_login_at', input_row.last_login_at,
    'password_present', TRUE
  );
$$;

CREATE OR REPLACE FUNCTION audit_app_local_auth_credential_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_row JSONB;
  current_row JSONB;
  changed_keys TEXT[];
BEGIN
  previous_row := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN redact_app_local_auth_credential_row(OLD) ELSE NULL END;
  current_row := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN redact_app_local_auth_credential_row(NEW) ELSE NULL END;

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

  INSERT INTO app_local_auth_credential_audit (
    username,
    operation,
    changed_fields,
    old_row_json,
    new_row_json
  )
  VALUES (
    COALESCE(NEW.username, OLD.username),
    TG_OP,
    changed_keys,
    previous_row,
    current_row
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_app_local_auth_credential_timestamps ON app_local_auth_credential;
CREATE TRIGGER trg_app_local_auth_credential_timestamps
BEFORE INSERT OR UPDATE ON app_local_auth_credential
FOR EACH ROW
EXECUTE FUNCTION set_app_local_auth_credential_timestamps();

DROP TRIGGER IF EXISTS trg_app_local_auth_credential_audit ON app_local_auth_credential;
CREATE TRIGGER trg_app_local_auth_credential_audit
AFTER INSERT OR UPDATE OR DELETE ON app_local_auth_credential
FOR EACH ROW
EXECUTE FUNCTION audit_app_local_auth_credential_change();
