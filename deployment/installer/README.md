# Windows Installer

This folder holds the Windows installer packaging flow for the UAIL IT Dashboard web deployment.

Current installer model:
- GUI setup wizard built with Inno Setup
- packages the staged application payload, bundled Node runtime, runtime tools, and metadata
- writes runtime `.env` values during setup
- validates Postgres connectivity before provisioning completes
- calls the staged deployment support scripts for firewall rules, startup registration, and stack bootstrap

Primary files:
- `utkal-it-dashboard.iss`
- `support/validate-postgres.js`
- `support/provision-staged-deployment.ps1`
- supporting PowerShell scripts for firewall, startup, and PM2 restore

Expected output:
- `output/utkal-it-dashboard-setup.exe`

Build prerequisites:
- refreshed staged payload under `deployment/staging/current`
- Inno Setup 6 compiler available as `ISCC.exe`

Typical build command:
- run `ISCC.exe utkal-it-dashboard.iss` from this folder
