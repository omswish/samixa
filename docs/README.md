# Documentation Index

This is the lean maintained documentation set for the current project baseline.

| Attribute | Value |
| --- | --- |
| Document Family | UAIL IT Dashboard controlled documentation |
| Status | Internal review |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Effective Date | 2026-07-19 |
| Review Cycle | On major release or architecture, deployment, or security change |

## Canonical Documents
- [System Handbook](system-handbook.md)
- [Operations Guide](operations-guide.md)
- [Project Timeline](project-timeline-2026-07-19.md)
- [Executive Summary Pack](executive-summary-pack.md)

## PDF Set
Generated PDFs are placed under `docs/pdf/` and copied into `dashboard/public/help/` for the admin Help tab.

Regenerate them with:

```powershell
node docs/tools/export-markdown-pdfs.mjs
```

## Visual Assets
- [Operator login](assets/screenshots/operator-login.png)
- [Operator dashboard](assets/screenshots/operator-dashboard.png)
- [Admin overview](assets/screenshots/admin-overview.png)
- [Admin sessions](assets/screenshots/admin-sessions.png)

## Current Scope
- Primary wallboard target: `1920x1200`
- Secondary desktop target: `1920x1080`
- Alternate responsive layout for tablet and mobile browsers
- Single deployed Next.js application with separate operator and admin front doors
- SQLite remains the active runtime store
- PostgreSQL remains optional, not mandatory

## Supporting Runtime Notes
- Deployment folder notes remain under [deployment/README.md](../deployment/README.md)
- The admin surface exposes the retained PDF set directly in its Help area
