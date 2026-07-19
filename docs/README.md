# Documentation Index

| Field | Value |
| --- | --- |
| Document Family | UAIL IT Dashboard controlled documentation |
| Status | Active baseline |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-19 |

## Canonical Documents
- [Product Requirements Document](product-requirements-document.md)
- [Project Documentation and Timeline](project-documentation-and-timeline.md)
- [System Design](system-design.md)
- [User Manual](user-manual.md)
- [Developer Handbook](developer-handbook.md)

## PDF Exports
Generated PDFs are placed under `docs/pdf/` and mirrored into `dashboard/public/help/` for the admin Help tab.

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
- Responsive fallback for tablet and mobile browsers
- Shared web application with separate operator and admin surfaces
- SQLite-first runtime model with optional PostgreSQL extension
