# SQLite Deployment Migration Plan - 2026-07-19

## Objective

Reduce deployment complexity for the Windows server release by removing PostgreSQL as a required runtime dependency while preserving:

- live dashboard rendering
- collector ingestion
- operator/admin login surfaces
- admin source configuration
- HSD and SolarWinds session recovery workflows

## Current State

The application already uses SQLite as the primary live runtime store for dashboard state in the API gateway. PostgreSQL is currently used as an overlay for:

- collector target configuration
- encrypted collector secret storage
- admin settings save operations
- mirrored history/audit-oriented datasets

This means the dashboard can run without PostgreSQL, but the admin settings save path becomes effectively unusable when PostgreSQL is absent.

## Problem Summary

The current deployment model is heavier than required for the wallboard use case:

- installer complexity increases because PostgreSQL must be provisioned, validated, and maintained
- source credentials are split between `.env`, runtime files, and optional PostgreSQL state
- second-machine deployment becomes more fragile because the dashboard stack can start before the system is meaningfully configured
- support burden rises because the deployed system has more moving parts than the current operational need justifies

## Target State

The release should run in a SQLite-first, file-configured mode:

- SQLite remains the primary runtime data store for dashboard state
- collector targets and credentials are stored in a local runtime configuration file
- secrets in that file remain encrypted using an application passphrase
- admin settings load/save work without PostgreSQL
- collectors resolve configuration in this order:
  1. local runtime config file
  2. environment variables
  3. built-in defaults

PostgreSQL support may remain in code as an optional future path, but it must not be required for deployment or normal operation.

## Scope

### In Scope

- introduce a local collector configuration store under the runtime directory
- support encrypted local storage of source usernames/passwords
- change admin settings save/load to use local store when PostgreSQL is not enabled
- keep collector runtime config/secret resolution working without PostgreSQL
- simplify deployment scripts and `.env.example` for SQLite-first operation
- document the new runtime paths and deployment behavior

### Out of Scope

- removing all PostgreSQL code from the repository
- redesigning operator/admin authentication
- replacing PM2 or Next.js deployment model
- implementing enterprise SSO

## Proposed Design

### Runtime Config Storage

Add a local configuration file under:

- `C:\ProgramData\UAIL\ITDashboard\config\collector-settings.json`

The file stores:

- collector targets
- poll intervals
- notes and metadata
- encrypted secrets for usernames/passwords

### Secret Protection

Use the existing AES-GCM secret envelope model with a generalized passphrase variable:

- new preferred variable: `SECRET_STORE_PASSPHRASE`
- backward compatibility: fall back to `POSTGRES_SECRET_PASSPHRASE`

This avoids coupling encryption to PostgreSQL naming.

### Runtime Resolution Order

For collector target config:

1. local file config
2. PostgreSQL config if explicitly enabled later
3. environment defaults

For collector secrets:

1. local encrypted file secrets
2. PostgreSQL secrets if explicitly enabled later
3. environment defaults

### Admin Save Behavior

`/api/admin/settings` should:

- load from local config when PostgreSQL is disabled
- save to local config when PostgreSQL is disabled
- continue to support PostgreSQL if explicitly configured in the future

## Implementation Steps

1. Add a runtime path utility for shared app-data/config locations.
2. Add a local collector config store module for file read/write and encrypted secret handling.
3. Update runtime config resolution to support local file-backed targets.
4. Update runtime secret resolution to support local encrypted secrets.
5. Update admin settings GET/PUT in the API gateway to use the local store when PostgreSQL is absent.
6. Generalize secret passphrase naming away from PostgreSQL-specific wording.
7. Simplify deployment scripts to stop requiring PostgreSQL for the default install path.
8. Update `.env.example` and deployment docs.
9. Validate admin settings round-trip, collector resolution, and startup behavior.

## Expected Functional Impact

### Preserved

- live dashboard
- local auth for `admin` and `operator`
- collector ingest
- source configuration through admin UI
- session inspection and reauth tooling

### Removed From Default Release Path

- PostgreSQL-backed history mirror
- PostgreSQL-backed collector config tables
- PostgreSQL-backed collector secret tables
- PostgreSQL-specific audit trails

## Risks

### Risk: Secret file corruption

Mitigation:

- atomic write pattern
- schema validation on load
- env/default fallback when file is invalid

### Risk: Existing deployments with PostgreSQL

Mitigation:

- keep PostgreSQL code paths optional rather than ripping them out
- prefer local store only when PostgreSQL is not enabled

### Risk: Local file permissions

Mitigation:

- store under `ProgramData`
- document service-account and admin-only access expectations

## Verification Plan

### App Verification

- admin page loads source settings without PostgreSQL configured
- admin can save Nutanix, SolarWinds, and HSD settings successfully
- saved values survive service restart
- collectors use saved values after restart

### Deployment Verification

- setup path no longer requires PostgreSQL
- PM2 bootstraps successfully with SQLite-only runtime
- operator and admin surfaces remain reachable

## Decision

Proceed with SQLite-first deployment for the current release. Keep PostgreSQL as optional future capability, not as a required dependency.
