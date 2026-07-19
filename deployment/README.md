# Deployment Workspace

This folder now supports a web-only Windows deployment model.

Purpose:
- stage the production dashboard payload
- build installer and offline server bundles
- provision PM2, Node, optional Postgres connectivity, and runtime configuration
- expose two web surfaces from the same Next.js app:
  - operator on `21060`
  - admin on `21061`

Current contents:
- `config/` deployment-time manifests and shared metadata
- `installer/` Inno Setup files and support scripts
- `postgres/` offline PostgreSQL support
- `runtime-tools/` bundled PM2 tooling
- `tools/` staging and bundle builders

Guardrails:
- do not add a separate desktop admin application here
- keep operator and admin flows on the same web stack
- treat this folder as deployment/runtime packaging only

Primary deployment model:
1. stage the built app with `tools/stage-release.ps1`
2. create an offline bundle or installer
3. install on Windows server
4. browse to:
   - `http://<server>:21060/login`
   - `http://<server>:21061/login`

Operational note:
- the default deployment model is SQLite-first under `C:\ProgramData\UAIL\ITDashboard`
- PM2 bootstrap plus `pm2 save` and scheduled-task `pm2 resurrect` provide the deployed auto-heal path
- the admin surface now validates saved HSD and SolarWinds browser sessions against the live portals
- HSD reauthentication is a server-local action that opens an interactive Edge/PowerShell helper on the Windows host
- HSD also exposes an explicit legacy-profile import helper for recovery cases where an older authenticated Edge profile must be migrated into storage-state JSON

Maintained references:
- [docs/product-requirements-document.md](../docs/product-requirements-document.md)
- [docs/project-documentation-and-timeline.md](../docs/project-documentation-and-timeline.md)
- [docs/system-design.md](../docs/system-design.md)
- [docs/user-manual.md](../docs/user-manual.md)
- [docs/developer-handbook.md](../docs/developer-handbook.md)
