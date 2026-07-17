# Postgres Collector Target Config DBA Runbook - 2026-07-15

## Purpose

This runbook defines the safe operational process for managing non-secret collector target configuration directly in Postgres.

This is the current approved intermediate model:

- SQLite remains the live dashboard read/write store.
- Postgres stores mirrored evidence and non-secret collector target config.
- Secrets remain in environment variables.
- Collectors fetch runtime config from the gateway on each cycle.
- If Postgres config is missing or unavailable, collectors fall back to env/default values.

This means direct Postgres edits are low-risk when performed carefully, because the system still has a fallback path.

## Scope

This runbook applies only to:

- `collector_target_config`

It does **not** cover:

- usernames
- passwords
- tokens
- session storage
- dashboard state tables

## Current Config Keys

Expected rows at this stage:

- `nutanix:primary`
- `solarwinds:servers`
- `solarwinds:networks`
- `symphony:primary`

## Table Shape

Relevant fields:

- `config_key`
- `source_name`
- `target_name`
- `target_url`
- `host`
- `enabled`
- `owner`
- `poll_interval_seconds`
- `notes`
- `metadata_json`
- `created_at`
- `updated_at`

Audit table now present:

- `collector_target_config_audit`

## Operating Rules

1. Only edit non-secret target settings in this table.
2. Do not store usernames or passwords in `notes` or `metadata_json`.
3. Update one logical target at a time.
4. Capture the current row before changing it.
5. Validate through the gateway runtime-config endpoint after every change.
6. Prefer disabling a target over deleting a row.
7. Do not change `config_key`, `source_name`, or `target_name` unless a code change explicitly requires it.
8. Expect `updated_at` to change automatically even if you do not set it yourself.

## Pre-Change Checklist

Before editing:

1. Confirm the gateway is running and Postgres mirror is enabled.
2. Confirm the current rows exist.
3. Export the current row or copy it into the change record.
4. Confirm which collector consumes the row.
5. Confirm that the new URL/host is reachable from the collector host.

## Read Current Config

```sql
SELECT
  config_key,
  source_name,
  target_name,
  target_url,
  host,
  enabled,
  owner,
  poll_interval_seconds,
  notes,
  metadata_json,
  created_at,
  updated_at
FROM collector_target_config
ORDER BY config_key;
```

To inspect a single row:

```sql
SELECT *
FROM collector_target_config
WHERE config_key = 'solarwinds:networks';
```

## Safe Update Examples

### Example 1: change Symphony URL

```sql
UPDATE collector_target_config
SET
  target_url = 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx',
  host = 'hsd.adityabirla.com',
  notes = 'Updated by DBA on 2026-07-15 after portal path verification',
  updated_at = NOW()
WHERE config_key = 'symphony:primary';
```

### Example 2: change SolarWinds network host

```sql
UPDATE collector_target_config
SET
  target_url = 'http://10.36.91.46/Orion/SummaryView.aspx?ViewID=1',
  host = '10.36.91.46',
  notes = 'Updated by DBA on 2026-07-15 after Orion network portal validation',
  updated_at = NOW()
WHERE config_key = 'solarwinds:networks';
```

### Example 3: change Nutanix poll interval only

```sql
UPDATE collector_target_config
SET
  poll_interval_seconds = 30,
  notes = 'Poll interval adjusted by DBA on 2026-07-15',
  updated_at = NOW()
WHERE config_key = 'nutanix:primary';
```

### Example 4: disable a target temporarily

Note: current collectors do not yet enforce `enabled = false` as a hard stop. For now this is an operator signal field, not a kill switch.

```sql
UPDATE collector_target_config
SET
  enabled = false,
  notes = 'Temporarily disabled by DBA on 2026-07-15 during target maintenance',
  updated_at = NOW()
WHERE config_key = 'solarwinds:servers';
```

## Safe Upsert Example

Use only when a required row is missing.

```sql
INSERT INTO collector_target_config (
  config_key,
  source_name,
  target_name,
  target_url,
  host,
  enabled,
  owner,
  poll_interval_seconds,
  notes,
  metadata_json,
  created_at,
  updated_at
)
VALUES (
  'solarwinds:servers',
  'solarwinds',
  'servers',
  'http://10.36.91.45/Orion/SummaryView.aspx?ViewID=1',
  '10.36.91.45',
  TRUE,
  'Tech-Unit IT',
  30,
  'Recreated by DBA on 2026-07-15',
  '{"protocol":"http","viewId":1,"role":"servers"}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (config_key) DO UPDATE SET
  target_url = EXCLUDED.target_url,
  host = EXCLUDED.host,
  enabled = EXCLUDED.enabled,
  owner = EXCLUDED.owner,
  poll_interval_seconds = EXCLUDED.poll_interval_seconds,
  notes = EXCLUDED.notes,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();
```

## Validation After Change

### 1. Validate database row

```sql
SELECT
  config_key,
  target_url,
  host,
  enabled,
  poll_interval_seconds,
  notes,
  updated_at
FROM collector_target_config
WHERE config_key IN (
  'nutanix:primary',
  'solarwinds:servers',
  'solarwinds:networks',
  'symphony:primary'
)
ORDER BY config_key;
```

### 2. Validate gateway runtime config

Run from the application host:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-config/nutanix | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-config/solarwinds | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-config/symphony | ConvertTo-Json -Depth 8
```

Expected:

- `backingStore` should be `postgres`
- returned `host` and `targetUrl` should match the edited row

### 3. Validate collector evidence

After at least one collector cycle, inspect recent runs:

```sql
SELECT
  collector_source,
  section_key,
  target_host,
  status,
  failure_domain,
  started_at,
  finished_at
FROM collector_run
ORDER BY finished_at DESC
LIMIT 20;
```

Expected:

- `target_host` matches the edited target
- collector continues to report `success`, or a truthful failure domain if the target is wrong or unreachable

### 4. Validate config audit trail

```sql
SELECT
  audit_id,
  config_key,
  operation,
  changed_at,
  changed_by,
  session_user_name,
  application_name,
  client_addr,
  txid,
  changed_fields
FROM collector_target_config_audit
WHERE config_key = 'symphony:primary'
ORDER BY audit_id DESC
LIMIT 20;
```

To inspect row snapshots:

```sql
SELECT
  audit_id,
  operation,
  old_row_json,
  new_row_json
FROM collector_target_config_audit
WHERE config_key = 'symphony:primary'
ORDER BY audit_id DESC
LIMIT 5;
```

Expected:

- every insert, update, or delete produces an audit row
- `changed_fields` identifies what changed
- `old_row_json` and `new_row_json` preserve the before/after values

## Rollback

Rollback is straightforward because config is row-based.

1. Restore the previous row values from the captured pre-change output.
2. Re-run the runtime-config validation endpoint.
3. Confirm new collector runs return to normal.
4. Confirm the rollback itself is present in `collector_target_config_audit`.

Example rollback:

```sql
UPDATE collector_target_config
SET
  target_url = 'http://10.36.91.46/Orion/SummaryView.aspx?ViewID=1',
  host = '10.36.91.46',
  enabled = TRUE,
  owner = 'Tech-Unit IT',
  poll_interval_seconds = 30,
  notes = 'Rolled back by DBA on 2026-07-15',
  metadata_json = '{"protocol":"http","viewId":1,"role":"networks"}'::jsonb,
  updated_at = NOW()
WHERE config_key = 'solarwinds:networks';
```

## Failure Semantics

These edits affect collector target selection only.

They do not change the truth model:

- dashboard sections still retain last synced values on collector failure
- section/card freshness still depends on actual successful collector runs
- collector failures should remain visible as datalink health, not synthetic data

If a Postgres config edit is wrong:

- the collector should fail truthfully
- the gateway should record the failure in `collector_run`
- the dashboard should continue showing last synced data with last synced time

## Current Limitations

1. `enabled = false` is stored but not yet enforced as a collector stop signal.
2. No admin UI exists yet for editing these rows.
3. Secrets are still env-based and outside this runbook.

## Verified Drill

Validated on 2026-07-15 with a controlled note-field change and rollback on `symphony:primary`.

Observed:

- audit rows were written for both the temporary change and the rollback
- `changed_by` and `application_name` were captured
- `changed_fields` included `notes` and `updated_at`
- the runtime-config endpoint returned the original value after rollback

## Recommended Next Steps After This Runbook

1. Use the encrypted secret-store runbook for credential storage and validation:
   [postgres_secret_store_runbook_2026-07-15.md](/C:/Users/omkar.s/Code/samixa/guide_next/postgres_secret_store_runbook_2026-07-15.md)
2. Add an operator UI only if direct DBA management becomes operationally limiting.
