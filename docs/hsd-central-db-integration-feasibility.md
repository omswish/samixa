# HSD / Symphony Central DB Integration Feasibility

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-HSD-CENTRAL-DB-001 |
| Status | Feasibility approach |
| Scope | Symphony/SummitAI/Apex HSD data path, AMS/proxy collection, central DB read feasibility, risk controls, implementation plan |
| Date | 2026-11-07 |
| Related plan | `central-multi-unit-rbac-architecture.md` |

## 1. Executive Decision

The central Symphony/HSD database is a plausible and strategically better data source than browser scraping, provided access is implemented through an approved read contract.

Recommended order:

1. Use official Symphony/SummitAI APIs where they expose the required incident, SR, CMDB, asset, discovery, SLA, and MTTR data.
2. If APIs are incomplete, use vendor/DBA-owned read-only SQL views or stored procedures against a reporting replica of the central HSD/Apex database.
3. Use browser report scraping only as a fallback for metrics not available through API or approved DB views.
4. Do not query undocumented production base tables directly from the dashboard application.

The reason is simple: the central HSD portal is already reading from the central application data store. If the organization can expose a stable, read-only, least-privilege reporting surface over that store, the dashboard can avoid headless browser fragility and get faster, cleaner multi-unit data.

## 2. What The Symphony Documentation Shows

Public SymphonyAI/SummitAI/Apex documentation supports the following data path:

```text
unit / client network
  -> AMS / Summit / Apex proxy agent
  -> Data Collector service in customer domain
  -> central Apex / HSD database
  -> SummitAI / Apex application modules
  -> HSD portal, dashboards, reports, APIs
```

Important documented behaviors:

| Area | Finding | Implication for this application |
| --- | --- | --- |
| Proxy and Data Collector | The Apex Proxy Agent configures both Data Collector and Proxy Agent. Data communication between Proxy Agent and Apex database occurs through the Data Collector. | Unit AMS/proxy servers are upstream collection points, not the final source of truth for central dashboard metrics. |
| Multiple proxies | Multiple Proxy Agents can communicate with the central Apex Server through the Data Collector. | A multi-unit deployment can map units by proxy, tenant, department, location, workgroup, scan name, or asset ownership metadata. |
| Data Collector DB config | Data Collector setup includes Apex database server, database name, username, and password details. | There is an actual central database endpoint, likely SQL Server, behind the central portal. DB access is technically possible if approved. |
| Discovery | Discovery can identify servers, networks, links, printers, and laptops using WMI, SNMP, SSH, Telnet, Nmap, and agent modes. Discovered devices are saved in respective modules. | HSD/Apex may already have server/network/asset inventory that can complement SolarWinds node mapping. |
| Discovery dashboard | Discovery dashboard allows filtering by tenant, proxy, and date range, and exposes device lists with hardware, software, error, and other details. | Tenant/proxy/date fields are strong candidates for unit attribution and freshness validation. |
| Reports | Discovered Asset Details Report includes tenant/department, scan type, scan name, IP address, and other fields. It can show query/table/export options in the reporting UI. | A reporting data model likely exists; approved views may be easier and safer than reverse-engineering UI pages. |
| APIs | Asset Management and CMDB APIs exist, including asset retrieval by asset ID or custom fields. | Some data may already be accessible through passwordless/API-key patterns, reducing the need for DB access. |

Source references reviewed:

- SymphonyAI SummitAI Proxy Setup: `https://help.symphonysummitai.com/summit-platform/docs/proxy-setup`
- SymphonyAI Apex Discovery: `https://help.symphonysummitai.com/apex/docs/discovery`
- SymphonyAI Apex Discovery Dashboard: `https://help.symphonysummitai.com/apex/docs/discovery-dashboard`
- SymphonyAI Apex Discovered Asset Details Report: `https://help.symphonysummitai.com/apex/docs/discovered-asset-details-report`
- SymphonyAI Apex Asset Management APIs: `https://help.symphonysummitai.com/apex/docs/asset-management-apis`
- SymphonyAI Apex Get Asset Details API: `https://help.symphonysummitai.com/apex/docs/get-asset-details-by-asset-id-or-custom-fields`
- SymphonyAI Apex CMDB APIs: `https://help.symphonysummitai.com/apex/docs/cmdb-apis`

## 3. Proposed Integration Model

### 3.1 Safe Target Architecture

```text
unit AMS/proxy servers
  -> central HSD/Apex Data Collector
  -> central HSD/Apex production DB
  -> read replica or reporting schema
  -> approved read-only views/stored procedures
  -> samixa HSD DB collector
  -> samixa PostgreSQL normalized snapshots
  -> unit dashboard and cluster dashboard
```

The dashboard application should not become a second HSD application. It should read only the small operational summary required for dashboards:

- current incident counts by unit/workgroup/status/priority
- current SR counts by unit/workgroup/status/priority
- SLA response/resolution breached/about-to-breach counts
- MTTR/aging buckets
- discovery/asset counts and freshness by unit/proxy/scan
- proxy/data collector health where available
- minimum asset identity required for dashboard correlation

Do not persist full ticket descriptions, caller names, customer names, free-text symptoms, email IDs, or full asset user allocation history unless there is a separate approved requirement.

### 3.2 Database Access Pattern

Use this hierarchy:

| Option | Recommendation | Notes |
| --- | --- | --- |
| Reporting replica + read-only views | Preferred | Best balance of speed, safety, and upgrade control. |
| Production DB + read-only views | Acceptable only with DBA approval | Must enforce query timeout, no locks, no ad-hoc exploration by app runtime. |
| Production base tables | Not recommended | High vendor support and schema-change risk. |
| Direct access to Data Collector DB credentials | Not recommended | Those credentials belong to the HSD/Data Collector application, not to this dashboard. |
| API key endpoints | Preferred where complete | Best supportability if endpoint coverage is enough. |

The central dashboard should receive its own identity:

```text
login: samixa_hsd_ro
access: read-only
network: central app server only
surface: views/stored procedures only
timeout: short query timeout
write: none
ddl: none
base tables: denied unless explicitly approved
```

## 4. Unit Attribution Model

Direct DB access is useful only if every row can be attributed to a unit safely.

Candidate attribution keys:

| HSD/Apex field family | Unit mapping use |
| --- | --- |
| Workgroup | Primary mapping for incidents and SRs. |
| Tenant / department | Strong mapping for asset/discovery data if each unit is modeled separately. |
| Proxy host / proxy ID | Strong mapping where each unit has its own AMS/proxy server. |
| Location / store / site | Useful secondary mapping, but names can drift. |
| Scan name / discovery job name | Useful for discovery reports and onboarding validation. |
| IP subnet | Useful fallback, but risky for shared networks or routing overlap. |
| CI / asset custom fields | Useful if unit code is stored as an asset attribute. |

Recommended unit mapping precedence:

1. explicit dashboard unit mapping table maintained by platform admin
2. HSD workgroup to `unit_id`
3. HSD tenant/department to `unit_id`
4. proxy host/proxy ID to `unit_id`
5. location/site code to `unit_id`
6. IP subnet only as validation or exception handling

Any row that cannot be mapped confidently must go to quarantine, not a dashboard.

## 5. Proposed Vendor/DBA Read Contract

Request these read objects from the HSD/Symphony DBA/vendor team.

### 5.1 Incident View

Suggested object:

```text
vw_samixa_incident_summary
```

Minimum fields:

| Field | Purpose |
| --- | --- |
| `snapshot_time` | Source timestamp or query timestamp |
| `tenant_name` / `department_name` | Unit attribution |
| `workgroup_id` | Unit attribution |
| `workgroup_name` | Display and validation |
| `status` | New/Assigned/In Progress/Pending/Resolved/Closed |
| `priority` | P1/P2/P3/etc. |
| `incident_count` | Aggregate count |
| `sla_response_breached_count` | SLA risk |
| `sla_resolution_breached_count` | SLA risk |
| `about_to_miss_count` | SLA risk |
| `oldest_open_minutes` | Aging |
| `avg_age_minutes` | Aging |

### 5.2 Service Request View

Suggested object:

```text
vw_samixa_sr_summary
```

Minimum fields:

| Field | Purpose |
| --- | --- |
| `snapshot_time` | Freshness |
| `tenant_name` / `department_name` | Unit attribution |
| `workgroup_id` | Unit attribution |
| `workgroup_name` | Display and validation |
| `status` | SR state |
| `priority` | Priority |
| `sr_count` | Aggregate count |
| `sla_response_breached_count` | SLA risk |
| `sla_resolution_breached_count` | SLA risk |
| `avg_age_minutes` | Aging |

### 5.3 MTTR View

Suggested object:

```text
vw_samixa_mttr_summary
```

Minimum fields:

| Field | Purpose |
| --- | --- |
| `snapshot_time` | Freshness |
| `module` | Incident or SR |
| `tenant_name` / `department_name` | Unit attribution |
| `workgroup_id` | Unit attribution |
| `workgroup_name` | Display and validation |
| `priority` | P1/P2/etc. |
| `period_start` / `period_end` | Time bucket |
| `ticket_count` | Sample size |
| `avg_response_minutes` | MTTR/OLA |
| `avg_resolution_minutes` | MTTR |
| `p95_resolution_minutes` | Tail behavior |
| `breached_count` | SLA summary |

### 5.4 Discovery / Asset View

Suggested object:

```text
vw_samixa_discovery_asset_summary
```

Minimum fields:

| Field | Purpose |
| --- | --- |
| `snapshot_time` | Freshness |
| `tenant_name` / `department_name` | Unit attribution |
| `proxy_id` / `proxy_host` | Unit attribution and collector health |
| `scan_name` | Discovery job identity |
| `scan_type` | Discovery mode |
| `device_type` | Server/network/laptop/printer/etc. |
| `os_type` | Windows/Linux/network/etc. |
| `reachable_count` | Availability |
| `unreachable_count` | Discovery exception |
| `hardware_variance_count` | Asset variance |
| `software_variance_count` | Compliance |
| `last_contact_time` | Freshness |

### 5.5 Proxy Health View

Suggested object:

```text
vw_samixa_proxy_health
```

Minimum fields:

| Field | Purpose |
| --- | --- |
| `snapshot_time` | Freshness |
| `proxy_id` | Stable source key |
| `proxy_host` | Display |
| `tenant_name` / `department_name` | Unit attribution |
| `status` | Active/down/error |
| `last_communication_time` | Freshness |
| `last_error` | Troubleshooting |

## 6. Application Architecture Change

Add a fourth HSD integration mode:

```text
hsd_collection_mode:
  - browser_dashboard
  - browser_reports
  - api_key
  - central_db
```

Central DB mode changes the HSD collector from browser automation to scheduled SQL reads:

```text
SQL Server / reporting replica
  -> hsd-db-collector
  -> normalize and map unit/workgroup/proxy
  -> quarantine unmapped rows
  -> PostgreSQL hsd_metric_snapshot
  -> dashboard APIs
```

The application still keeps its own PostgreSQL store. Do not render dashboards directly from the HSD DB. The HSD DB is a source; Samixa PostgreSQL remains the normalized operational dashboard store.

Recommended new configuration objects:

| Object | Purpose |
| --- | --- |
| `hsd_db_source` | Server, database, auth mode, encryption, connection policy, enabled state |
| `hsd_db_query_contract` | Versioned list of approved views/stored procedures and expected columns |
| `hsd_unit_mapping_rule` | Workgroup/tenant/proxy/location to unit mapping |
| `hsd_db_collection_policy` | Per-view polling interval and freshness threshold |
| `hsd_db_collection_run` | Run status, duration, row counts, failure reason |
| `hsd_metric_snapshot` | Normalized unit-scoped aggregates |
| `hsd_unmapped_source_row` | Quarantine summary for rows that cannot be mapped |

## 7. Polling Guidance

If the read contract is aggregate views over a replica:

| Data stream | Proposed polling |
| --- | --- |
| Incident current summary | 30 seconds |
| Incident SLA/about-to-miss summary | 30-60 seconds |
| SR current summary | 2-5 minutes |
| SR MTTR summary | 5-15 minutes |
| Asset/discovery summary | 15-60 minutes |
| Proxy health | 1-5 minutes |
| Workgroup/tenant/proxy catalog | 15-60 minutes |

30-second dashboard refresh is feasible in this model because the dashboard reads Samixa PostgreSQL snapshots, not the HSD database live on every browser refresh.

30-second HSD DB polling is feasible only if:

- queries hit small aggregate views or stored procedures
- queries run on a reporting replica or approved low-impact schema
- the HSD DBA confirms no blocking/locking risk
- query timeouts and row-count limits are enforced
- the collector stores snapshots locally and only sends deltas/aggregates

## 8. Validation Plan

### Step 1: Confirm Product Version And Ownership

Ask HSD/Symphony administrators:

| Question | Required answer |
| --- | --- |
| Is HSD running SummitAI classic, Apex, or a customized hybrid? | Determines docs/API/schema match. |
| Is central DB SQL Server? | Docs indicate SQL Server-style connectivity, but environment must confirm. |
| Is there a reporting replica? | Strongly preferred. |
| Who owns schema/view changes? | HSD DBA/vendor team. |
| Are direct reporting views supported by vendor? | Determines supportability. |

### Step 2: Read-Only Schema Discovery

Using DBA-provided read-only credentials in staging or reporting DB only:

```sql
SELECT DB_NAME() AS database_name;
SELECT name, type_desc
FROM sys.objects
WHERE type IN ('U', 'V', 'P')
ORDER BY type_desc, name;
```

Then search only metadata for candidate objects:

```sql
SELECT name, type_desc
FROM sys.objects
WHERE name LIKE '%Incident%'
   OR name LIKE '%SR%'
   OR name LIKE '%ServiceRequest%'
   OR name LIKE '%Workgroup%'
   OR name LIKE '%Discovery%'
   OR name LIKE '%Asset%'
   OR name LIKE '%Proxy%'
ORDER BY name;
```

Do not run wide table scans during discovery.

### Step 3: Compare Against HSD Portal

For 3-5 pilot units:

| Metric | Compare source |
| --- | --- |
| Open incident count by status | HSD dashboard/report |
| P1/P2 incidents | HSD dashboard/report |
| SR open count by status | HSD dashboard/report |
| Incident SLA breached/about-to-miss | HSD report |
| SR SLA/MTTR | MTTR report |
| Workgroup list | HSD workgroup/report selector |
| Discovery asset count by proxy/unit | Discovery dashboard/report |

### Step 4: Load Test Queries

Each approved view/stored procedure must be tested for:

- execution time
- logical reads
- blocking behavior
- row count
- parameter selectivity
- performance at 30-second incident polling
- performance during HSD peak usage

### Step 5: Data Minimization Review

Approve the exact columns before production:

- allowed: unit, workgroup, status, priority, counts, SLA flags, time buckets, freshness, proxy health
- restricted: caller/user identity, free-text ticket details, email IDs, phone numbers, attachments, detailed audit logs
- conditional: asset hostname/IP/serial number, only if required for a specific dashboard drill-down and approved

## 9. Risks And Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Vendor schema changes break dashboard | High | Use vendor/DBA-owned views or stored procedures with versioned contract. |
| Direct DB access bypasses HSD RBAC | Critical | Dashboard RBAC must enforce unit/cluster access; DB account exposes only approved aggregate views. |
| Production HSD DB load increases | High | Use reporting replica, aggregate views, short timeouts, polling limits, and query monitoring. |
| PII leakage | Critical | Aggregate by default; avoid free-text/user fields; quarantine unknown rows; audit exports. |
| Incorrect unit attribution | High | Explicit mapping table, quarantine unmapped rows, duplicate detection, parity checks. |
| Encrypted/GDPR columns unreadable | Medium/high | Avoid encrypted raw columns; ask vendor/DBA for approved derived fields. |
| Licensing/support concern | High | Get written approval from HSD owner/vendor before production. |
| Stale central DB data | Medium | Track source timestamp and proxy last communication time separately from dashboard refresh. |
| Report/API and DB counts differ | Medium | Run parity period and define one accepted source-of-truth per metric. |

## 10. Recommendation

Proceed with a controlled feasibility spike for central DB integration.

The spike should not modify the existing browser/report collector yet. It should prove:

1. HSD/Symphony administrators can provide an approved read-only SQL/API contract.
2. Required incident, SR, SLA, MTTR, workgroup, proxy, and discovery/asset metrics are available.
3. Rows can be mapped to units reliably using workgroup, tenant/department, proxy, location, scan name, or asset custom fields.
4. Queries can run safely at operational polling intervals without affecting HSD.
5. Results match the portal/reports for pilot units.

If the spike passes, the central multi-unit architecture should prefer `central_db` or `api_key` HSD collection over browser scraping. Browser scraping should remain a fallback only for gaps.

## 11. Action Plan For Next Sitting

| Step | Owner | Output |
| --- | --- | --- |
| 1 | HSD/Symphony admin | Confirm HSD product/version, DB platform, reporting replica availability, vendor support boundary. |
| 2 | HSD DBA | Provide read-only staging/reporting DB credentials or sample schema export. |
| 3 | Samixa team | Build metadata-only DB discovery script; no broad scans. |
| 4 | HSD DBA/vendor | Create or approve `vw_samixa_*` views/stored procedures. |
| 5 | Samixa team | Build `hsd-db-collector` prototype that reads approved views and writes normalized snapshots. |
| 6 | Platform admin | Map workgroup/tenant/proxy/location to unit IDs. |
| 7 | Joint validation | Compare 3-5 pilot units against HSD portal reports. |
| 8 | Security review | Approve data fields, access path, audit, credential storage, and network restrictions. |
| 9 | Production decision | Choose API, central DB, reports scraping, or hybrid mode per metric. |

## 12. Final Position

Yes, tapping the central HSD/Symphony database can work, and it may be the best architecture for 40-unit central dashboards.

But the safe version is not "connect to the HSD production DB and reverse-engineer tables." The safe version is:

```text
approved reporting replica or schema
  + read-only service account
  + vendor/DBA-owned aggregate views/stored procedures
  + unit mapping and quarantine
  + Samixa PostgreSQL normalized snapshots
  + dashboard RBAC
```

This gives the dashboard faster incident/SR/asset freshness without one fragile browser session, while keeping HSD as the authoritative source system.
