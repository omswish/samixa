# Deployment Workspace

This folder now supports a web-only Windows deployment model.

Purpose:
- stage the production dashboard payload
- build installer and offline server bundles
- provision PM2, Node, and runtime configuration
- expose two web surfaces from the same Next.js app:
  - operator on `21060`
  - admin on `21061`

Current contents:
- `config/` deployment-time manifests and shared metadata
- `installer/` Inno Setup files and support scripts
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
- installer and offline bundle packages do not ship PostgreSQL anymore; the deployed stack runs without a bundled database server
- PM2 bootstrap plus `pm2 save` and a Windows startup task running as `SYSTEM` provide the deployed auto-heal path after server restarts
- the install and repair scripts now normalize runtime write permissions for PM2 state, session files, config, logs, and app data before bootstrapping
- the admin surface now validates saved HSD and SolarWinds browser sessions against the live portals
- HSD reauthentication is a server-local action that stops `symphony-collector`, then launches an interactive helper in the signed-in Windows session so the login flow stays visible even when the dashboard stack is running from startup recovery
- HSD also exposes an explicit legacy-profile import helper for recovery cases where an older authenticated Edge profile must be migrated into storage-state JSON

Repair note:
- if an older install has a running dashboard but admin remediation fails with PM2 permission errors, run `deployment\tools\repair-installed-runtime.ps1` from an elevated PowerShell session
- or run `deployment\repair-installed-runtime.bat` to self-elevate and invoke the same repair workflow

Maintained references:
- [docs/product-requirements-document.md](../docs/product-requirements-document.md)
- [docs/project-documentation-and-timeline.md](../docs/project-documentation-and-timeline.md)
- [docs/system-design.md](../docs/system-design.md)
- [docs/user-manual.md](../docs/user-manual.md)
- [docs/developer-handbook.md](../docs/developer-handbook.md)
