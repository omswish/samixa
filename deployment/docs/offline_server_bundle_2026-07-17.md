# Offline Server Bundle - 2026-07-17

## Purpose
This bundle is the no-internet deployment package for a Windows server.

It includes:
- the staged dashboard payload with bundled `node_modules`
- the bundled Node runtime
- bundled PM2 runtime tools
- bundled PostgreSQL 18 server runtime
- local PostgreSQL VC++ redistributable installer
- batch and PowerShell entrypoints for full offline installation

There is no separate admin desktop application in this bundle.
Admin operations are done through the web admin surface on port `21061`.

Current session-recovery behavior in the bundled app:
- the admin Sessions page validates saved HSD and SolarWinds browser sessions against the live portals
- HSD recovery exposes both:
  - a server-local interactive reauthentication helper
  - a separate legacy-profile import helper
- helper launcher scripts are written under `C:\ProgramData\UAIL\itdash\admin\reauth`

## Primary Entry Point
Run as administrator:

```bat
install-offline-server.bat
```

That entrypoint:
1. installs the bundled PostgreSQL runtime locally
2. initializes a PostgreSQL data directory
3. registers and starts the PostgreSQL Windows service
4. creates the application database
5. deploys the dashboard stack
6. writes `.env`
7. validates PostgreSQL connectivity
8. optionally creates the Windows Firewall rules
9. optionally starts the dashboard stack and registers autostart

## Non-Interactive Example

```bat
install-offline-server.bat -NonInteractive -PostgresPassword sa -PostgresSecretPassphrase your-secret-passphrase
```

You can override defaults such as:
- `-PostgresPort`
- `-PostgresDatabase`
- `-OperatorPort`
- `-AdminPort`
- `-InstallRoot`
- `-RuntimeRoot`
- `-PostgresInstallRoot`
- `-PostgresDataRoot`

## Default Install Paths
- PostgreSQL binaries: `C:\Program Files\UAIL\PostgreSQL\18`
- PostgreSQL data: `C:\ProgramData\UAIL\postgresql-18\data`
- Dashboard app: `C:\Program Files\UAIL\ITDashboard`
- Dashboard runtime: `C:\ProgramData\UAIL\itdash`

## Web Surfaces After Install
- operator: `http://<server>:21060/login`
- admin: `http://<server>:21061/login`

## Included App-Only Entry Point
If PostgreSQL is already available and you only want to deploy the dashboard payload:

```bat
deploy-windows-server.bat
```
