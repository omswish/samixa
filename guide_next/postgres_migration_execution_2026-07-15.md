# Postgres Migration Execution Notes - 2026-07-15

## Objective

Move toward Postgres without breaking the current standalone wallboard.

The live runtime remains:

- SQLite as the active read/write store for the dashboard and gateway.
- Postgres as an optional mirror, enabled only when `POSTGRES_URL` is configured.

This keeps the current deployment stable while allowing controlled migration and auditability work.

## Implemented In This Phase

### 1. Optional Postgres schema bootstrap

The gateway now carries `api-gateway/sql/001_postgres_init.sql` and initializes the required mirror tables on first Postgres use:

- `dashboard_state_current`
- `dashboard_state_snapshot`
- `section_health_history`
- `gateway_ingest_event`

### 2. SQLite-to-Postgres dual write

Every SQLite state persistence continues as before, but now also mirrors the same state payload into Postgres when enabled.

This mirror includes:

- current full dashboard state
- point-in-time state snapshots
- per-section health status with timestamps
- collector ingest event logging from `/api/update`

### 3. Startup baseline seed

When the gateway starts with `POSTGRES_URL` configured, it immediately mirrors the current dashboard state once.

This avoids waiting for the next collector update before Postgres receives a baseline.

### 4. Manual baseline sync command

A manual sync entry point now exists:

```powershell
npm run postgres:sync --workspace api-gateway
```

Use this after setting `POSTGRES_URL` to push the current SQLite-backed dashboard state into Postgres on demand.

### 5. PM2 and env support

`ecosystem.config.js` now passes through:

- `POSTGRES_URL`
- `POSTGRES_SSL`

`.env.example` also documents these variables.

### 6. Normalized runtime tables

The gateway now also creates and writes these normalized Postgres tables:

- `collector_run`
- `asset_current_state`
- `asset_telemetry_history`

This is still dual-write only. SQLite remains the live read model.

### 7. Collector execution evidence

The gateway now records collector execution rows per section using the payload metadata that collectors already send.

Current live examples:

- Nutanix -> `section_key = nutanix`
- SolarWinds -> separate rows for `servers` and `networks`
- Symphony -> `section_key = symphony`

Each run stores:

- collector source
- section key
- started/finished timestamp
- success or failure
- failure domain classification when an error exists
- rows written
- target host
- source meta JSON

### 8. Normalized asset projections

Every persisted dashboard state now also refreshes normalized current assets and telemetry in Postgres.

Current asset types written:

- `server`
- `network_link`
- `hci_cluster`
- `hci_node`
- `service_desk_metric`

Server rows preserve:

- effective truth source
- fallback source when active
- status origin
- last metric timestamp

Telemetry rows are deduplicated by asset/metric/timestamp/source/quality so unrelated dashboard saves do not keep rewriting the same point.

### 9. Asset status history

The gateway now also maintains:

- `asset_status_history`

This table stores actual asset-status timelines separately from collector-path health.

Current status-history behavior:

- tracks only assets with a real status value
- seeds open rows from current state if history is empty
- closes the previous open row and opens a new one when status/source-origin changes
- keeps service-desk metric rows out of status history because they are metric projections, not asset states

Current reason mapping:

- `asset` -> `asset_observed`
- `collector_fallback` -> `collector_fallback`
- `derived` -> `derived_threshold`

### 10. Parity command

A new compare command now exists:

```powershell
npm run postgres:compare --workspace api-gateway
```

It compares the current SQLite-derived normalized asset projection against what is stored in Postgres:

- `asset_current_state`
- latest rows from `asset_telemetry_history`

This gives a repeatable parity check before any Postgres read-path cutover.

### 11. Timestamp monotonicity fix

The failure drill exposed a real issue in the original runtime contract:

- section health timestamps were derived from collector `attemptedAt`
- a delayed success could therefore recover a section using a timestamp earlier than a newer failure

This is now corrected by carrying `finishedAt` through collector payloads and preferring that value in the gateway for:

- section `lastAttemptAt`
- section `lastSuccessAt`
- collector run `finished_at`

This keeps recovery ordering truthful when collection completes after a later failure was already recorded.

### 12. Non-secret collector target config bootstrap

The gateway now also seeds a Postgres-backed config table:

- `collector_target_config`

Current seeded rows:

- `nutanix:primary`
- `solarwinds:servers`
- `solarwinds:networks`
- `symphony:primary`

This phase stores only non-secret target data:

- host
- target URL
- poll interval
- enabled flag
- metadata such as protocol and Nutanix port

Secrets remain in env for now:

- `NUTANIX_USER`
- `NUTANIX_PASS`
- `SW_USER`
- `SW_PASS`
- `SYM_USER`
- `SYM_PASS`

Bootstrap behavior is conservative:

- rows are inserted only when missing
- existing Postgres config rows are not overwritten by env on startup

### 13. Loopback runtime-config API

The gateway now exposes:

```text
GET /api/runtime-config/:source
```

Supported sources:

- `nutanix`
- `solarwinds`
- `symphony`

Current behavior:

- route is loopback-only
- when Postgres is enabled, it returns the Postgres-backed target rows
- when Postgres is unavailable or a row is missing, it falls back to env-derived defaults

This gives collectors a stable internal config contract without giving them direct database access.

### 14. Collectors now consume gateway runtime config

The collectors now resolve their non-secret target configuration from the gateway on each cycle:

- Nutanix collector resolves host, port, and poll interval
- SolarWinds collector resolves server/network target URLs, hosts, and poll interval
- Symphony collector resolves the dashboard URL and poll interval

If the runtime-config fetch fails, each collector falls back to the previous env/default behavior.

This preserves current standalone behavior while allowing target config to move into Postgres first.

Operational handling for direct DBA-managed edits is now documented in:

- [postgres_collector_config_dba_runbook_2026-07-15.md](/C:/Users/omkar.s/Code/samixa/guide_next/postgres_collector_config_dba_runbook_2026-07-15.md)

### 15. Collector-run target host evidence now reflects actual runtime target

Collectors now include the resolved target host in their update metadata.

As a result, `collector_run.target_host` now tracks the actual runtime target the collector used, rather than only the env default known to the gateway.

### 16. Database audit trail for collector target config

Postgres now also carries:

- `collector_target_config_audit`

This is implemented with a database trigger, so it captures direct DBA edits as well as any future application-managed edits.

Each audit row stores:

- config key
- operation (`INSERT`, `UPDATE`, `DELETE`)
- change timestamp
- database user
- session user
- application name
- client address
- transaction id
- changed field list
- full old row JSON
- full new row JSON

The same migration also adds automatic timestamp hygiene for `collector_target_config`:

- `updated_at` is set automatically on every insert/update
- `created_at` is backfilled automatically on insert if omitted

This makes direct SQL changes auditable without depending on the gateway or collectors to write change evidence.

### 17. Encrypted collector secret store

Postgres now also carries an encrypted collector secret store:

- `collector_secret_config`
- `collector_secret_config_audit`

Current secret rows cover:

- Nutanix primary username/password
- SolarWinds servers username/password
- SolarWinds networks username/password
- Symphony primary username/password

Current secret-store model:

- secrets are encrypted in Postgres using `aes-256-gcm`
- key material is derived with `scrypt`
- the gateway holds the master passphrase in `POSTGRES_SECRET_PASSPHRASE`
- collectors do not get database access or key access
- collectors fetch decrypted secrets from the loopback gateway route:

```text
GET /api/runtime-secrets/:source
```

Supported sources:

- `nutanix`
- `solarwinds`
- `symphony`

Bootstrap behavior is conservative:

- encrypted secret rows are seeded from env only when missing
- existing Postgres secret rows are not overwritten by env on startup

Operational handling for the encrypted secret store is now documented in:

- [postgres_secret_store_runbook_2026-07-15.md](/C:/Users/omkar.s/Code/samixa/guide_next/postgres_secret_store_runbook_2026-07-15.md)

## What This Does Not Do Yet

This phase does **not** cut the read path to Postgres.

The dashboard still reads the SQLite-backed gateway state exactly as before. This means:

- current standalone functionality should remain intact
- rollback is simple: unset `POSTGRES_URL` and restart the gateway
- if runtime-config Postgres reads fail, collectors still continue with env/default target settings

## Historical Data Reality

The current application does not have full normalized historical state in SQLite. It mostly stores:

- the latest dashboard state
- short rolling metric histories embedded in that state

Therefore, pre-mirror historical reconstruction into Postgres is limited. This phase can reliably seed:

- current dashboard state
- future dashboard snapshots
- future collector ingest events
- future section health history

It cannot recreate long-form historical events that were never stored before.

## Windows Server Rollout Order

Recommended safe rollout:

1. Create the Postgres database and service account on the Windows server.
2. Set `POSTGRES_URL` and `POSTGRES_SSL` in the server environment.
3. Run `npm run build --workspace api-gateway`.
4. Restart PM2 with updated environment.
5. Run `npm run postgres:sync --workspace api-gateway` once.
6. Verify new rows in `dashboard_state_current`, `dashboard_state_snapshot`, `gateway_ingest_event`, and `collector_target_config`.

## Validation Status

Validated locally in the current workspace:

- code compiles through the migration slice
- runtime remains designed to work with no `POSTGRES_URL`
- mirror writes are now exercised against local Postgres database `hil-dor-itdash`
- runtime-config bootstrap inserted 4 collector target rows into `collector_target_config`
- loopback runtime-config API returns Postgres-backed configs for Nutanix, SolarWinds, and Symphony
- verified `collector_target_config_audit` through a controlled change-and-rollback drill on `symphony:primary`
- verified audit fields captured:
  - `operation = UPDATE`
  - `changed_by = postgres`
  - `application_name = codex-config-audit-drill`
  - `changed_fields = {notes,updated_at}`
- seeded 8 encrypted secret rows into `collector_secret_config`
- verified `collector_secret_config_audit` inserted 8 bootstrap `INSERT` rows
- verified `GET /api/runtime-secrets/:source` resolves all current collector credentials with:
  - `backingStore = postgres`
  - `secretOrigin = postgres`
  - `keyVersion = v1`
- verified normalized table population from live traffic:
  - `asset_current_state = 36`
  - `asset_telemetry_history = 98`
  - `collector_run = 6` after waiting for live collector cycles
- verified status-history population after bootstrap repair:
  - `asset_status_history = 24`

Observed live asset-type distribution:

- `server = 16`
- `network_link = 4`
- `hci_cluster = 1`
- `hci_node = 3`
- `service_desk_metric = 12`

Observed live collector run examples:

- Nutanix success with target host `10.23.50.27`
- SolarWinds server success with target host `10.36.91.45`
- SolarWinds network success with target host `10.36.91.46`
- Symphony success with target host `hsd.adityabirla.com`

Observed parity result:

- `expectedAssetCount = 36`
- `actualAssetCount = 36`
- `expectedTelemetryCount = 98`
- `actualLatestTelemetryCount = 98`
- `assetMismatchCount = 0`
- `telemetryMismatchCount = 0`

Observed controlled failure-drill result:

- injected Symphony authentication-style failure payload moved the section to `error`
- `lastSuccessAt` and service-desk asset `last_synced_at` remained on the prior good sync
- Postgres recorded a `collector_run` row with:
  - `status = failed`
  - `failure_domain = authentication`
- after live collector retries and recovery, the section returned to `ok`
- the recovered success row now uses a later `finished_at`, avoiding the earlier non-monotonic timestamp issue

Observed real-world live Symphony failures during the drill window:

- timeout-class failures were also recorded automatically
- these appeared in `collector_run.failure_domain = timeout`
- last-synced service-desk values were retained until the later success completed

Not yet exercised in this session:

- Postgres-backed `/api/status` reads

## Next Recommended Postgres Steps

1. Follow the DBA runbook for controlled row-based config edits until an admin UI is justified.
2. Use the encrypted secret-store runbook for controlled secret validation and rotation planning.
3. Extend failure drills so collector-run evidence, section health, retained last-synced asset state, and secret fallback behavior are verified together.
4. After the server rollout is stable, remove plaintext env credentials from the normal collector runtime.
5. Only after sustained parity and config stability, move selected read paths from SQLite to Postgres.
