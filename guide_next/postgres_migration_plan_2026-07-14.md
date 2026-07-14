# PostgreSQL Migration Plan - 2026-07-14

## Objective

Move the dashboard persistence layer from the current local SQLite file to PostgreSQL in a way that matches the agreed target architecture:

- dedicated VM deployment
- collectors and `api-gateway` on the same VM
- collector write path restricted to loopback
- user-facing dashboard exposed through reverse proxy
- authenticated user access for normal users
- controlled kiosk / wallboard access for the large display

The migration must preserve:

- current live dashboard state
- truthful last-synced behavior during source failures
- historical telemetry and health evidence going forward
- a clear distinction between:
  - upstream source / datalink failure
  - collector runtime failure
  - gateway ingest failure
  - actual infrastructure or service degradation

This document is a plan only. It does not change runtime behavior by itself.

## Architecture Assumptions

This plan now assumes the architecture documented in [target_security_architecture_2026-07-14.md](C:/Users/omkar.s/Code/samixa/guide_next/target_security_architecture_2026-07-14.md):

1. Collectors and gateway run on one dedicated VM.
2. Collector writes go only to `http://127.0.0.1:4000/api/update`.
3. User traffic does not reach the raw gateway directly.
4. The dashboard is published through a reverse proxy over HTTPS.
5. Normal users use SSO if available, otherwise local login.
6. The wallboard can use a controlled read-only kiosk route.
7. Upstream collector credentials must be recoverable and therefore encrypted at rest, not hashed.
8. Local dashboard user passwords, if used, must be hashed.

## Current State

The gateway currently persists one logical dashboard snapshot in SQLite:

- file: `api-gateway/data/itdash.db`
- table: `app_state`
- primary payload: JSON blob under `state_key = 'dashboard_state'`

Current behavior already supports:

- last known good data retention
- section-level health:
  - `nutanix`
  - `servers`
  - `networks`
  - `symphony`
- source-level derived health:
  - `nutanix`
  - `solarwinds`
  - `symphony`
- timestamps:
  - `lastAttemptAt`
  - `lastSuccessAt`
  - `lastUpdate`
- error text:
  - `lastError`

Current limitations still matter:

- runtime state is mostly one mutable snapshot
- durable history is weak
- collector activity and gateway ingest are not first-class records
- auth/config/audit data are not modeled for the future hardened deployment
- the storage design is not yet aligned to kiosk access, local login fallback, or encrypted collector configuration

## Migration Goals

The PostgreSQL design should satisfy these rules:

1. The dashboard must remain truthful.
2. Last synced data must still be shown when fresh collection fails.
3. Historical data must be queryable by time.
4. Health and failure provenance must be explicit.
5. A node being down must never be conflated with the collector path being down.
6. User authentication data, if introduced, must be modeled separately from collector secrets.
7. Collector secrets must be encrypted at rest with a machine/service-account protected key strategy.
8. Audit evidence must be durable enough for operational review and future ISMS controls.
9. Migration must allow rollback to the current SQLite path until production confidence is high.

## Non-Goals

- No UI redesign in this phase.
- No immediate SSO implementation in this phase.
- No speculative schema for metrics not already collected or clearly planned.
- No destructive deletion of existing SQLite data during first cutover.
- No claim that Postgres alone resolves plaintext SolarWinds or expired Nutanix certificate risk; those remain documented exceptions and controls.

## What PostgreSQL Must Become

PostgreSQL should not be treated as only a replacement for `app_state`.

It should become the durable system of record for:

- current dashboard snapshot
- asset current state
- telemetry history
- asset status history
- collector activity history
- gateway ingest history
- local user accounts if local auth is enabled
- encrypted upstream collector configuration
- audit history for writes, auth, and config changes
- security exception metadata where operationally useful

## Recommended Data Model

Use PostgreSQL as a normalized event-plus-snapshot store.

### 1. `dashboard_state_snapshot`

Purpose:

- hold the latest materialized state for fast API reads
- support the current dashboard contract with minimal disruption

Suggested columns:

- `snapshot_id` UUID primary key
- `captured_at` timestamptz not null
- `state_json` jsonb not null
- `source` text not null default `gateway`
- `state_version` integer not null default `1`

Notes:

- This mirrors current SQLite behavior as the lowest-risk read model.
- The API can continue serving a single current state quickly while deeper tables mature.

### 2. `collector_run`

Purpose:

- record every collector attempt, even when it fails before sending usable data

Suggested columns:

- `run_id` UUID primary key
- `collector_source` text not null
- `section_key` text not null
- `started_at` timestamptz not null
- `finished_at` timestamptz null
- `status` text not null
  - `success`
  - `partial`
  - `failed`
- `failure_domain` text null
  - `collector`
  - `network`
  - `authentication`
  - `portal`
  - `selector`
  - `timeout`
  - `gateway_ingest`
  - `unknown`
- `error_message` text null
- `records_written` integer null
- `target_host` text null
- `target_url_hash` text null
- `meta_json` jsonb not null default `'{}'::jsonb`

Why:

- This is the backbone for distinguishing collector-path trouble from asset trouble.
- It also supports later audit correlation and performance tracking.

### 3. `section_health_history`

Purpose:

- preserve health transitions for each dashboard section and its backing source

Suggested columns:

- `id` bigserial primary key
- `section_key` text not null
- `source_key` text not null
- `status` text not null
  - `ok`
  - `stale`
  - `error`
  - `never`
  - `partial`
- `last_attempt_at` timestamptz null
- `last_success_at` timestamptz null
- `error_message` text null
- `derived_from_run_id` UUID null references `collector_run(run_id)`
- `recorded_at` timestamptz not null

Why:

- It preserves datalink status over time instead of only the current view.
- It is the main evidence store for "link healthy vs stale vs broken."

### 4. `asset_current_state`

Purpose:

- latest truthful state per monitored asset

Suggested columns:

- `asset_id` text primary key
- `asset_type` text not null
  - `server`
  - `network_link`
  - `hci_node`
  - `service_desk_metric`
- `display_name` text not null
- `status` text null
- `status_origin` text not null
  - `asset`
  - `collector_fallback`
  - `derived`
- `truth_source` text null
  - `nutanix`
  - `solarwinds`
  - `symphony`
  - `gateway`
- `fallback_source` text null
- `last_metric_at` timestamptz null
- `last_status_change_at` timestamptz null
- `last_synced_at` timestamptz null
- `state_json` jsonb not null
- `updated_at` timestamptz not null

Why:

- Allows the dashboard to query latest asset state directly.
- `status_origin` prevents mixing source failure with asset-down status.
- `fallback_source` supports the agreed rule that SolarWinds becomes fallback only after Nutanix has been stale for the defined threshold.

### 5. `asset_telemetry_history`

Purpose:

- historical time-series values for servers, links, HCI, and selected service metrics

Suggested columns:

- `id` bigserial primary key
- `asset_id` text not null
- `asset_type` text not null
- `metric_name` text not null
- `metric_value_numeric` double precision null
- `metric_value_text` text null
- `unit` text null
- `collected_at` timestamptz not null
- `truth_source` text not null
- `collector_run_id` UUID null references `collector_run(run_id)`
- `quality` text not null default `observed`
  - `observed`
  - `last_synced`
  - `derived`

Why:

- Preserves chart history instead of only short arrays inside JSON.
- Supports later rollups, retention, and incident review.

### 6. `asset_status_history`

Purpose:

- record actual asset health transitions without confusing them with collection trouble

Suggested columns:

- `id` bigserial primary key
- `asset_id` text not null
- `asset_type` text not null
- `status` text not null
- `status_reason_type` text not null
  - `asset_observed`
  - `collector_missing`
  - `source_stale`
  - `manual_override`
  - `derived_threshold`
- `status_reason_text` text null
- `truth_source` text null
- `started_at` timestamptz not null
- `ended_at` timestamptz null
- `collector_run_id` UUID null references `collector_run(run_id)`

Critical rule:

- `asset_observed` means the infrastructure was actually reported as degraded/down.
- `collector_missing` or `source_stale` means monitoring-path trouble, not node trouble.

### 7. `gateway_ingest_event`

Purpose:

- tell whether the gateway accepted or rejected collector updates

Suggested columns:

- `id` bigserial primary key
- `collector_source` text not null
- `received_at` timestamptz not null
- `http_status` integer not null
- `ingest_status` text not null
  - `accepted`
  - `rejected`
  - `parse_failed`
  - `db_failed`
- `error_message` text null
- `payload_digest` text null
- `collector_run_id` UUID null
- `source_host` text null
- `listener_scope` text not null default `loopback`

Why:

- This isolates gateway/API failures from collector failures.
- `listener_scope` makes the intended loopback-only write design explicit in evidence.

### 8. `auth_user`

Purpose:

- support local login only if SSO is unavailable or delayed

Suggested columns:

- `user_id` UUID primary key
- `email` text unique not null
- `display_name` text not null
- `password_hash` text not null
- `auth_source` text not null
  - `local`
  - `sso_shadow`
- `role` text not null
- `status` text not null
  - `active`
  - `disabled`
  - `locked`
- `last_login_at` timestamptz null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Important:

- This table is for dashboard users only.
- Upstream collector credentials must never be stored here.

### 9. `collector_target_config`

Purpose:

- store non-secret upstream collector configuration with change tracking

Suggested columns:

- `config_id` UUID primary key
- `source_name` text not null
- `target_url` text not null
- `username` text not null
- `enabled` boolean not null default true
- `owner` text null
- `poll_interval_seconds` integer null
- `last_rotated_at` timestamptz null
- `notes` text null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

### 10. `collector_secret`

Purpose:

- store recoverable upstream credentials encrypted at rest

Suggested columns:

- `secret_id` UUID primary key
- `config_id` UUID not null references `collector_target_config(config_id)`
- `secret_type` text not null
  - `password`
  - `token`
  - `cookie_seed`
- `encrypted_value` bytea not null
- `key_reference` text not null
- `credential_version` integer not null default `1`
- `created_at` timestamptz not null
- `expires_at` timestamptz null
- `rotated_by` text null

Important:

- Encryption key material should be machine-bound or service-account protected, for example via Windows DPAPI.
- This is for Nutanix, SolarWinds, and Symphony access, not human dashboard login.

### 11. `collector_write_audit`

Purpose:

- retain append-only evidence of write attempts to the gateway

Suggested columns:

- `id` bigserial primary key
- `timestamp` timestamptz not null
- `collector_name` text not null
- `section_name` text not null
- `result` text not null
- `error_message` text null
- `request_checksum` text null
- `source_host` text null
- `duration_ms` integer null
- `collector_run_id` UUID null

### 12. `auth_audit`

Purpose:

- audit user access to the dashboard once auth is introduced

Suggested columns:

- `id` bigserial primary key
- `timestamp` timestamptz not null
- `user_id` UUID null
- `email` text null
- `action` text not null
- `ip_address` text null
- `user_agent` text null
- `result` text not null
- `auth_source` text not null

### 13. `config_change_audit`

Purpose:

- record durable change history for collector config and other security-relevant settings

Suggested columns:

- `id` bigserial primary key
- `timestamp` timestamptz not null
- `actor` text not null
- `changed_object` text not null
- `change_type` text not null
- `before_checksum` text null
- `after_checksum` text null
- `notes` text null

### 14. `security_exception_register`

Purpose:

- optionally track operationally accepted exceptions that affect data collection trust

Suggested columns:

- `id` bigserial primary key
- `exception_key` text unique not null
- `source_name` text not null
- `control_gap` text not null
- `compensating_control` text not null
- `owner` text not null
- `review_due_at` timestamptz null
- `status` text not null
  - `active`
  - `retired`

Examples:

- SolarWinds upstream on plaintext HTTP
- Nutanix certificate validation exception pending certificate remediation

This table is optional for phase 1, but aligns well with the agreed IS posture.

## Failure Provenance Model

The dashboard and storage should clearly separate these cases.

### Case 1. Upstream Source / Datalink Failure

Meaning:

- collector could not reach portal/API
- login or session failed
- selector parse failed
- timeout happened before valid payload

How to store:

- `collector_run.status = failed`
- `collector_run.failure_domain = ...`
- `section_health_history.status = error` or `stale`
- no `asset_status_history` entry claiming the node is down unless the source explicitly said so

Operator meaning:

- show last synced asset data
- show datalink status and last synced time
- do not mark assets as actually down only because the collector failed

### Case 2. Gateway/API Failure

Meaning:

- collector succeeded enough to build a payload, but the gateway failed to accept or persist it

How to store:

- `gateway_ingest_event.ingest_status = db_failed | rejected | parse_failed`
- optionally keep the `collector_run` as `partial` or `failed` with `failure_domain = gateway_ingest`

Operator meaning:

- the internal write path failed
- not the same as source portal failure
- not the same as infrastructure outage

### Case 3. Actual Asset Down / Degraded

Meaning:

- Nutanix, SolarWinds, or Symphony explicitly reported down/offline/critical or equivalent threshold breach

How to store:

- `asset_status_history.status = down | critical | offline | warning`
- `status_reason_type = asset_observed`
- `truth_source = nutanix | solarwinds | symphony`

Operator meaning:

- this is a real infrastructure or service condition
- it must remain visually distinct from source-path errors

### Case 4. Truth-Source Fallback

Meaning:

- Nutanix is the source of truth when available
- SolarWinds may be used only after Nutanix has been unavailable for more than the agreed threshold

How to store:

- `asset_current_state.truth_source = nutanix | solarwinds`
- `asset_current_state.fallback_source = solarwinds` when fallback is active
- `asset_telemetry_history.quality = last_synced | observed` as appropriate
- `meta_json` on `collector_run` should note fallback activation and expiry condition

Operator meaning:

- the operator can tell whether the metric is live primary-source data or controlled fallback data

## Historical Data Strategy

### Immediate Retention

Preserve all current SQLite data before cutover:

- keep `api-gateway/data/itdash.db`
- take a timestamped backup before first Postgres migration run
- keep the current JSON legacy backup if present

### Backfill Scope

What can be backfilled from current SQLite:

- latest full state snapshot
- current per-section timestamps
- current per-source status
- current server/network/Nutanix/HSD values
- short in-memory history arrays currently embedded in JSON

What cannot be fully reconstructed from current SQLite:

- every past collector attempt
- every past gateway ingest result
- every auth/config change event
- every intermediate health transition overwritten in-place

Therefore:

- the first migration should import current SQLite state as baseline
- historical event fidelity starts fully only after Postgres event tables go live

### Recommended Backfill Labels

Imported legacy rows should be marked:

- `quality = derived`
- `status_reason_type = derived_threshold` or `asset_observed` only when the source is explicit
- `meta_json.import_origin = 'sqlite_baseline_2026_07_14'`

## Deployment Alignment

The Postgres implementation plan must match the intended runtime deployment:

### Internal write path

- collectors -> `127.0.0.1:4000/api/update`
- gateway writes to local/remote Postgres over a controlled DB connection
- no LAN client should ever write dashboard state directly

### User-facing read path

- reverse proxy -> dashboard UI -> read API path
- no external route to raw write endpoints

### Kiosk / wallboard

- read-only route
- no configuration functions
- no need for broad user/session data in the wallboard projection

### Authentication split

- SSO remains preferred for standard users
- local auth is a fallback model only
- user auth data and collector secrets must remain separate in the schema and in the code path

## Migration Phases

### Phase 1. Introduce PostgreSQL Connectivity and Secrets Strategy

Tasks:

- add PostgreSQL connection config to `api-gateway`
- define how DB credentials and encryption key references will be provided on the dedicated VM
- keep SQLite as primary runtime until verified
- add health check for Postgres connectivity

Success criteria:

- gateway can connect to Postgres
- encryption strategy for recoverable collector secrets is defined before schema usage
- no production traffic served from Postgres yet

### Phase 2. Create Core Schema

Tasks:

- add SQL migration files
- create core runtime tables:
  - `dashboard_state_snapshot`
  - `collector_run`
  - `section_health_history`
  - `asset_current_state`
  - `asset_telemetry_history`
  - `asset_status_history`
  - `gateway_ingest_event`
- create security/control tables:
  - `auth_user`
  - `collector_target_config`
  - `collector_secret`
  - `collector_write_audit`
  - `auth_audit`
  - `config_change_audit`
- add indexes:
  - `asset_telemetry_history(asset_id, collected_at desc)`
  - `asset_status_history(asset_id, started_at desc)`
  - `collector_run(section_key, started_at desc)`
  - `section_health_history(section_key, recorded_at desc)`
  - `gateway_ingest_event(collector_source, received_at desc)`

Success criteria:

- schema is reproducible in dev and target VM environments
- empty database passes startup checks
- security-sensitive tables exist even if some auth features are introduced later

### Phase 3. Baseline Import from SQLite

Tasks:

- write one importer for current SQLite snapshot
- import:
  - current dashboard snapshot
  - current asset state
  - available history arrays as baseline telemetry points
  - current section/source health
- do not fabricate missing historical auth/audit data

Success criteria:

- Postgres holds an equivalent current state to SQLite
- imported timestamps match source snapshot where available
- imported data is clearly labeled as baseline-derived

### Phase 4. Dual-Write in Gateway

Tasks:

- gateway continues reading from SQLite
- gateway writes new successful updates to:
  - SQLite
  - Postgres
- gateway also writes collector run, section health, ingest events, and write audit records to Postgres

Success criteria:

- no user-visible change
- Postgres data grows correctly over live traffic
- write-path evidence exists for both success and failure

### Phase 5. Introduce Config/Auth Persistence

Tasks:

- move non-secret collector config into Postgres
- move encrypted upstream credentials into Postgres
- if local auth is implemented before SSO, back it with `auth_user` and `auth_audit`

Success criteria:

- collector secrets are not stored as plaintext in application config
- user passwords, if used, are hashed
- config changes are auditable

### Phase 6. Read Verification and Provenance Testing

Tasks:

- add an internal compare tool:
  - SQLite current state vs Postgres materialized current state
- verify:
  - server counts
  - network counts
  - HSD totals
  - section statuses
  - source statuses
  - last synced timestamps
  - fallback activation logic
- run failure drills for:
  - source failure
  - gateway ingest failure
  - Nutanix stale > 10 minutes with SolarWinds fallback

Success criteria:

- repeated matches over multiple hours and at least one failure/recovery cycle
- operators can distinguish source-path failure from real asset issues

### Phase 7. Switch API Reads to PostgreSQL

Tasks:

- serve `/api/status` from Postgres-backed current snapshot or equivalent read model
- keep SQLite dual-write for rollback window
- ensure dashboard projection remains compatible with kiosk and authenticated user routes

Success criteria:

- dashboard behavior unchanged
- no stale or mismapped values introduced
- provenance fields remain accurate

### Phase 8. Decommission SQLite

Tasks:

- only after stable burn-in
- archive SQLite file
- remove SQLite write path

Success criteria:

- PostgreSQL is the sole system of record
- rollback window is intentionally closed

## Gateway Changes Required Later

These are implementation tasks for the later migration phase:

1. Replace `better-sqlite3` state persistence with a repository layer.
2. Split:
   - current snapshot writes
   - historical event writes
   - health derivation writes
   - auth/config writes
3. Persist every collector attempt, not only successful final state.
4. Persist ingest outcome separately from collector outcome.
5. Persist actual asset status transitions separately from source health transitions.
6. Ensure the gateway write path continues to assume loopback-only collectors unless the architecture expands.

## Collector Changes Required Later

Collectors should eventually provide a clearer run contract:

- collector source
- section key
- attempted timestamp
- finished timestamp
- success/partial/failure
- reason domain on failure
- payload row count where meaningful
- whether fallback logic was activated
- which upstream endpoint or credential profile was used

This does not require a UI change first.

## Suggested Implementation Order

1. Add repository abstraction in `api-gateway`.
2. Define Postgres credential and encryption-key handling for the dedicated VM.
3. Create PostgreSQL schema and migrations.
4. Build SQLite-to-Postgres baseline importer.
5. Add dual-write and write-audit persistence.
6. Move collector config and encrypted secrets into Postgres.
7. Add compare script for current-state parity and provenance checks.
8. Run parity verification over live traffic.
9. Flip reads to Postgres.
10. Keep SQLite rollback window for a fixed period.

## Verification Checklist

Before cutover:

- current dashboard values match between SQLite and Postgres
- section `lastAttemptAt` and `lastSuccessAt` match
- source-level status derivation matches
- Nutanix fallback-to-SolarWinds logic still behaves correctly
- HSD last synced values remain available during collector failure
- network and server histories remain queryable
- write-path records show loopback-origin ingest as intended

During failure testing:

- collector failure shows as source/section issue only
- gateway ingest failure is recorded distinctly
- real asset down status remains distinguishable
- stale data is still served with last synced timestamp
- fallback activation after Nutanix stale threshold is visible and auditable

During security validation:

- collector secrets are encrypted at rest
- local user passwords, if present, are hashed
- auth events and config changes are auditable
- no schema path requires plaintext storage of human credentials

## Rollback Plan

If PostgreSQL read path misbehaves:

- switch API reads back to SQLite
- keep PostgreSQL data for diagnosis
- do not discard imported or dual-written data

If PostgreSQL writes fail during dual-write:

- keep SQLite as source of truth
- mark PostgreSQL path degraded
- investigate before re-enabling parity checks

If config/auth migration proves incomplete:

- keep runtime secrets in the current interim mechanism temporarily
- do not cut over config/auth reads until encryption, auditing, and recovery are proven

## Bottom Line

The PostgreSQL migration should not be treated as a simple database engine swap.

It should be used to formalize five separate truths:

- what the infrastructure actually reported
- what each collector managed to collect
- what the gateway successfully ingested and served
- who can access the dashboard
- how upstream collector configuration and secrets are controlled

That separation is the key requirement for preserving historical data honestly and for clearly telling whether:

- the datalink failed
- the collector failed
- the API failed
- fallback data is being used
- or the assets were actually down
