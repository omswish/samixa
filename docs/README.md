# Documentation Index

This directory replaces the earlier ad hoc planning notes with a maintainable documentation set aligned to the current implementation.

| Attribute | Value |
| --- | --- |
| Document Family | UAIL IT Dashboard controlled documentation |
| Status | Internal review |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Effective Date | 2026-07-17 |
| Review Cycle | On major release or architecture/security change |

## Document Set
- [Document Register](document-register.md)
- [Product Requirements Specification](product-requirements-specification.md)
- [Architecture and Design](architecture-and-design.md)
- [Information Security](information-security.md)
- [Operator User Manual](operator-manual.md)
- [Admin User Manual](admin-manual.md)
- [Deployment Guide](deployment-guide.md)
- [Executive Summary Pack](executive-summary-pack.md)

## Visual Assets
- [Operator login](assets/screenshots/operator-login.png)
- [Operator dashboard](assets/screenshots/operator-dashboard.png)
- [Admin overview](assets/screenshots/admin-overview.png)
- [Admin sessions](assets/screenshots/admin-sessions.png)

## PDF Exports
- Generated PDFs are placed under `docs/pdf/`
- Regenerate them with:

```powershell
node docs/tools/export-markdown-pdfs.mjs
```

## Current Scope
- Primary wallboard target: `1920x1200`
- Secondary desktop target: `1920x1080`
- Alternate responsive layout for tablet and mobile browsers
- Single deployed Next.js application with separate operator and admin front doors
- SQLite remains the active runtime store
- PostgreSQL remains an optional mirror and control-plane store

## Superseded Notes
The old `guide_next/` working notes were useful during iterative delivery but are no longer the canonical project documentation. This folder should be treated as the maintained source of truth for design, usage, deployment, and security guidance.
