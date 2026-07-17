# Windows Server Deployment Plan - 2026-07-15

## Objective
- Deploy the current dashboard stack on a dedicated Windows server with:
- internal-only collector traffic on loopback where possible
- LAN access for viewer/admin browsers through the frontdoor on port `3000`
- Postgres-backed config and secret storage
- persistent runtime/session files under `C:\ProgramData\UAIL\itdash`
- PM2-managed startup and recovery

## Current Runtime Topology
- `api-gateway` listens on `127.0.0.1:4000`
- `dashboard-ui` listens on `127.0.0.1:3001`
- `dashboard-frontdoor` listens on `0.0.0.0:3000`
- collectors post only to `http://127.0.0.1:4000/api/update`
- browser users access only `http://<server>:3000`

## Why This Layout
- Collectors and internal APIs stay off the LAN.
- Only the frontdoor is exposed to users.
- WebSocket auth is enforced at the frontdoor using the signed dashboard session cookie.
- This preserves the current standalone architecture and does not require HTTPS immediately inside the trusted internal network.

## Server Prerequisites
- Windows Server 2019 or later
- Node.js 22 LTS
- npm matching the installed Node.js release
- PM2 installed globally: `npm install -g pm2`
- Microsoft Edge installed on the server
- Postgres reachable from the server
- service account access to Nutanix, SolarWinds, and HSD

## Required Folders
- application root: deploy this repo to a fixed path such as `C:\Apps\samixa`
- runtime root: `C:\ProgramData\UAIL\itdash`
- ensure these subfolders exist or can be created by the processes:
- `C:\ProgramData\UAIL\itdash\sessions\symphony`
- `C:\ProgramData\UAIL\itdash\sessions\solarwinds`
- `C:\ProgramData\UAIL\itdash\sessions\nutanix`

## Environment Variables
- `.env` at repo root must contain:
- `POSTGRES_URL`
- `POSTGRES_SSL`
- `POSTGRES_SECRET_PASSPHRASE`
- `APP_AUTH_SECRET`
- `VIEWER_SESSION_DAYS`
- `ADMIN_SESSION_HOURS`
- fallback/default collector values only where Postgres config is not yet populated

## First-Time Setup
1. Copy repo to the server.
2. Run `npm install` from repo root.
3. Run `npm run build` from repo root.
4. Confirm `.env` is present and valid.
5. Confirm Postgres is reachable from the server.
6. Start the stack with `pm2 start ecosystem.config.js --update-env`.
7. Persist PM2 with `pm2 save`.
8. Configure PM2 startup for Windows.

## PM2 Startup on Windows
- Preferred approach: install PM2 as the process supervisor and register it for boot.
- Use PM2 startup support available for the server environment, then `pm2 save`.
- If PM2 startup registration is unreliable in the target server image, create a Windows Scheduled Task that runs at boot under the service account and executes:

```powershell
cd C:\Apps\samixa
pm2 resurrect
```

- Keep the wallboard browser separate from PM2; PM2 should manage only backend/runtime processes.

## Wallboard Access Model
- Viewer account stays permanently logged in on the wall TV browser.
- Admin users log in from their own browsers when changes are needed.
- The frontdoor on port `3000` is the only user-facing endpoint.
- Internal ports `3001` and `4000` should not be exposed through the Windows firewall.

## Windows Firewall Guidance
- Allow inbound TCP `3000` only from required internal subnets.
- Block inbound TCP `3001` and `4000`.
- If possible, allow RDP only from admin subnets.
- Document the wallboard display host IP if a fixed viewer screen is used.

## HSD Session Recovery Workflow
- HSD still relies on browser session state today.
- Admin downloads or exports a Playwright-compatible storage-state JSON after successful HSD authentication on an admin machine.
- Admin logs into the dashboard and opens Settings.
- Admin imports the HSD session JSON through the admin modal.
- The server writes the file to:
- `C:\ProgramData\UAIL\itdash\sessions\symphony\symphony-storage-state.json`

## What This Means Operationally
- Daily server-local interactive login to HSD is not required if the imported session remains valid.
- When HSD expires, only an admin needs to re-import a fresh session.
- Viewer users never see the import action.

## Data and Truth Rules Preserved
- Nutanix remains the source of truth for any server present in both Nutanix and SolarWinds.
- SolarWinds fallback is used only when Nutanix is down beyond the configured threshold.
- Cards must show last synced time and real health state; no synthetic live values should be shown.

## Validation Checklist After Deployment
- `http://<server>:3000/login` loads
- viewer email can sign in
- admin email can sign in
- unauthenticated access to `/` redirects to login
- `/api/status` is blocked without a valid session
- dashboard renders over WebSocket after login
- admin settings open and save
- HSD session import succeeds
- collectors continue posting updates
- PM2 restarts the stack successfully after reboot

## Operational Commands
```powershell
pm2 status
pm2 logs
pm2 restart ecosystem.config.js --update-env
pm2 save
```

## Troubleshooting
- If login fails for all users, check `APP_AUTH_SECRET`, Postgres connectivity, and `app_user` bootstrap.
- If the wallboard loads but does not update, check `dashboard-frontdoor` and `api-gateway` PM2 logs.
- If HSD goes stale, import a fresh Symphony storage-state JSON and then confirm collector logs.
- If SolarWinds auth breaks, refresh the saved session using the existing SolarWinds login workflow.
- If the dashboard works locally but not from the LAN, check Windows firewall rules and confirm only port `3000` is exposed.

## Pre-Deployment Cleanup Scope
- Safe to remove transient `tmp/` investigation output and screenshots.
- Keep tracked runtime/bootstrap code, Postgres utilities, and guide documents.
- Do not remove collector runtime session paths under `C:\ProgramData\UAIL\itdash`.
