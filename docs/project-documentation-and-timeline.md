# Project Documentation and Timeline

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-PROJ-001 |
| Version | 1.1 |
| Status | Active baseline |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-19 |
| Source | Repository git history on `main` |

## 1. Purpose
Provide a consolidated project-level record covering what has been delivered, how the project evolved, the major workstreams completed so far, and the current baseline as established in the repository.

## 2. Current Project Baseline
The project currently consists of:
- a production-oriented operator dashboard
- a separate admin surface on the same web application stack
- live collectors for Nutanix, SolarWinds, and Symphony HSD
- a SQLite-first runtime and deployment model
- Windows deployment packaging with offline bundle support
- separate bootstrap credentials for SolarWinds 45, SolarWinds 46, and HSD
- documentation PDFs exposed directly in the admin console

## 3. Delivery Workstreams

| Workstream | Summary |
| --- | --- |
| Live collection | Nutanix API collection and Playwright-based SolarWinds/HSD collection |
| Operator wallboard | Engineering-style layout, threshold visuals, filters, responsive fallbacks |
| Data trust model | Last-sync handling, source-of-truth rules, collector freshness state |
| Admin operations | Services, sessions, source configuration, help/document access |
| Deployment | PM2 orchestration, offline bundle generation, installer validation |
| Documentation | Corporate-readable baseline documentation and embedded PDFs |

## 4. Timeline Summary

| Date | Phase | Outcome |
| --- | --- | --- |
| 2026-07-11 | Foundation and live telemetry start | Base dashboard and collectors established |
| 2026-07-12 | Collector stabilization | Core collection loop became operationally usable |
| 2026-07-13 | Major wallboard redesign and audit work | Trust and visual model were significantly strengthened |
| 2026-07-14 | Responsive support and planning | Filters, mobile support, and roadmap planning added |
| 2026-07-17 | Admin and deployment readiness | Admin surface, packaging, and formal docs introduced |
| 2026-07-18 | HSD recovery refinement | Legacy profile import and session flows stabilized |
| 2026-07-19 | Deployment and docs consolidation | SQLite-first deployment, split bootstrap credentials, and embedded documentation baseline completed |

## 5. Detailed Timeline

### 2026-07-11: Initial Build-Out
- `bc70a4b` Initial commit: NOC Dashboard and background collectors
- `7ba695c` Dynamic VM metrics, capacity indicators, and Nutanix threshold color logic
- `9e3edf6` Improved sparkline scaling and readability

Result:
- the project moved from concept to a functioning dashboard baseline
- Nutanix HCI telemetry became the first mature visual domain

### 2026-07-12: Collector Stabilization
- `25748d2` Stabilize collectors and live network dashboard

Result:
- the collector loop became materially more reliable
- live network visibility became part of the wallboard rather than a side experiment

### 2026-07-13: Design And Trust Model Expansion
- `494d994` Redesign the operations wallboard
- `23498f9` Refine wallboard layout and network card
- `9c693d3` Tune network chart readability
- `5acd0bd` Audit server data flow and harden SolarWinds 45
- `b309f19` Fix live HSD mapping and special queue counts
- `5380bde` Redesign wallboard server and network layout
- `25b47e0` Add SolarWinds server disk and fallback telemetry
- `68f7dcb` Refine wallboard HCI status and headers

Result:
- the UI became an engineering wallboard rather than a generic dashboard
- HSD queue mapping and server source attribution improved
- fallback behavior became explicit and audit-oriented

### 2026-07-14: Responsive Use And Planning
- `59d6082` Add mobile operator view and LAN access
- `7791363` Add frontend dashboard filters
- `3a0f53a` Harden Symphony collection and plan Postgres migration
- `b215c29` Refine wallboard network and HSD layouts
- `4aa7e20` Polish wallboard network and HSD layout
- `abc4d7d` Add security and postgres planning docs

Result:
- the operator experience became more flexible across devices
- control-plane planning and security documentation began to formalize

### 2026-07-17: Operations Readiness
- `4e543fd` Add admin console and offline deployment tooling
- `859b88c` Fix Windows PM2 admin service actions
- `d18ae17` Harden HSD session recovery flows
- `0251d5c` Revise deployment for HSD session recovery
- `cc9c859` Consolidate docs and executive review pack
- `ec12240` Add review-ready documentation baseline
- `8b6e785` Track executive summary source
- `0082a8e` Add PDF exports for documentation

Result:
- the product crossed from a wallboard build into an operable managed application
- deployment, session recovery, and admin control became first-class concerns

### 2026-07-18: HSD Session Recovery Fixes
- `93a56d0` Fix Symphony legacy profile import resolution

Result:
- HSD recovery became more predictable for legacy authenticated sessions

### 2026-07-19: Deployment Hardening And Documentation Reset
- `69ab738` Stabilize SQLite deployment and compact admin console
- `e131f5b` Use tar fallback for offline bundle packaging
- `74ff7fb` Validate offline deployment packaging
- `a29a064` Consolidate docs and embed admin help PDFs
- `5cd164d` Split bootstrap credentials for SolarWinds and HSD

Result:
- deployment became simpler and more reliable around a SQLite-first model
- the admin surface gained integrated documentation access
- installer and bootstrap behavior no longer assume shared portal credentials

## 6. Delivery Themes

### 6.1 What Improved Most
- trustworthiness of displayed data
- operator readability and wallboard suitability
- recovery and maintenance of session-dependent collectors
- Windows deployment practicality

### 6.2 Architectural Direction
- one shared web app with separate operator and admin surfaces
- no synthetic values in normal runtime
- SQLite-first delivery for reduced installation friction
- optional PostgreSQL retained as a future maturity path rather than a prerequisite

## 7. Current Risks And Watch Areas
- HSD and SolarWinds remain dependent on browser session lifetime
- upstream certificate quality is not fully under project control
- current local authentication is pragmatic but not enterprise-grade
- long-term historical reporting scope remains intentionally limited

## 8. Full Commit Ledger

| Date | Commit | Summary |
| --- | --- | --- |
| 2026-07-11 | `bc70a4b` | Initial commit: NOC Dashboard and background collectors |
| 2026-07-11 | `7ba695c` | Implement dynamic VM metrics collection, logical capacity indicators, and threshold alert colors on Nutanix card |
| 2026-07-11 | `9e3edf6` | Dynamic auto-scaling y-axis and thicker line path for sparklines |
| 2026-07-12 | `25748d2` | Stabilize collectors and live network dashboard |
| 2026-07-13 | `494d994` | Stabilize collectors and redesign the operations wallboard |
| 2026-07-13 | `23498f9` | Refine wallboard layout and network card |
| 2026-07-13 | `9c693d3` | Tune network utilization chart readability |
| 2026-07-13 | `5acd0bd` | Audit server data flow and harden SolarWinds 45 |
| 2026-07-13 | `b309f19` | Fix live HSD mapping and special queue counts |
| 2026-07-13 | `5380bde` | Redesign wallboard server and network layout |
| 2026-07-13 | `25b47e0` | Add SolarWinds server disk and fallback telemetry |
| 2026-07-13 | `68f7dcb` | Refine wallboard HCI status and headers |
| 2026-07-14 | `59d6082` | Add mobile operator view and LAN access |
| 2026-07-14 | `7791363` | Add frontend dashboard filters |
| 2026-07-14 | `3a0f53a` | Harden Symphony collection and plan Postgres migration |
| 2026-07-14 | `b215c29` | Refine wallboard network and HSD layouts |
| 2026-07-14 | `4aa7e20` | Polish wallboard network and HSD layout |
| 2026-07-14 | `abc4d7d` | Add security and postgres planning set |
| 2026-07-17 | `4e543fd` | Add admin console and offline deployment tooling |
| 2026-07-17 | `859b88c` | Fix Windows PM2 admin service actions |
| 2026-07-17 | `d18ae17` | Harden HSD session recovery flows |
| 2026-07-17 | `0251d5c` | Revise deployment for HSD session recovery |
| 2026-07-17 | `cc9c859` | Consolidate docs and executive review pack |
| 2026-07-17 | `ec12240` | Add review-ready documentation baseline |
| 2026-07-17 | `8b6e785` | Track executive summary source |
| 2026-07-17 | `0082a8e` | Add PDF exports for documentation |
| 2026-07-18 | `93a56d0` | Fix Symphony legacy profile import resolution |
| 2026-07-19 | `69ab738` | Stabilize SQLite deployment and compact admin console |
| 2026-07-19 | `e131f5b` | Use tar fallback for offline bundle packaging |
| 2026-07-19 | `74ff7fb` | Validate offline deployment packaging |
| 2026-07-19 | `a29a064` | Consolidate docs and embed admin help PDFs |
| 2026-07-19 | `5cd164d` | Split bootstrap credentials for SolarWinds and HSD |
