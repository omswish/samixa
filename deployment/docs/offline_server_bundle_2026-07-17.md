# Offline Server Bundle - 2026-07-17

## Purpose
This bundle is the no-internet deployment package for a Windows server.

It includes:
- the staged dashboard payload with bundled `node_modules`
- the bundled Node runtime
- bundled PM2 runtime tools
- optional bundled PostgreSQL 18 server runtime when it is available in the packaging environment
- optional local PostgreSQL VC++ redistributable installer when bundled PostgreSQL is included
- batch and PowerShell entrypoints for full offline installation

There is no separate admin desktop application in this bundle.
Admin operations are done through the web admin surface on port `21061`.

Current session-recovery behavior in the bundled app:
- the admin Sessions page validates saved HSD and SolarWinds browser sessions against the live portals
- HSD recovery exposes both:
  - a server-local interactive reauthentication helper
  - a separate legacy-profile import helper
- helper launcher scripts are written under `C:\ProgramData\UAIL\ITDashboard\admin\reauth`

## Primary Entry Point
Run as administrator:

```bat
install-offline-server.bat
```

That entrypoint:
1. optionally installs the bundled PostgreSQL runtime locally when requested
2. optionally initializes a PostgreSQL data directory and service when bundled PostgreSQL is used
3. deploys the dashboard stack into a single writable runtime root
4. writes `.env`
5. validates PostgreSQL connectivity only when PostgreSQL is configured
6. optionally creates the Windows Firewall rules
7. optionally starts the dashboard stack and registers autostart

## Non-Interactive Example

```bat
install-offline-server.bat -NonInteractive -SkipPostgresInstall -SecretStorePassphrase your-secret-passphrase -NutanixUser nutanix-user -NutanixPassword nutanix-pass -SolarWindsUser sw-user -SolarWindsPassword sw-pass
```

You can override defaults such as:
- `-SkipPostgresInstall`
- `-SecretStorePassphrase`
- `-OperatorPort`
- `-AdminPort`
- `-InstallRoot`
- `-RuntimeRoot`
- `-PostgresPort`
- `-PostgresDatabase`
- `-PostgresInstallRoot`
- `-PostgresDataRoot`

## Default Install Paths
- PostgreSQL binaries: `C:\Program Files\UAIL\PostgreSQL\18`
- PostgreSQL data: `C:\ProgramData\UAIL\postgresql-18\data`
- Dashboard app/runtime root: `C:\ProgramData\UAIL\ITDashboard`

## Web Surfaces After Install
- operator: `http://<server>:21060/login`
- admin: `http://<server>:21061/login`

## Included App-Only Entry Point
If PostgreSQL is already available and you only want to deploy the dashboard payload:

```bat
deploy-windows-server.bat
```
