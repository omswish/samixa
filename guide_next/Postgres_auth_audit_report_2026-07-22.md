# Postgres App Auth and Audit Report

Date: 2026-07-22

## Status

Implemented.

This pass completed two linked upgrades:

1. moved application login verification to a gateway-managed auth path that uses PostgreSQL as primary when available,
2. added an admin audit viewer and CSV export over the application action audit trail.

## What Changed

### 1. App login auth is now gateway-backed

The `admin` and `operator` login flow no longer depends directly on the dashboard runtime JSON file when PostgreSQL is available.

Current behavior:

- if `POSTGRES_URL` is configured, application auth credentials are resolved through the API gateway,
- PostgreSQL table `app_local_auth_credential` is the primary credential store,
- legacy runtime/env credentials are bootstrapped into PostgreSQL on startup if rows do not yet exist,
- if PostgreSQL is unavailable or no rows exist yet, the gateway falls back to the legacy runtime/env auth path so standalone behavior is preserved.

Relevant implementation:

- `api-gateway/sql/009_postgres_app_local_auth.sql`
- `api-gateway/src/localAppAuth.ts`
- `api-gateway/src/postgres.ts`
- `api-gateway/src/index.ts`
- `dashboard/src/lib/app-auth-client.ts`
- `dashboard/src/lib/server-auth.ts`
- `dashboard/src/app/api/auth/login/route.ts`
- `dashboard/src/app/api/admin/app-auth/route.ts`

### 2. Admin password changes now write through the gateway

The admin password management panel now saves through gateway endpoints instead of writing only to the dashboard runtime file.

Current behavior:

- with PostgreSQL enabled, password updates write hashed/salted credentials into `app_local_auth_credential`,
- credential table audit is captured by database trigger audit in `app_local_auth_credential_audit`,
- application action audit still records the admin action in `app_action_audit`,
- without PostgreSQL, the existing runtime file fallback remains available.

### 3. Admin audit viewer and export

Added an admin-side audit tab with:

- filter by action type,
- filter by result,
- filter by actor,
- filter by surface,
- row limit selection,
- live audit list,
- inline request/result summaries,
- CSV export endpoint.

Relevant implementation:

- `dashboard/src/app/api/admin/audit/route.ts`
- `dashboard/src/app/admin/page.tsx`

### 4. Obsolete direct dashboard auth helper removed

The previous direct dashboard-side local auth helper is no longer part of the active path and was removed to avoid split-brain behavior.

Removed:

- `dashboard/src/lib/local-auth.ts`

## Audit Scope Exposed in the UI

The viewer surfaces records from `app_action_audit`, which currently covers:

- `auth.login`
- `admin.settings.update`
- `admin.app-auth.update`
- `admin.service-control`
- `admin.session-reauth.launch`
- `admin.session-import`

This is intentionally focused on meaningful privileged actions, not routine dashboard reads.

## Fallback and Compatibility

Standalone behavior is preserved.

- PostgreSQL present:
  app auth is primary in Postgres.
- PostgreSQL absent:
  app auth falls back to legacy runtime/env behavior.
- Existing default passwords still work unless changed.
- Existing admin/operator session behavior remains unchanged.

## Validation Performed

Validated on the live stack after rebuild and restart:

- `npm run build --workspace api-gateway` passed
- `npm run build --workspace dashboard` passed
- `pm2 start ecosystem.config.js --update-env` brought the stack up cleanly
- `http://127.0.0.1:4001/api/status` returned `200`
- `http://127.0.0.1:21060/login` returned `200`
- `http://127.0.0.1:21061/login` returned `200`
- gateway `GET /api/admin/app-auth` returned `mode: postgres`
- admin login via `http://127.0.0.1:21061/api/auth/login` succeeded
- session check via `http://127.0.0.1:21061/api/auth/session` succeeded
- admin audit feed via `http://127.0.0.1:21061/api/admin/audit?limit=5` returned live rows
- admin `lastLoginAt` in auth status updated after successful login
- CSV export via `http://127.0.0.1:21061/api/admin/audit?limit=3&format=csv` returned `200` with CSV content and live audit rows

## Notes

- Current bootstrapped auth rows may show `source: env` until an admin explicitly changes the password from the UI. That is expected and correct.
- The audit CSV export route is implemented on the admin surface. JSON audit retrieval was validated directly; CSV uses the same source and filter path with different serialization.
- The old dashboard-local auth helper has been removed so the dashboard no longer maintains a separate credential validation path.

## Recommended Next Step

The next sensible step is cleanup and consolidation:

1. remove or retire the now-obsolete direct local auth helper path after one more stability cycle,
2. optionally add a compact audit summary widget on the admin overview page,
3. if needed for ISMS review, add retention/export guidance for `app_action_audit` and `app_local_auth_credential_audit`.
