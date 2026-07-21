# Windows Installer

This folder holds the Windows installer packaging flow for the UAIL IT Dashboard web deployment.

Current installer model:
- GUI setup wizard built with Inno Setup
- packages the staged application payload, bundled Node runtime, runtime tools, and metadata
- does not package PostgreSQL or any separate database installer
- writes runtime `.env` values during setup
- defaults to a SQLite-first deployment with encrypted local collector settings
- calls the staged deployment support scripts for firewall rules, startup registration, stack bootstrap, and PM2 auto-heal registration
- carries the admin HSD reauthentication flow that stops the HSD collector before opening the server-local login helper

Primary files:
- `utkal-it-dashboard.iss`
- supporting PowerShell scripts for firewall, startup, and PM2 restore

Default deployment shape:
- single writable root under `C:\ProgramData\UAIL\ITDashboard`
- SQLite runtime DB
- local encrypted collector settings file under `config\collector-settings.json`
- HSD and SolarWinds session files under `sessions\`

Expected output:
- `output/utkal-it-dashboard-setup.exe`

Build prerequisites:
- refreshed staged payload under `deployment/staging/current`
- Inno Setup 6 compiler available as `ISCC.exe`

Typical build command:
- run `ISCC.exe utkal-it-dashboard.iss` from this folder
- use `ISCC.exe /DStageRoot=..\staging\<folder> utkal-it-dashboard.iss` when packaging from an alternate verified stage directory
