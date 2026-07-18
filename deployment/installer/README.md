# Windows Installer

This folder holds the Windows installer packaging flow for the UAIL IT Dashboard web deployment.

Current installer model:
- GUI setup wizard built with Inno Setup
- packages the staged application payload, bundled Node runtime, runtime tools, and metadata
- writes runtime `.env` values during setup
- defaults to a SQLite-first deployment with encrypted local collector settings
- supports bundled PostgreSQL only as an optional path
- calls the staged deployment support scripts for firewall rules, startup registration, stack bootstrap, and PM2 auto-heal registration

Primary files:
- `utkal-it-dashboard.iss`
- `support/validate-postgres.js`
- `support/provision-staged-deployment.ps1`
- supporting PowerShell scripts for firewall, startup, and PM2 restore

Default deployment shape:
- single writable root under `C:\ProgramData\UAIL\ITDashboard`
- SQLite runtime DB
- local encrypted collector settings file under `config\collector-settings.json`
- HSD and SolarWinds session files under `sessions\`
- optional PostgreSQL only when the operator explicitly enables it during setup

Expected output:
- `output/utkal-it-dashboard-setup.exe`

Build prerequisites:
- refreshed staged payload under `deployment/staging/current`
- Inno Setup 6 compiler available as `ISCC.exe`

Typical build command:
- run `ISCC.exe utkal-it-dashboard.iss` from this folder
