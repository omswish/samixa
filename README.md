# UAIL IT Dashboard

Operational wallboard for Utkal Alumina IT operations. The application aggregates live infrastructure and service-desk telemetry from Nutanix, SolarWinds, and Symphony HSD, then presents it through a single operator dashboard and a separate admin surface.

| Attribute | Value |
| --- | --- |
| Product | UAIL IT Dashboard |
| Repository Status | Active implementation |
| Primary Audience | IT Operations and Tech-Unit IT |
| Primary Resolution Target | 1920x1200 wallboard |
| Current Documentation Set | [docs/README.md](docs/README.md) |
| Last Updated | 2026-07-24 |

## Runtime Surfaces
- Operator wallboard: `http://<host>:21060/login`
- Admin console: `http://<host>:21061/login`

## Core Services
- `dashboard-frontdoor-operator` on `21060`
- `dashboard-frontdoor-admin` on `21061`
- `dashboard-ui` on `127.0.0.1:3001`
- `api-gateway` on `127.0.0.1:4000`
- `nutanix-collector`
- `solarwinds-collector`
- `symphony-collector`

## Source Of Truth Rules
- Nutanix is the primary source for HCI-backed server telemetry.
- SolarWinds remains the source for network telemetry and on-prem server telemetry.
- If a Nutanix-backed server loses Nutanix data for more than 10 minutes and SolarWinds data exists, the gateway marks the server as a fallback view sourced from SolarWinds.
- The dashboard must not fabricate normal operating values. On collector failure it continues to show the last successfully synced data and timestamp for that section.

## Documentation
The maintained document set is under [docs/README.md](docs/README.md).
The primary reference documents are:
- [Product Requirements Document](docs/product-requirements-document.md)
- [Project Documentation and Timeline](docs/project-documentation-and-timeline.md)
- [System Design](docs/system-design.md)
- [User Manual](docs/user-manual.md)
- [Developer Handbook](docs/developer-handbook.md)

Current deployment baseline:
- SQLite-first runtime storage
- Windows installer does not prompt for or bundle PostgreSQL
- PostgreSQL remains repository-level future work only and is not part of the supported `1.2` installation path

## Basic Operations
Build the workspaces:

```powershell
npm run build
```

Start the stack with PM2:

```powershell
pm2 start ecosystem.config.js
```

Save the PM2 process list after validation:

```powershell
pm2 save
```
