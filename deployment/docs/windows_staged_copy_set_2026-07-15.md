# Windows Staged Copy Set - 2026-07-15

## Purpose
This is the exact file and folder set required when you want to deploy with the staged package and the single batch entrypoint instead of using the compiled installer.

## Minimum Copy Set
Copy the following from the repository `deployment` folder to the target Windows server, preserving the same relative structure:

- `deployment\deploy-windows-server.bat`
- `deployment\installer\support\`
- `deployment\staging\current\app\`
- `deployment\staging\current\runtime\`
- `deployment\staging\current\runtime-tools\`
- `deployment\staging\current\metadata\`

## Recommended Target Layout
Copy them under one root folder on the server, for example:

- `C:\Deploy\samixa\deployment\deploy-windows-server.bat`
- `C:\Deploy\samixa\deployment\installer\support\...`
- `C:\Deploy\samixa\deployment\staging\current\app\...`
- `C:\Deploy\samixa\deployment\staging\current\runtime\...`
- `C:\Deploy\samixa\deployment\staging\current\runtime-tools\...`
- `C:\Deploy\samixa\deployment\staging\current\metadata\...`

The batch file expects that relative layout. Do not flatten it.

## Not Required For Batch-Based Deployment
These are not required on the target server if you are using only the staged batch deployment path:

- `deployment\runtime-tools\` source workspace
- `deployment\installer\output\utkal-it-dashboard-setup.exe`
- `deployment\docs\`
- `deployment\release\artifact-hashes-2026-07-15.md`

## What The Batch File Does
`deploy-windows-server.bat` calls:
- `deployment\installer\support\provision-staged-deployment.ps1`

That script then:
- copies the staged application payload into `C:\Program Files\UAIL\ITDashboard`
- creates `C:\ProgramData\UAIL\itdash`
- prompts for Postgres and runtime values
- writes `app\.env`
- validates Postgres connectivity
- patches the service manifest for the selected operator and admin ports
- optionally creates the firewall rules
- optionally starts the PM2 stack
- optionally registers autostart

## How To Run
Open an elevated Command Prompt in the copied `deployment` folder and run:

```bat
deploy-windows-server.bat
```

Optional dry run:

```bat
deploy-windows-server.bat -DryRun
```

Optional explicit values:

```bat
deploy-windows-server.bat -PostgresHost localhost -PostgresPort 5432 -PostgresDatabase hil-dor-itdash -PostgresUser postgres -PostgresSsl false -OperatorPort 21060 -AdminPort 21061
```

Fully unattended run:

```bat
deploy-windows-server.bat -NonInteractive -PostgresHost localhost -PostgresPort 5432 -PostgresDatabase hil-dor-itdash -PostgresUser postgres -PostgresPassword sa -PostgresSecretPassphrase your-secret-passphrase -PostgresSsl false -OperatorPort 21060 -AdminPort 21061
```
