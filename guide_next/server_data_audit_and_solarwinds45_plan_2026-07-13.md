# Server Data Audit And SolarWinds 45 Plan

Date: 2026-07-13

## Objective

Exhaustively verify that current dashboard server data is collected, merged, stored, and displayed correctly, then harden the SolarWinds `10.36.91.45` path for server data with this rule:

- If a server exists in both Nutanix and SolarWinds, Nutanix is the source of truth.

## Current Runtime State Confirmed

Validated against live runtime on 2026-07-13:

- PM2 processes online:
  - `api-gateway`
  - `nutanix-collector`
  - `solarwinds-collector`
  - `symphony-collector`
  - `dashboard-ui`
- API responded `200` from `http://localhost:4000/api/status`
- Storage is already real SQLite:
  - active DB: `api-gateway/data/itdash.db`
  - legacy JSON still present: `api-gateway/data/db.json`

## Source Inventory

### Nutanix

Collector:

- `collectors/nutanix/src/index.ts`

Produces:

- cluster metrics
  - `uptime`
  - `nodesCount`
  - `storageUsage`
  - `cpuUsage`
  - `memoryUsage`
  - `physicalMemoryUsage`
  - `logicalMemoryUsage`
  - `storageUsedTib`
  - `storageCapacityTib`
  - `memoryUsedGib`
  - `memoryCapacityGib`
- VM metrics
  - `name`
  - `diskUsage`
  - `backupStatus`
  - `cpu`
  - `memory`
  - `status`

### SolarWinds `.45` Servers

Collector:

- `collectors/solarwinds/src/index.ts`

Current runtime entrypoint:

- `http://10.36.91.45/Orion/SummaryView.aspx?ViewID=1`

Currently scraped:

- summary ranked widgets only
  - top memory table
  - top CPU table

Live portal inspection confirmed all 16 server nodes are present on `.45` and expose node-detail pages with richer fields plus perf metrics.

### Dashboard Server Inventory

Default inventory is defined in:

- `api-gateway/src/db.ts`

Current server count:

- `16`

## Overlap Inventory Confirmed

From live persisted state on 2026-07-13:

### Nutanix-backed servers currently present

- `HIL-HIDDOR-AV01.abgplanet.abg.com`
- `HILHIDDORDT0320.abgplanet.abg.com`
- `HIL-HIDDOR-FS01.abgplanet.abg.com`
- `HILHIDDORILMSAP`
- `HILHIDDORILMSDB`
- `HIL-HIDDOR-US01.abgplanet.abg.com`
- `HIL-HIDDOR-US02.abgplanet.abg.com`
- `HIL-HIDDOR-US03.abgplanet.abg.com`
- `HIL-HIDDOR-US04.abgplanet.abg.com`
- `HIL-HIDDOR-US05.abgplanet.abg.com`
- `HIL-HIDDOR-US06.abgplanet.abg.com`

Count:

- `11`

### SolarWinds-only servers currently present

- `HIL-HIDDOR-BK01.abgplanet.abg.com`
- `HIL-HIDDOR-CSCTS1.abgplanet.abg.com`
- `HIL-HIDDOR-CSCTS2.abgplanet.abg.com`
- `HIL-HIDDOR-PIMW.abgplanet.abg.com`
- `HIL-HIDDOR-PSDM.abgplanet.abg.com`

Count:

- `5`

## End-To-End Mapping Audit

### 1. Collector -> Gateway

#### Nutanix path

File:

- `api-gateway/src/db.ts`

Function:

- `updateNutanix()`

Current mapping:

- Nutanix cluster payload updates `state.nutanix`
- Nutanix VM payload updates matching `state.servers` entries:
  - `disk`
  - `backupStatus`
  - `cpu`
  - `memory`
  - `status`
  - `history`

#### SolarWinds path

File:

- `api-gateway/src/db.ts`

Function:

- `updateSolarWinds()`

Current mapping:

- SolarWinds network payload updates `state.networks`
- SolarWinds server payload updates matching `state.servers` entries:
  - `cpu`
  - `memory`
  - `status`
  - `history`

### 2. Gateway -> Storage

File:

- `api-gateway/src/db.ts`

Storage behavior:

- all state is normalized and persisted into SQLite table `app_state`
- health metadata is stored per section:
  - `lastAttemptAt`
  - `lastSuccessAt`
  - `lastError`
- runtime state is exposed via:
  - REST `GET /api/status`
  - WebSocket `FULL_STATE` and `METRIC_UPDATE`

### 3. Storage -> Dashboard

File:

- `dashboard/src/app/page.tsx`

Current server display usage:

- server CPU from `server.cpu`
- server memory from `server.memory`
- server disk from `server.disk`
- server backup chip from `server.backupStatus`
- server tone from `server.status`, `cpu`, `memory`, `disk`, `backupStatus`
- server trend sparkline from `server.history`

Current grouping logic:

- Windows if name ends with `.abgplanet.abg.com`
- Linux otherwise
- HCI VM if `disk !== null` or `backupStatus !== 'N/A'`
- On Prem otherwise

## Confirmed Findings

### Finding 1: Overlap precedence is wrong

Severity:

- high

Confirmed behavior:

- `updateNutanix()` writes overlapping VM fields first
- `updateSolarWinds()` later also writes `cpu`, `memory`, and `status`
- overlapping servers can therefore be overwritten by SolarWinds after Nutanix

Impact:

- violates the required source-of-truth rule
- dashboard may show SolarWinds values for Nutanix-backed servers

### Finding 2: SolarWinds `.45` server coverage is incomplete

Severity:

- high

Confirmed behavior:

- current scrape only reads top CPU and top memory ranked tables
- this leaves some servers with partial or no telemetry in normal operation

Observed live examples from current state:

- `BK01` had `cpu: null`, `memory: null`
- `PIMW` had CPU only
- `PSDM` had memory only

Impact:

- SolarWinds-only servers are underrepresented
- server card can show incomplete or misleading absence of telemetry even when `.45` has richer data

### Finding 3: HCI / On Prem grouping is inference-based, not state-driven

Severity:

- medium

Current logic:

- `disk !== null || backupStatus !== 'N/A'` implies `HCI VM`

Impact:

- currently works as a proxy, but it is still indirect
- grouping should ideally follow an explicit source/platform marker derived from collection

### Finding 4: Health and last-sync behavior is structurally correct

Severity:

- medium positive finding

Confirmed behavior:

- section attempt/success/error timestamps are persisted
- stale/error/ok state is derived from timestamps and error presence
- dashboard cards already consume `lastSuccessAt` and compact error summaries

This matches the rule that failed collection should show last synced data with last synced time.

### Finding 5: SQLite migration is already complete

Severity:

- resolved

Confirmed behavior:

- gateway uses `better-sqlite3`
- active runtime file is `api-gateway/data/itdash.db`
- code can migrate legacy JSON into SQLite when needed

## SolarWinds `.45` Live Detail Findings

Validated from the live portal using the saved authenticated storage state:

- Summary page exposes node links for all 16 server nodes.
- Confirmed node IDs:
  - `BK01 -> N:1028`
  - `CSCTS1 -> N:311`
  - `CSCTS2 -> N:319`
  - `PIMW -> N:221`
  - `PSDM -> N:568`
- Node detail pages expose stable detail data through:
  - `POST /Orion/Services/AsyncResources.asmx/GetNodeDetails`
  - `POST /Orion/Services/AsyncResources.asmx/GetAvailabilityStats`
  - `GET /api2/perfstack/metrics/...Orion.CPUMultiLoad.AvgLoad`
  - `GET /api2/perfstack/metrics/...Orion.CPULoad.AvgPercentMemoryUsed`

`GetNodeDetails` returns structured fields such as:

- node status text
- polling IP
- machine type
- system name
- description
- last boot
- hardware type
- CPU count
- category

Perfstack metric endpoints return structured measurement series and statistics for:

- CPU load
- memory used percent

This is materially better than scraping ranked summary tables.

## What “Formalize The SolarWinds Debug Scripts” Means

There was earlier clarity requested on whether to formalize the SolarWinds debug scripts.

In practical terms, formalizing them means:

- keep the debug scripts as tracked source files
- name them clearly as operator/developer investigation tools
- ensure runtime collector code does not depend on them
- use them only for discovery and troubleshooting
- document what each script is for and when to run it

In this repo, that is already partially true because files such as these are tracked:

- `collectors/solarwinds/src/debug_net.ts`
- `collectors/solarwinds/src/debug_net_api.ts`
- `collectors/solarwinds/src/debug_page_source.ts`
- `collectors/solarwinds/src/debug_status.ts`
- `collectors/solarwinds/src/debug_widget_content.ts`

Recommended direction:

- keep them, but treat them as tooling, not runtime logic

## Implementation Sequence

### Phase 1: Correct source precedence

1. Mark Nutanix-backed servers explicitly in gateway state.
2. Prevent SolarWinds from overwriting `cpu`, `memory`, or `status` for Nutanix-backed servers.
3. Keep SolarWinds updates active for SolarWinds-only servers.

### Phase 2: Replace summary-only `.45` server scraping

1. Use `.45` summary page only to confirm authentication and discover server node IDs.
2. Build a stable node inventory from `NodeDetails.aspx?NetObject=N:<id>` links.
3. For each server node, fetch:
   - structured node details
   - availability
   - latest CPU value from perfstack
   - latest memory value from perfstack
4. Map these into the gateway cleanly.

### Phase 3: Make dashboard grouping state-driven

1. Stop relying only on `disk` / `backupStatus` inference for HCI detection.
2. Prefer explicit source/platform markers from stored server state.
3. Keep existing visual behavior, but make the classification honest.

### Phase 4: Validate end to end

1. Confirm overlapping servers retain Nutanix values after SolarWinds cycles.
2. Confirm SolarWinds-only servers receive real `.45` CPU/memory/status values.
3. Confirm last-sync and error banners remain concise and accurate.

## Validation Commands

### Build

```powershell
npm run build --workspace api-gateway
npm run build --workspace collectors/solarwinds
npm run build --workspace dashboard
```

### Runtime

```powershell
pm2 restart api-gateway
pm2 restart solarwinds-collector
pm2 restart nutanix-collector
pm2 show api-gateway
pm2 show solarwinds-collector
pm2 show nutanix-collector
```

### API verification

```powershell
Invoke-WebRequest http://localhost:4000/api/status -UseBasicParsing
```

### SQLite verification

```powershell
@'
const Database = require('better-sqlite3');
const db = new Database('api-gateway/data/itdash.db', { readonly: true });
const row = db.prepare("SELECT state_json FROM app_state WHERE state_key = ?").get('dashboard_state');
console.log(row ? 'STATE_PRESENT' : 'NO_STATE');
'@ | node -
```

### Overlap verification

Check that these remain Nutanix-sourced after SolarWinds cycles:

- `AV01`
- `DT0320`
- `FS01`
- `ILMSAP`
- `ILMSDB`
- `US01` to `US06`

Check that these are SolarWinds-sourced and fully populated:

- `BK01`
- `CSCTS1`
- `CSCTS2`
- `PIMW`
- `PSDM`

## Expected Outcome After This Pass

- Nutanix becomes the enforced source of truth for overlapping servers.
- SolarWinds `.45` becomes the authoritative source for SolarWinds-only servers.
- Server display data is backed by stable structured `.45` endpoints instead of incomplete summary widgets.
- Dashboard health text remains concise while keeping last successful sync visible.
