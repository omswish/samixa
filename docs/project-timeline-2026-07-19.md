# Project Timeline

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-HIST-001 |
| Version | 1.0 |
| Status | Internal review |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-19 |
| Source | Repository git history on `main` |

## 1. Timeline Intent
This timeline summarizes how the project has progressed based on the actual git history. It is meant to show delivery sequencing, not just the current end state.

## 2. Phase Summary

| Date | Phase | Outcome |
| --- | --- | --- |
| 2026-07-11 | Foundation and first live metrics | Base dashboard and collectors established |
| 2026-07-12 | Collector stability and live network visibility | Real-time collection became materially usable |
| 2026-07-13 | Wallboard redesign and data audit work | Trust model and visual layout hardened |
| 2026-07-14 | Responsive operator experience and planning | Mobile support, filters, and future-state planning added |
| 2026-07-17 | Admin surface, deployment tooling, and review docs | Project became operable as a managed deployment |
| 2026-07-18 | HSD recovery refinement | Legacy profile import flow corrected |
| 2026-07-19 | SQLite-first deployment stabilization | Admin console compacted and offline packaging validated |

## 3. Detailed History

### 2026-07-11: Initial Build-Out
- `bc70a4b` Initial commit: NOC Dashboard and background collectors
- `7ba695c` Dynamic VM metrics collection, logical capacity indicators, and Nutanix alert colors
- `9e3edf6` Network sparkline readability improvements with dynamic axes and thicker traces

Impact:
- the project moved from concept to a working dashboard baseline
- Nutanix HCI telemetry became the first strongly visualized live domain

### 2026-07-12: Collector Stabilization
- `25748d2` Stabilize collectors and live network dashboard

Impact:
- collectors became more reliable as an operational loop rather than a demo path
- network telemetry became part of the main monitoring surface

### 2026-07-13: Major Wallboard And Trust-Model Iteration
- `494d994` Stabilize collectors and redesign the operations wallboard
- `23498f9` Refine wallboard layout and network card
- `9c693d3` Tune network utilization chart readability
- `5acd0bd` Audit server data flow and harden SolarWinds 45
- `b309f19` Fix live HSD mapping and special queue counts
- `5380bde` Redesign wallboard server and network layout
- `25b47e0` Add SolarWinds server disk and fallback telemetry
- `68f7dcb` Refine wallboard HCI status and headers

Impact:
- the UI shifted from generic dashboarding to an engineering wallboard
- HSD bucket mapping and queue visibility improved
- server attribution and fallback logic became explicit
- SolarWinds 45 hardening started to matter for trust, not just display

### 2026-07-14: Responsive Use And Control-Plane Planning
- `59d6082` Add mobile operator view and LAN access
- `7791363` Add frontend dashboard filters
- `3a0f53a` Harden Symphony collection and plan Postgres migration
- `b215c29` Refine wallboard network and HSD layouts
- `4aa7e20` Polish wallboard network and HSD layout
- `abc4d7d` docs: add security and postgres planning set

Impact:
- the operator surface became usable beyond the wallboard screen
- admin and deployment planning became more formal
- HSD robustness work and future database planning entered the repo as tracked work

### 2026-07-17: Operations Readiness And Packaging
- `4e543fd` Add admin console and offline deployment tooling
- `859b88c` Fix Windows PM2 admin service actions
- `d18ae17` Harden HSD session recovery flows
- `0251d5c` Revise deployment for HSD session recovery
- `cc9c859` Consolidate docs and executive review pack
- `ec12240` Add review-ready documentation baseline
- `8b6e785` Track executive summary source
- `0082a8e` Add PDF exports for documentation

Impact:
- the project crossed from wallboard development into operable product territory
- deployment, session recovery, and review documentation became first-class assets
- admin control moved into the same web stack rather than a separate desktop tool

### 2026-07-18: HSD Recovery Refinement
- `93a56d0` Fix Symphony legacy profile import resolution

Impact:
- the HSD recovery path became safer and more predictable for migrated sessions

### 2026-07-19: SQLite-First Delivery Hardening
- `69ab738` Stabilize SQLite deployment and compact admin console
- `e131f5b` Use tar fallback for offline bundle packaging
- `74ff7fb` Validate offline deployment packaging

Impact:
- deployment complexity was reduced by centering on SQLite
- the admin surface became more compact and practical
- the packaged deployment path was validated end-to-end with an isolated smoke test

## 4. Delivery Themes

### 4.1 What Changed Most
- the operator UI matured rapidly from basic telemetry to a purpose-built engineering wallboard
- the trust model became explicit: no fabricated values, visible freshness, and source-of-truth rules
- HSD and SolarWinds session handling evolved into an administrable workflow
- deployment moved from ad hoc local running to repeatable Windows packaging

### 4.2 Architectural Direction Visible In History
- single shared web app with separate operator and admin front doors
- SQLite-first delivery for lower deployment friction
- optional PostgreSQL kept as a future maturity path, not a mandatory prerequisite
- collector/session robustness prioritized before deeper platform expansion

## 5. Current Baseline
As of `74ff7fb` on 2026-07-19, the project baseline is:
- two-surface web deployment
- PM2-managed multi-process runtime
- SQLite primary state
- offline packaging and validation path
- embedded admin operations for services, sessions, sources, and help documentation

## 6. Full Commit Ledger

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
