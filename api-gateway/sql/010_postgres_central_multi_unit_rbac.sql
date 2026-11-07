CREATE TABLE IF NOT EXISTS business_unit (
  unit_id TEXT PRIMARY KEY,
  unit_code TEXT NOT NULL UNIQUE,
  unit_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_cluster (
  cluster_id TEXT PRIMARY KEY,
  cluster_code TEXT NOT NULL UNIQUE,
  cluster_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_cluster_member (
  cluster_id TEXT NOT NULL REFERENCES unit_cluster(cluster_id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  membership_kind TEXT NOT NULL DEFAULT 'primary' CHECK (membership_kind IN ('primary', 'secondary')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cluster_id, unit_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_cluster_member_primary_unit
  ON unit_cluster_member (unit_id)
  WHERE membership_kind = 'primary';

CREATE TABLE IF NOT EXISTS app_role (
  role_key TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  role_scope TEXT NOT NULL CHECK (role_scope IN ('global', 'cluster', 'unit')),
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_role (role_key, role_name, role_scope, description)
VALUES
  ('platform_admin', 'Platform Admin', 'global', 'Manage units, clusters, users, all source settings, and platform services.'),
  ('central_viewer', 'Central Viewer', 'global', 'Read-only visibility across all units and clusters.'),
  ('global_auditor', 'Global Auditor', 'global', 'Read audit trails and export reports across all units and clusters.'),
  ('cluster_head', 'Cluster Head', 'cluster', 'View multiple assigned unit dashboards in one cluster dashboard.'),
  ('cluster_admin', 'Cluster Admin', 'cluster', 'Manage delegated source/session operations for units in an assigned cluster.'),
  ('cluster_auditor', 'Cluster Auditor', 'cluster', 'Read audit trails and export reports for units in an assigned cluster.'),
  ('unit_admin', 'Unit Admin', 'unit', 'Manage assigned unit source settings, sessions, and collector recovery.'),
  ('unit_operator', 'Unit Operator', 'unit', 'View assigned unit dashboard and freshness state.'),
  ('unit_auditor', 'Unit Auditor', 'unit', 'Read audit trails and export reports for an assigned unit.')
ON CONFLICT (role_key) DO UPDATE
SET
  role_name = EXCLUDED.role_name,
  role_scope = EXCLUDED.role_scope,
  description = EXCLUDED.description,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS app_user_global_role (
  user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES app_role(role_key) ON DELETE RESTRICT,
  granted_by BIGINT NULL REFERENCES app_user(user_id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, role_key),
  CONSTRAINT chk_app_user_global_role_scope
    CHECK (role_key IN ('platform_admin', 'central_viewer', 'global_auditor'))
);

CREATE TABLE IF NOT EXISTS app_user_cluster_role (
  user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES unit_cluster(cluster_id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES app_role(role_key) ON DELETE RESTRICT,
  granted_by BIGINT NULL REFERENCES app_user(user_id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, cluster_id, role_key),
  CONSTRAINT chk_app_user_cluster_role_scope
    CHECK (role_key IN ('cluster_head', 'cluster_admin', 'cluster_auditor'))
);

CREATE INDEX IF NOT EXISTS idx_app_user_cluster_role_cluster
  ON app_user_cluster_role (cluster_id, role_key);

CREATE TABLE IF NOT EXISTS app_user_unit_role (
  user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES app_role(role_key) ON DELETE RESTRICT,
  granted_by BIGINT NULL REFERENCES app_user(user_id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, unit_id, role_key),
  CONSTRAINT chk_app_user_unit_role_scope
    CHECK (role_key IN ('unit_admin', 'unit_operator', 'unit_auditor'))
);

CREATE INDEX IF NOT EXISTS idx_app_user_unit_role_unit
  ON app_user_unit_role (unit_id, role_key);

CREATE TABLE IF NOT EXISTS collector_instance (
  collector_instance_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  unit_id TEXT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  cluster_id TEXT NULL REFERENCES unit_cluster(cluster_id) ON DELETE SET NULL,
  collector_source TEXT NOT NULL CHECK (collector_source IN ('nutanix', 'solarwinds', 'symphony', 'multi-source')),
  deployment_mode TEXT NOT NULL DEFAULT 'central-worker' CHECK (deployment_mode IN ('central-worker', 'unit-agent')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_instance_token (
  token_id BIGSERIAL PRIMARY KEY,
  collector_instance_id TEXT NOT NULL REFERENCES collector_instance(collector_instance_id) ON DELETE CASCADE,
  token_label TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  UNIQUE (collector_instance_id, token_label)
);

CREATE TABLE IF NOT EXISTS collector_instance_target_grant (
  collector_instance_id TEXT NOT NULL REFERENCES collector_instance(collector_instance_id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  source_name TEXT NOT NULL CHECK (source_name IN ('nutanix', 'solarwinds', 'symphony')),
  target_name TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collector_instance_id, unit_id, source_name, target_name)
);

CREATE INDEX IF NOT EXISTS idx_collector_instance_target_grant_unit_source
  ON collector_instance_target_grant (unit_id, source_name, target_name);

CREATE OR REPLACE FUNCTION set_central_rbac_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_unit_updated_at ON business_unit;
CREATE TRIGGER trg_business_unit_updated_at
BEFORE UPDATE ON business_unit
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_unit_cluster_updated_at ON unit_cluster;
CREATE TRIGGER trg_unit_cluster_updated_at
BEFORE UPDATE ON unit_cluster
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_unit_cluster_member_updated_at ON unit_cluster_member;
CREATE TRIGGER trg_unit_cluster_member_updated_at
BEFORE UPDATE ON unit_cluster_member
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_app_role_updated_at ON app_role;
CREATE TRIGGER trg_app_role_updated_at
BEFORE UPDATE ON app_role
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_collector_instance_updated_at ON collector_instance;
CREATE TRIGGER trg_collector_instance_updated_at
BEFORE UPDATE ON collector_instance
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

INSERT INTO business_unit (
  unit_id,
  unit_code,
  unit_name,
  metadata_json
)
VALUES (
  'utkal',
  'UAIL',
  'Utkal Alumina',
  '{"bootstrap": true, "legacyDefaultUnit": true}'::jsonb
)
ON CONFLICT (unit_id) DO NOTHING;

INSERT INTO unit_cluster (
  cluster_id,
  cluster_code,
  cluster_name,
  metadata_json
)
VALUES (
  'default-cluster',
  'DEFAULT',
  'Default Operational Cluster',
  '{"bootstrap": true, "legacyDefaultCluster": true}'::jsonb
)
ON CONFLICT (cluster_id) DO NOTHING;

INSERT INTO unit_cluster_member (
  cluster_id,
  unit_id,
  membership_kind,
  sort_order
)
VALUES (
  'default-cluster',
  'utkal',
  'primary',
  10
)
ON CONFLICT (cluster_id, unit_id) DO NOTHING;
