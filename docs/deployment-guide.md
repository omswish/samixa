# Deployment Guide

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-DEP-001 |
| Version | 1.0 |
| Status | Internal review |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-19 |
| Primary Audience | Infrastructure and deployment owners |

## Deployment Scope
This guide summarizes the supported deployment model and links to the packaging runbooks under `deployment/`. It is intentionally written for review and implementation planning, not as a replacement for the low-level installer scripts.

## 1. Purpose
This guide explains the supported Windows deployment model for the current application and links it to the runtime topology used by the codebase.

## 2. Deployment Model
The application is deployed as one shared web stack with two entry points:
- operator surface on `21060`
- admin surface on `21061`

Internal-only services remain on loopback:
- Next.js app on `3001`
- API gateway on `4000`

## 3. Packaging Options
- Installer: `deployment/installer/output/utkal-it-dashboard-setup.exe`
- Offline bundle: `deployment/release/utkal-it-dashboard-offline-server-bundle-2026-07-17.zip`
- Staged fallback payload: `deployment/staging/current`

For detailed packaging mechanics, keep the deployment-specific runbooks under `deployment/`.

## 4. Recommended Target Host
- Windows Server 2019 or later
- Dedicated VM or dedicated application server
- LAN reachability to Nutanix, SolarWinds, and HSD as required
- Microsoft Edge installed

## 5. Required Runtime Variables
- `APP_AUTH_SECRET`
- `APP_LOGIN_PASSWORD`
- `VIEWER_SESSION_DAYS`
- `ADMIN_SESSION_HOURS`
- `OPERATOR_FRONTDOOR_PORT`
- `ADMIN_FRONTDOOR_PORT`
- `SECRET_STORE_PASSPHRASE`
- source-specific values for Nutanix, SolarWinds, and Symphony when local runtime config is not yet saved
- `POSTGRES_URL` only when optional PostgreSQL mirror/config features are enabled

## 6. Deployment Topology

```mermaid
flowchart LR
    A[Operator browser] -->|21060| B[Operator front door]
    C[Admin browser] -->|21061| D[Admin front door]
    B --> E[Next.js app 3001 loopback]
    D --> E
    E --> F[Gateway 4000 loopback]
    F --> G[SQLite]
    F -. optional .-> H[PostgreSQL]
```

## 7. Installation Sequence

```mermaid
flowchart TD
    A[Install package] --> B[Generate .env]
    B --> C[Configure firewall]
    C --> D[Start PM2 stack]
    D --> E[Validate operator/admin login]
    E --> F[Validate collector sessions]
    F --> G[Go live]
```

## 8. Standard Steps
1. Copy the installer or offline bundle to the Windows server.
2. Install to `C:\ProgramData\UAIL\ITDashboard`.
3. Confirm the runtime root, app payload, sessions, logs, and local collector settings all resolve under that same root.
4. Configure source credentials and the secret-store passphrase.
5. Start the stack with PM2.
6. Validate operator and admin login pages.
7. Validate service state in the admin console.
8. Validate HSD and SolarWinds session status.

## 9. PM2 Commands

```powershell
cd C:\ProgramData\UAIL\ITDashboard\app
..\runtime-tools\node_modules\.bin\pm2.cmd start ecosystem.config.js --update-env
..\runtime-tools\node_modules\.bin\pm2.cmd status
..\runtime-tools\node_modules\.bin\pm2.cmd logs
..\runtime-tools\node_modules\.bin\pm2.cmd restart ecosystem.config.js --update-env
..\runtime-tools\node_modules\.bin\pm2.cmd save
```

## 10. Firewall Rules
Allow inbound:
- TCP `21060`
- TCP `21061`

Do not expose:
- TCP `3001`
- TCP `4000`

## 11. Session Runtime Paths
- HSD storage state: `C:\ProgramData\UAIL\ITDashboard\sessions\symphony\symphony-storage-state.json`
- HSD interactive Edge profile: `C:\ProgramData\UAIL\ITDashboard\sessions\symphony\interactive-edge-profile`
- HSD helper scripts: `C:\ProgramData\UAIL\ITDashboard\admin\reauth`
- Local collector settings: `C:\ProgramData\UAIL\ITDashboard\config\collector-settings.json`

## 12. Validation Checklist
- Operator login works on `21060`
- Admin login works on `21061`
- Operator credentials do not grant admin access
- All expected PM2 services are online
- Dashboard sections show expected freshness status
- HSD and SolarWinds session validation shows real portal state

## 13. Operational Security Notes
- Deploy behind LAN restrictions only
- Protect runtime folders with admin-only permissions
- Keep front doors on the internal network only
- Prefer the encrypted local secret store over long-term environment-variable secrets
- Enable optional PostgreSQL only when mirror/config features are explicitly required

## 14. Reference Runbooks
- [deployment/README.md](../deployment/README.md)
- [deployment/docs/windows_deployment_instructions_2026-07-15.md](../deployment/docs/windows_deployment_instructions_2026-07-15.md)
- [deployment/docs/offline_server_bundle_2026-07-17.md](../deployment/docs/offline_server_bundle_2026-07-17.md)
