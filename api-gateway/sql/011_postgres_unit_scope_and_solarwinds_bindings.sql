ALTER TABLE dashboard_state_current
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

ALTER TABLE dashboard_state_snapshot
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

ALTER TABLE section_health_history
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

ALTER TABLE gateway_ingest_event
  ADD COLUMN IF NOT EXISTS unit_id TEXT NULL REFERENCES business_unit(unit_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_target_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS collector_instance_id TEXT NULL;

ALTER TABLE collector_run
  ADD COLUMN IF NOT EXISTS unit_id TEXT NULL REFERENCES business_unit(unit_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_target_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS collector_instance_id TEXT NULL;

ALTER TABLE asset_current_state
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

ALTER TABLE asset_telemetry_history
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

ALTER TABLE asset_status_history
  ADD COLUMN IF NOT EXISTS unit_id TEXT NOT NULL DEFAULT 'utkal' REFERENCES business_unit(unit_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_dashboard_state_current_unit_key
  ON dashboard_state_current (unit_id, state_key);

CREATE INDEX IF NOT EXISTS idx_dashboard_state_snapshot_unit_key_time
  ON dashboard_state_snapshot (unit_id, state_key, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_section_health_history_unit_time
  ON section_health_history (unit_id, section_key, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_ingest_event_unit_source_time
  ON gateway_ingest_event (unit_id, collector_source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_run_unit_source_time
  ON collector_run (unit_id, collector_source, section_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_asset_current_state_unit_type_name
  ON asset_current_state (unit_id, asset_type, display_name);

CREATE INDEX IF NOT EXISTS idx_asset_telemetry_history_unit_asset_time
  ON asset_telemetry_history (unit_id, asset_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS solarwinds_server_binding (
  binding_id BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  target_name TEXT NOT NULL DEFAULT 'servers',
  display_name TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  node_object_id TEXT GENERATED ALWAYS AS ('N:' || node_id::text) STORED,
  aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  role TEXT NULL,
  platform TEXT NULL,
  criticality TEXT NOT NULL DEFAULT 'standard' CHECK (criticality IN ('critical', 'high', 'standard', 'low')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'failed', 'disabled')),
  last_validated_at TIMESTAMPTZ NULL,
  validation_message TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, target_name, node_id)
);

CREATE INDEX IF NOT EXISTS idx_solarwinds_server_binding_unit_enabled
  ON solarwinds_server_binding (unit_id, enabled, display_name);

CREATE TABLE IF NOT EXISTS solarwinds_network_binding (
  binding_id BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES business_unit(unit_id) ON DELETE CASCADE,
  target_name TEXT NOT NULL DEFAULT 'networks',
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  node_object_id TEXT GENERATED ALWAYS AS ('N:' || node_id::text) STORED,
  interface_id INTEGER NULL,
  interface_object_id TEXT GENERATED ALWAYS AS (
    CASE WHEN interface_id IS NULL THEN NULL ELSE 'I:' || interface_id::text END
  ) STORED,
  kind TEXT NOT NULL DEFAULT 'carrier' CHECK (kind IN ('carrier', 'sdwan', 'mpls', 'internet', 'other')),
  circuit_id TEXT NULL,
  bandwidth_mbps INTEGER NULL,
  criticality TEXT NOT NULL DEFAULT 'standard' CHECK (criticality IN ('critical', 'high', 'standard', 'low')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'failed', 'disabled')),
  last_validated_at TIMESTAMPTZ NULL,
  validation_message TEXT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, target_name, node_id, interface_id)
);

CREATE INDEX IF NOT EXISTS idx_solarwinds_network_binding_unit_enabled
  ON solarwinds_network_binding (unit_id, enabled, display_name);

DROP TRIGGER IF EXISTS trg_solarwinds_server_binding_updated_at ON solarwinds_server_binding;
CREATE TRIGGER trg_solarwinds_server_binding_updated_at
BEFORE UPDATE ON solarwinds_server_binding
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_solarwinds_network_binding_updated_at ON solarwinds_network_binding;
CREATE TRIGGER trg_solarwinds_network_binding_updated_at
BEFORE UPDATE ON solarwinds_network_binding
FOR EACH ROW
EXECUTE FUNCTION set_central_rbac_updated_at();

INSERT INTO solarwinds_server_binding (
  unit_id,
  display_name,
  node_id,
  aliases_json,
  role,
  platform,
  validation_status,
  metadata_json
)
VALUES
  ('utkal', 'HIL-HIDDOR-AV01.abgplanet.abg.com', 651, '["HIL-HIDDOR-AV01"]'::jsonb, 'antivirus', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-BK01', 1028, '[]'::jsonb, 'backup', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-CSCTS1', 311, '[]'::jsonb, 'application', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-CSCTS2', 319, '[]'::jsonb, 'application', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HILHIDDORDT0320', 299, '[]'::jsonb, 'desktop-service', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-FS01.abgplanet.abg.com', 216, '["HIL-HIDDOR-FS01"]'::jsonb, 'file-server', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HILHIDDORILMSAP', 1026, '[]'::jsonb, 'application', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HILHIDDORILMSDB', 1027, '[]'::jsonb, 'database', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-PIMW.abgplanet.abg.com', 221, '["HIL-HIDDOR-PIMW"]'::jsonb, 'application', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-PSDM.abgplanet.abg.com', 568, '["HIL-HIDDOR-PSDM"]'::jsonb, 'application', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US01', 1058, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US02', 349, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US03', 347, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US04', 652, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US05', 1024, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-HIDDOR-US06', 1025, '[]'::jsonb, 'utility', 'on-prem', 'validated', '{"bootstrap": true}'::jsonb)
ON CONFLICT (unit_id, target_name, node_id) DO NOTHING;

INSERT INTO solarwinds_network_binding (
  unit_id,
  display_name,
  provider,
  node_id,
  interface_id,
  kind,
  validation_status,
  metadata_json
)
VALUES
  ('utkal', 'RJIO (ISP1)', 'RJIO (ISP1)', 1419, NULL, 'carrier', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'RailTel (ISP2)', 'RailTel (ISP2)', 1417, NULL, 'carrier', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-UTK-EC-1 (SDWAN-A)', 'HIL-UTK-EC-1 (SDWAN-A)', 401, 4744, 'sdwan', 'validated', '{"bootstrap": true}'::jsonb),
  ('utkal', 'HIL-UTK-EC-2 (SDWAN-B)', 'HIL-UTK-EC-2 (SDWAN-B)', 402, 12134, 'sdwan', 'validated', '{"bootstrap": true}'::jsonb)
ON CONFLICT (unit_id, target_name, node_id, interface_id) DO NOTHING;
