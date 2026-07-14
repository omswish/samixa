# PostgreSQL Migration Plan - 2026-07-14

## Objective

Move the dashboard state store from the current local SQLite file to PostgreSQL without losing:

- current live state
- historical telemetry already collected
- section/source health history
- the distinction between:
  - collector or datalink failure
  - API/gateway failure
  - actual infrastructure/node outage

This document is a plan only. It does not change runtime behavior by itself.

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

What it does not provide well enough yet:

- durable historical telemetry querying
- durable history of health-state transitions
- clean provenance for why something is red:
  - asset actually down
  - source stale
  - collector failed
  - gateway failed to ingest
- multi-client concurrent access and reporting
- easier future analytics and retention policies

## Migration Goals

The PostgreSQL design should satisfy these rules:

1. The dashboard must remain truthful.
2. Last synced data must still be shown when fresh collection fails.
3. Historical data must be queryable by time.
4. Health/failure provenance must be explicit.
5. A node being down must never be conflated with the collector path being down.
6. Migration must allow rollback to the current SQLite path until production confidence is high.

## Non-Goals

- No UI redesign in this phase.
- No collector feature expansion in this phase.
- No speculative schema for metrics we do not collect yet.
- No destructive deletion of existing SQLite data during first cutover.

## Recommended Data Model

Use PostgreSQL as a normalized event-plus-snapshot store.

### 1. `dashboard_state_snapshot`

Purpose:

- hold the latest materialized state for fast API reads

Suggested columns:

- `snapshot_id` UUID primary key
- `captured_at` timestamptz not null
- `state_json` jsonb not null
- `source` text not null default `gateway`

Notes:

- This mirrors current SQLite behavior.
- The API can continue serving one current state quickly.
- It gives a low-risk first step before deeper query refactors.

### 2. `collector_run`

Purpose:

- record every collector attempt

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
- `meta_json` jsonb not null default `'{}'::jsonb`

Why:

- This is the backbone for telling whether the datalink path failed.
- It keeps collector health separate from asset health.

### 3. `section_health_history`

Purpose:

- preserve health transitions for each dashboard section

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

- It preserves what the datalink status actually was over time.
- It avoids losing previous errors when the current state is overwritten.

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
- `last_metric_at` timestamptz null
- `last_status_change_at` timestamptz null
- `state_json` jsonb not null
- `updated_at` timestamptz not null

Why:

- Allows the dashboard to query latest asset state directly.
- `status_origin` prevents mixing source failure with asset-down status.

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
- Supports later retention policies and rollups.

### 6. `asset_status_history`

Purpose:

- record actual asset health transitions

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
- `collector_missing` or `source_stale` means monitoring path trouble, not node trouble.

This is the main table that prevents false outage narratives.

### 7. `gateway_ingest_event`

Purpose:

- tell whether the API/gateway accepted or rejected collector posts

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

Why:

- This isolates gateway/API failures from collector failures.

## Failure Provenance Model

The dashboard and storage should clearly separate these cases:

### Case 1. Collector/Datalink Failure

Meaning:

- collector could not reach portal/API
- login/session failed
- selector parse failed
- timeout happened before valid payload

How to store:

- `collector_run.status = failed`
- `collector_run.failure_domain = ...`
- `section_health_history.status = error` or `stale`
- no `asset_status_history` entry claiming the node is down unless the source explicitly said so

Operator meaning:

- show last synced asset data
- show datalink/source issue
- do not mark nodes as actually down only because the collector failed

### Case 2. Gateway/API Failure

Meaning:

- collector may have succeeded locally, but API/update ingest failed

How to store:

- `gateway_ingest_event.ingest_status = db_failed | rejected | parse_failed`
- optionally keep collector run as `partial` or `failed` with `failure_domain = gateway_ingest`

Operator meaning:

- data path failed after collection
- not the same as source portal being down
- not the same as node outage

### Case 3. Actual Node/Asset Down

Meaning:

- Nutanix, SolarWinds, or another source explicitly reported down/offline/critical

How to store:

- `asset_status_history.status = down | critical | offline`
- `status_reason_type = asset_observed`
- `truth_source = nutanix | solarwinds | ...`

Operator meaning:

- this is a real infrastructure condition
- it must remain visually distinct from collector/path errors

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
- every past health transition
- every intermediate state that was overwritten in-place

Therefore:

- first migration should import current SQLite state as baseline
- historical event fidelity starts fully only after Postgres event tables go live

### Recommended Backfill Labels

Imported legacy rows should be marked:

- `quality = derived`
- `status_reason_type = derived_threshold` or `asset_observed` only when the source is explicit
- `meta_json.import_origin = 'sqlite_baseline_2026_07_14'`

## Migration Phases

### Phase 1. Introduce PostgreSQL Connectivity

Tasks:

- add PostgreSQL connection config to `api-gateway`
- keep SQLite as primary runtime until verified
- add health check for Postgres connectivity

Success criteria:

- gateway can connect to Postgres
- no production traffic served from Postgres yet

### Phase 2. Create Schema

Tasks:

- add SQL migration files
- create core tables listed above
- add indexes:
  - `asset_telemetry_history(asset_id, collected_at desc)`
  - `asset_status_history(asset_id, started_at desc)`
  - `collector_run(section_key, started_at desc)`
  - `section_health_history(section_key, recorded_at desc)`
  - `gateway_ingest_event(collector_source, received_at desc)`

Success criteria:

- schema reproducible in dev and prod
- empty database passes startup checks

### Phase 3. Baseline Import from SQLite

Tasks:

- write one importer for current SQLite snapshot
- import:
  - current dashboard snapshot
  - current asset state
  - available history arrays as baseline telemetry points
  - current section/source health

Success criteria:

- Postgres holds an equivalent current state to SQLite
- imported timestamps match source snapshot where available

### Phase 4. Dual-Write in Gateway

Tasks:

- gateway continues reading from SQLite
- gateway writes new successful updates to:
  - SQLite
  - Postgres
- gateway also writes collector run / section health / ingest events to Postgres

Success criteria:

- no user-visible change
- PostgreSQL data grows correctly over real traffic

### Phase 5. Read Verification

Tasks:

- add internal compare tool:
  - SQLite current state vs Postgres materialized current state
- verify:
  - server counts
  - network counts
  - HSD totals
  - section statuses
  - source statuses
  - last synced timestamps

Success criteria:

- repeated matches over multiple hours and at least one failure/recovery cycle

### Phase 6. Switch API Reads to PostgreSQL

Tasks:

- serve `/api/status` from Postgres-backed current snapshot/materialized state
- keep SQLite dual-write for rollback window

Success criteria:

- dashboard behavior unchanged
- no stale or mismapped values introduced

### Phase 7. Decommission SQLite

Tasks:

- only after stable burn-in
- archive SQLite file
- remove SQLite write path

Success criteria:

- PostgreSQL is sole system of record
- rollback window intentionally closed

## Gateway Changes Required Later

These are implementation tasks for the later migration phase:

1. Replace `better-sqlite3` state persistence with a repository layer.
2. Split:
   - current snapshot writes
   - historical event writes
   - health derivation writes
3. Persist every collector attempt, not only successful final state.
4. Persist ingest outcome separately from collector outcome.
5. Persist actual asset status transitions separately from source health transitions.

## Collector Changes Required Later

Collectors should eventually provide a clearer run contract:

- collector source
- section key
- attempted timestamp
- finished timestamp
- success/partial/failure
- reason domain on failure
- payload row count where meaningful

This does not need a UI change first.

## Suggested Implementation Order

1. Add repository abstraction in `api-gateway`.
2. Create PostgreSQL schema and migrations.
3. Build SQLite-to-Postgres baseline importer.
4. Add dual-write.
5. Add compare script for current-state parity.
6. Run parity verification over live traffic.
7. Flip reads to Postgres.
8. Keep SQLite rollback window for a fixed period.

## Verification Checklist

Before cutover:

- current dashboard values match between SQLite and Postgres
- section `lastAttemptAt` and `lastSuccessAt` match
- source-level status derivation matches
- Nutanix fallback-to-SolarWinds logic still behaves correctly
- HSD last synced values remain available during collector failure
- network and server histories remain queryable

During failure testing:

- collector failure shows as source/section issue only
- gateway ingest failure is recorded distinctly
- real asset down status remains distinguishable
- stale data is still served with last synced timestamp

## Rollback Plan

If PostgreSQL read path misbehaves:

- switch API reads back to SQLite
- keep PostgreSQL data for diagnosis
- do not discard imported or dual-written data

If PostgreSQL writes fail during dual-write:

- keep SQLite as source of truth
- mark PostgreSQL path degraded
- investigate before re-enabling parity checks

## Bottom Line

The PostgreSQL migration should not be treated as a simple database engine swap.

It should be used to formalize three separate truths:

- what the infrastructure actually reported
- what each collector managed to collect
- what the gateway successfully ingested and served

That separation is the key requirement for preserving historical data honestly and for clearly telling whether:

- the datalink failed
- the collector failed
- the API failed
- or the nodes were actually down
