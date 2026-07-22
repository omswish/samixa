# PostgreSQL Metric And History Strategy

Date: 2026-07-22  
Project: Utkal IT Dashboard  
Branch: `dev-omkars`

## Decision

PostgreSQL should be used for both:

- current operational metric/state data used by live dashboard cards
- historical metric/state data used by trend graphs, sparklines, audits, and reporting

SQLite/local JSON should remain only for one of these limited roles:

- standalone fallback mode for small/offline deployments
- temporary bootstrap store before PostgreSQL is available
- emergency local cache, not the long-term system of record

## Why This Is The Right Direction

The current dashboard already needs more than a simple settings database. It needs:

- reliable current values
- historical trend points for graphs and sparklines
- state change history for availability and outage analysis
- provenance showing which collector/source produced a metric
- auditability for ISMS and operational review

PostgreSQL fits this better than local JSON or SQLite because it gives:

- better concurrency and consistency
- stronger backup and restore options
- centralized retention control
- cleaner audit support
- easier future reporting and API queries

## What The Current Codebase Already Has

The PostgreSQL schema already includes the main building blocks:

- `dashboard_state_current`
- `dashboard_state_snapshot`
- `collector_run`
- `gateway_ingest_event`
- `asset_current_state`
- `asset_telemetry_history`
- `asset_status_history`

These are defined in:

- [001_postgres_init.sql](C:/Users/omkar.s/Code/samixa/api-gateway/sql/001_postgres_init.sql)
- [002_postgres_normalized_runtime.sql](C:/Users/omkar.s/Code/samixa/api-gateway/sql/002_postgres_normalized_runtime.sql)
- [003_postgres_asset_status_history.sql](C:/Users/omkar.s/Code/samixa/api-gateway/sql/003_postgres_asset_status_history.sql)

The gateway also already mirrors runtime data into PostgreSQL from:

- [api-gateway/src/index.ts](C:/Users/omkar.s/Code/samixa/api-gateway/src/index.ts)
- [api-gateway/src/postgres.ts](C:/Users/omkar.s/Code/samixa/api-gateway/src/postgres.ts)

## Intended Data Model

### 1. Current State

Use `asset_current_state` for the latest authoritative state of each monitored asset.

This should back live cards such as:

- HCI
- servers
- network interfaces
- future service-level infrastructure summaries

Important fields already present:

- `status`
- `status_origin`
- `truth_source`
- `fallback_source`
- `last_metric_at`
- `last_status_change_at`
- `last_synced_at`
- `state_json`

This is the right place to keep one authoritative row per asset.

### 2. Historical Metrics

Use `asset_telemetry_history` for raw time-series points.

This should back:

- sparklines
- trend charts
- daily average utilization
- peak/average comparisons
- later capacity reports

Important fields already present:

- `asset_id`
- `metric_name`
- `metric_value_numeric`
- `metric_value_text`
- `unit`
- `collected_at`
- `truth_source`
- `quality`

This is the right place to store observed values over time.

### 3. Historical Status

Use `asset_status_history` for state transitions such as:

- normal
- warning
- critical
- offline

This should support:

- outage duration
- status timelines
- availability analysis
- post-incident review

## Source-Of-Truth Handling

The database model should preserve not just the metric value, but also where it came from.

Required approach:

- `truth_source` must identify the authoritative source that supplied the metric
- `fallback_source` must identify when the displayed state came from a fallback path
- `quality` should distinguish observed data from fallback or degraded data
- dashboard cards should continue to show last synced time when a live collector fails

For overlapping server data, the documented operating rule should remain:

- Nutanix is source of truth when available
- SolarWinds may be used only as controlled fallback when Nutanix is unavailable long enough to trigger fallback policy
- when Nutanix recovers, the system should revert to Nutanix as source of truth

## How Graphs Should Use PostgreSQL

The dashboard should move toward this read pattern:

1. Live cards read current values from `asset_current_state`
2. Sparklines and trend charts read history from `asset_telemetry_history`
3. Availability/status visuals read from `asset_status_history`
4. Broad section-level snapshots can still use `dashboard_state_snapshot` where useful for forensic playback

This is cleaner than graphing from ad hoc JSON snapshots because:

- the metric names are normalized
- the timestamps are queryable
- provenance is retained
- retention can be managed properly

## Retention And Rollup Plan

To keep PostgreSQL practical, do not retain infinite raw points.

Recommended approach:

- raw metric points: keep 30 to 90 days
- hourly rollups: keep 12 to 18 months
- daily rollups: keep 3 to 5 years if needed for reporting

Recommended rollup metrics per interval:

- minimum
- maximum
- average
- sample count
- latest value

Recommended operational behavior:

- live charts use raw data for recent windows
- longer date ranges use hourly or daily rollups
- purge or archive raw data after its retention window

## ISMS Benefit

Using PostgreSQL for metric and history data helps ISMS in these ways:

- clearer audit trail of what the dashboard showed and when
- better incident reconstruction
- controlled retention and backup policy
- easier separation of duties
- improved integrity checks and reporting

But this only materially helps if PostgreSQL becomes the real system of record, not just a best-effort mirror.

## Important Gaps Before This Is Complete

The codebase is not fully at the target model yet.

Current gaps:

- PostgreSQL is still optional/mirrored, not primary
- dashboard graph queries are not yet fully PostgreSQL-backed
- TLS validation for PostgreSQL must be fixed before relying on it for security-sensitive storage
- no formal retention/rollup jobs are implemented yet
- local/bootstrap secrets still create ISMS issues outside the metric store itself

## Recommended Implementation Order

### Phase 1

- declare PostgreSQL the primary persistence layer for current and historical metrics
- keep local mode only as fallback/standalone mode
- ensure every collector write updates `asset_current_state` and `asset_telemetry_history`
- ensure status transitions update `asset_status_history`

### Phase 2

- make dashboard graph endpoints read from PostgreSQL
- define normalized metric names per asset type
- validate source provenance for every metric path

### Phase 3

- add hourly and daily rollup tables or materialized views
- implement purge/archival jobs
- add retention settings to operational documentation

### Phase 4

- use PostgreSQL-backed data for reporting and future audit views
- align backup, restore, and access control with ISMS policy

## Recommended Project Decision

Proceed with PostgreSQL not only for auth/config/audit, but also for live metric state and historical metric history.

That is the most coherent architecture for:

- dashboard reliability
- graphing
- fallback provenance
- long-term auditability
- corporate ISMS readiness

## Current Implementation Status

The first implementation slice is now in place in code:

- the gateway can hydrate runtime dashboard state from PostgreSQL on startup
- collector ingest can synchronously persist dashboard state to PostgreSQL before completing the update path
- SQLite/local state remains as fallback cache
- an authenticated telemetry history API path now exists for future graph migration

Current runtime flag:

- `POSTGRES_PRIMARY_METRICS=true`

This flag should be treated as an incremental mode switch, not the end-state migration. Graph rendering still needs to be moved from embedded local history arrays to PostgreSQL-backed history queries.
