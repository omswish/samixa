# Windows Deployment Instructions - 2026-07-15

## Scope
This document describes the current Windows deployment path for the UAIL IT Dashboard stack after the move to a single web application with two web surfaces.

It covers:
- the packaged installer artifact
- the staged payload fallback
- the recommended production deployment sequence
- post-deployment validation

## Produced Artifacts

### Installer
- `deployment/installer/output/utkal-it-dashboard-setup.exe`

### Staged Payload
- `deployment/staging/current`

### Offline Bundle
- `deployment/release/utkal-it-dashboard-offline-server-bundle-2026-07-17.zip`

## Current Recommendation
Use the packaged installer or offline bundle as the standard deployment path for a Windows server.

Reason:
- the installer packages the staged payload, bundled Node runtime, PM2 runtime tools, metadata, and support scripts
- the installer writes the runtime `.env` file during setup
- the installer validates Postgres connectivity only when PostgreSQL is configured
- the installer can optionally create the firewall rules, bootstrap the stack, and register startup restore
- the admin experience now lives inside the same web app on a separate port, so there is no separate desktop admin executable to ship or maintain

Keep the staged payload as the fallback path for offline recovery, troubleshooting, or environments where installer-driven provisioning is not allowed by policy.

## Target Runtime Topology
- `dashboard-frontdoor-operator` listens on `0.0.0.0:21060`
- `dashboard-frontdoor-admin` listens on `0.0.0.0:21061`
- `dashboard-ui` listens on `127.0.0.1:3001`
- `api-gateway` listens on `127.0.0.1:4000`
- collectors post only to `http://127.0.0.1:4000/api/update`
- operators browse only to `http://<server>:21060`
- admins browse only to `http://<server>:21061`

## Credentials
Current local web credentials are:
- operator: `operator` / `17172737`
- admin: `admin` / `17172737`

## Server Prerequisites
- Windows Server 2019 or later
- Microsoft Edge installed
- local administrator access for installation and firewall changes
- source-system connectivity available from the server for Nutanix, SolarWinds, and HSD if those collectors will be used

## Option A. Installer-Based Deployment
Run:
- `deployment/installer/output/utkal-it-dashboard-setup.exe`

The installer performs these steps:
- copies the staged application, bundled Node runtime, runtime tools, and metadata
- prompts for optional Postgres host, port, database, user, password, SSL requirement, operator port, and admin port
- prompts for the secret-store passphrase used by the application
- prompts for Nutanix, SolarWinds, and HSD bootstrap credentials
- generates the installed `app\.env`
- validates Postgres connectivity using the bundled Node runtime and installed `pg` client only when PostgreSQL is configured
- optionally creates inbound Windows Firewall rules for the selected operator and admin ports
- optionally bootstraps the PM2 stack immediately after install
- optionally registers a Scheduled Task to resurrect PM2 on server startup

Expected install location:
- `C:\ProgramData\UAIL\ITDashboard`

Session/runtime paths used by the deployed HSD flow:
- HSD storage-state JSON: `C:\ProgramData\UAIL\ITDashboard\sessions\symphony\symphony-storage-state.json`
- HSD interactive Edge profile: `C:\ProgramData\UAIL\ITDashboard\sessions\symphony\interactive-edge-profile`
- HSD helper launcher scripts: `C:\ProgramData\UAIL\ITDashboard\admin\reauth`
- Local collector settings: `C:\ProgramData\UAIL\ITDashboard\config\collector-settings.json`

After installer completion, validate:
- `http://<server>:21060/login`
- `http://<server>:21061/login`
- PM2 services show online

## Option B. Staged Payload Fallback
Single entrypoint:
- `deployment\deploy-windows-server.bat`

Fully unattended example:

```bat
deploy-windows-server.bat -NonInteractive -SecretStorePassphrase your-secret-passphrase -NutanixUser nutanix-user -NutanixPassword nutanix-pass -SolarWindsUser sw-user -SolarWindsPassword sw-pass -SkipPostgresInstall -OperatorPort 21060 -AdminPort 21061
```

## Runtime Environment File
The installed `app\.env` must include:
- `SECRET_STORE_PASSPHRASE`
- `APP_AUTH_SECRET`
- `APP_LOGIN_PASSWORD`
- `VIEWER_SESSION_DAYS`
- `ADMIN_SESSION_HOURS`
- `OPERATOR_FRONTDOOR_PORT`
- `ADMIN_FRONTDOOR_PORT`
- source-specific values for enabled Nutanix, SolarWinds, and HSD collectors

Optional:
- `POSTGRES_URL`
- `POSTGRES_SSL`
- `POSTGRES_SECRET_PASSPHRASE`

Default local login password:
- `APP_LOGIN_PASSWORD=17172737`

## Start The Stack

```powershell
cd C:\ProgramData\UAIL\ITDashboard\app
..\runtime-tools\node_modules\.bin\pm2.cmd start ecosystem.config.js --update-env
..\runtime-tools\node_modules\.bin\pm2.cmd save
```

## Configure Firewall
Allow inbound:
- TCP `21060` for operators
- TCP `21061` for admins

Do not expose externally:
- TCP `3001`
- TCP `4000`

## First Browser Validation
Open:
- `http://<server>:21060/login`
- `http://<server>:21061/login`

Validate:
- operator login works on `21060`
- operator login is rejected on `21061`
- admin login works on `21061`
- `/admin` loads on `21061`
- dashboard loads on `21060`

## HSD and SolarWinds Session Recovery
Use the admin web surface on `21061`.

Admin actions available there:
- service status
- start, stop, restart per service
- full stack restart
- source URL and credential configuration
- HSD session import
- HSD live session validation against the actual HSD portal
- HSD interactive reauthentication launch on the server host
- HSD legacy-profile import launch on the server host
- SolarWinds session import and reauthentication launch

Important behavior:
- the Sessions page does not treat "file exists" as authenticated
- HSD and SolarWinds session badges are based on a live portal probe
- the reauthentication and legacy-import buttons are shown only for a server-local admin session

### HSD Interactive Reauthentication
- Click `Launch Reauth on Server` from the HSD session card.
- A PowerShell helper opens on the Windows server and launches the interactive Edge-based HSD login flow.
- Complete Microsoft / HSD login in that Edge window.
- Wait until the HSD dashboard is fully visible.
- Return to the helper and confirm when prompted so the refreshed storage-state JSON is written back to:
  - `C:\ProgramData\UAIL\ITDashboard\sessions\symphony\symphony-storage-state.json`

### HSD Legacy Profile Import
- Use this only when an older authenticated Symphony Edge profile already exists and the normal interactive path is not desirable.
- Click `Import Legacy HSD Profile` from the HSD session card.
- The helper runs:
  - `npm run login --workspace collectors/symphony -- --import-legacy-profile`
- The legacy profile expected by the deployed build must exist at:
  - `C:\ProgramData\UAIL\ITDashboard\app\collectors\edge-profile`
- The helper exports that legacy authenticated browser state into the active storage-state JSON under `C:\ProgramData\UAIL\ITDashboard\sessions\symphony`.
- If the legacy profile is missing or locked by another process, the helper will fail explicitly.

## Validation Checklist
Run:

```powershell
cd C:\ProgramData\UAIL\ITDashboard\app
..\runtime-tools\node_modules\.bin\pm2.cmd status
```

Expected:
- `api-gateway` online
- `dashboard-ui` online
- `dashboard-frontdoor-operator` online
- `dashboard-frontdoor-admin` online
- `nutanix-collector` online if configured
- `solarwinds-collector` online if configured
- `symphony-collector` online if configured

## Operational Commands

```powershell
cd C:\ProgramData\UAIL\ITDashboard\app
..\runtime-tools\node_modules\.bin\pm2.cmd status
..\runtime-tools\node_modules\.bin\pm2.cmd logs
..\runtime-tools\node_modules\.bin\pm2.cmd restart ecosystem.config.js --update-env
..\runtime-tools\node_modules\.bin\pm2.cmd save
```
