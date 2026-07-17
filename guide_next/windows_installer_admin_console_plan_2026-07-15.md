# Windows Installer And Admin Console Plan - 2026-07-15

## Objective
- separate wallboard/viewer UI from deployment and operational controls
- provide a Windows-native GUI setup experience
- provide a local admin console for service control, health checks, config, and session reauthentication
- keep current dashboard runtime functional during the transition

## Recommended Product Split

### 1. Wallboard Application
- purpose: viewer-facing dashboard only
- exposed on LAN
- no deployment, credential, or reauth workflows in this UI
- keeps login, RBAC, filters, and read-only health visibility

### 2. Windows Admin Console
- purpose: local/admin operational control plane
- runs on the server or approved admin workstation
- not exposed as the normal dashboard UI
- provides:
- service status
- start, stop, restart
- collector last sync and last error
- settings editor for endpoints, credentials, targets, users
- HSD session import / refresh
- SolarWinds session refresh
- runtime log viewer

### 3. Windows Installer
- purpose: guided deployment and upgrade
- configures prerequisites, paths, ports, secrets, and startup
- registers services and validates health

## Packaging Decision

### Node.js
- recommendation: include Node runtime inside the installer package
- reason:
- avoids manual Node installation on every server
- ensures exact runtime version compatibility
- makes deployment repeatable

### Postgres
- recommendation: do not embed Postgres in the main installer
- reason:
- corporate environments usually want DB ownership, backup, patching, and access controlled separately
- silent local Postgres installation adds operational risk and more upgrade complexity
- remote or separately installed Postgres is the cleaner enterprise model

## Practical Answer
- Node: bundled with installer
- Postgres: installed separately, or provisioned by DBA/infrastructure team

## Optional Secondary Mode
- if needed later, we can support an "all-in-one lab install" mode:
- bundled Node
- bundled app
- optional local Postgres bootstrap
- this should be a secondary path, not the primary corporate deployment path

## Target Deployment Model
- Windows server hosts:
- `api-gateway`
- `dashboard-ui`
- `dashboard-frontdoor`
- `nutanix-collector`
- `solarwinds-collector`
- `symphony-collector`
- runtime data under `C:\ProgramData\UAIL\itdash`
- only frontdoor port exposed to LAN
- Postgres may be local or remote, but managed independently of the wallboard installer

## Service Management Recommendation

### Phase 1
- keep current PM2-based runtime
- admin console issues controlled PM2 commands
- lowest migration risk

### Phase 2
- move to Windows-native service wrappers
- recommended options:
- `WinSW` preferred
- `NSSM` acceptable

## Installer Responsibilities
- choose install path
- choose runtime data path
- choose frontdoor port
- collect Postgres connection details
- collect initial admin and viewer emails
- collect optional collector endpoints
- write `.env` and runtime bootstrap config
- create required folders
- register and start services
- create firewall rule for frontdoor only
- run post-install health checks

## Admin Console Responsibilities
- dashboard service status:
- online/offline
- PID
- uptime
- memory and CPU where practical
- collector health:
- last sync
- last success
- last error
- stale/failing indicators
- config:
- URLs
- usernames
- passwords
- monitored server list
- SolarWinds network object IDs
- HSD workgroup metadata
- allowed viewer/admin email IDs
- session tools:
- import HSD storage-state JSON
- refresh SolarWinds session
- re-run validation
- logs:
- per-service recent logs
- copy/export logs for support

## Reauthentication Model

### HSD
- preferred implementation:
- admin console imports Playwright storage-state JSON
- stored into runtime session path on the server
- collector uses that server-side session

### SolarWinds
- same pattern as HSD where possible
- preserve existing login helper until admin-console workflow replaces it

## UI Boundaries
- wallboard must not expose:
- credentials
- service restart controls
- install/update actions
- session import controls
- raw runtime logs

## Technology Recommendation

### Installer
- `Inno Setup`
- lightweight, proven, practical for Windows enterprise packaging

### Admin Console
- `Electron`
- strongest fit with current TypeScript/Node codebase
- fastest way to build GUI around existing APIs and PM2/service commands

## Security Model
- wallboard viewers authenticate to the dashboard only
- admin console requires admin login and should be limited to server/local admins
- secrets remain in Postgres secret store or protected runtime config
- only frontdoor is exposed on LAN
- internal services remain loopback-bound

## Delivery Sequence
1. keep current dashboard and auth stack stable
2. design and scaffold admin console
3. expose only the backend endpoints needed by the admin console
4. wire PM2-based service control first
5. add session import flows
6. build installer for clean server deployment
7. remove admin operational controls from the dashboard UI
8. later migrate from PM2 to Windows-native services if needed

## Open Decisions
- whether admin console runs only on the server or can also run on approved admin laptops
- whether upgrades are in-place or side-by-side
- whether local lab mode with bundled Postgres is worth supporting

## Recommendation
- primary enterprise path:
- bundle Node with installer
- do not bundle Postgres
- keep Postgres separate
- build admin console first
- build installer second
