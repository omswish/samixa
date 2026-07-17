# Deployment Workspace

This folder now supports a web-only Windows deployment model.

Purpose:
- stage the production dashboard payload
- build installer and offline server bundles
- provision PM2, Node, Postgres connectivity, and runtime configuration
- expose two web surfaces from the same Next.js app:
  - operator on `21060`
  - admin on `21061`

Current contents:
- `config/` deployment-time manifests and shared metadata
- `docs/` deployment runbooks and copy-set notes
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
