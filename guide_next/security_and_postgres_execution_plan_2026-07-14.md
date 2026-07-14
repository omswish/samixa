# Security and PostgreSQL Execution Plan
Date: 2026-07-14

Scope: practical execution order for hardening and storage migration of the `samixa` dashboard stack.  
Constraint: documentation only. No application changes are made by this file.

## 1. Purpose

This plan converts the current findings into a practical sequence of work.

It aligns:

- [IS_audit_2026-07-14.md](C:/Users/omkar.s/Code/samixa/guide_next/IS_audit_2026-07-14.md)
- [target_security_architecture_2026-07-14.md](C:/Users/omkar.s/Code/samixa/guide_next/target_security_architecture_2026-07-14.md)
- [postgres_migration_plan_2026-07-14.md](C:/Users/omkar.s/Code/samixa/guide_next/postgres_migration_plan_2026-07-14.md)

The recommended order is:

1. minimum perimeter hardening first
2. PostgreSQL migration second
3. auth and audit completion third

## 2. Why This Order

The immediate risk is not SQLite by itself.

The immediate risk is:

- overly exposed read/write surfaces
- weak trust boundary around `/api/update`
- session/runtime artifacts living in workspace paths

If PostgreSQL is introduced before those are contained, the application will still have a stronger database behind a weak perimeter.

Therefore:

- do the minimum hardening first
- then migrate to Postgres on the correct architecture
- then complete auth, audit, and operational controls on top of that foundation

## 3. Phase 1: Minimum Security Hardening

Goal: reduce the largest practical security risk before changing persistence.

### 3.1 Work Items

1. Restrict the gateway write path to loopback only.
   - `api-gateway` should bind to `127.0.0.1`
   - collectors should post only to `127.0.0.1:4000`
   - no non-local host should be able to reach `/api/update`

2. Put user access behind a reverse proxy.
   - users should access only the reverse proxy
   - reverse proxy should expose HTTPS
   - raw `3000` and `4000` should not be user-facing

3. Separate normal users from the wallboard display.
   - normal users: authenticated route
   - wallboard: controlled read-only kiosk route

4. Move runtime/session artifacts out of the repo tree.
   - SolarWinds and Symphony storage state
   - browser profile/session artifacts
   - protected OS path with restricted ACLs

5. Record compensating controls formally.
   - SolarWinds plaintext HTTP
   - Nutanix expired certificate
   - owner, scope, restrictions, and review date

### 3.2 Dependencies

- access to the target VM or equivalent deployment host
- reverse proxy selection and certificate plan
- service account context for protected runtime storage

### 3.3 Verification

- `/api/update` reachable only from loopback
- dashboard reachable through the intended front door only
- wallboard route has no write/admin behavior
- runtime/session files no longer live under the repo/workspace
- compensating controls documented and reviewable

### 3.4 Exit Criteria

Phase 1 is complete only when:

- the write path is not exposed to LAN users
- the user-facing path is intentionally published
- session artifact placement is corrected
- the exception posture is documented

## 4. Phase 2: PostgreSQL Migration

Goal: replace SQLite with durable storage that supports truthful history, fallback provenance, configuration management, and auditability.

### 4.1 Work Items

1. Add PostgreSQL connectivity and repository abstraction in `api-gateway`.
2. Create the runtime schema.
   - snapshots
   - asset current state
   - telemetry history
   - asset status history
   - collector runs
   - gateway ingest events

3. Create the control-plane schema.
   - local users
   - collector target config
   - encrypted collector secrets
   - write audit
   - auth audit
   - config change audit

4. Import SQLite baseline state.
   - current dashboard snapshot
   - section/source status
   - current asset values
   - available embedded history arrays

5. Add dual-write from the gateway.
   - keep SQLite as rollback path during burn-in

6. Verify parity over live traffic.
   - HCI data
   - servers
   - network
   - HSD
   - section/source health
   - fallback behavior

7. Switch reads to Postgres.
8. Decommission SQLite after stability is proven.

### 4.2 Dependencies

- Phase 1 completed
- Postgres host, backup plan, and access control defined
- encryption approach defined for recoverable collector secrets

### 4.3 Verification

- Postgres current state matches SQLite current state
- last synced timestamps remain accurate
- datalink failure and asset failure remain distinct
- Nutanix-primary / SolarWinds-fallback behavior is visible and correct
- audit tables capture live events correctly

### 4.4 Exit Criteria

Phase 2 is complete only when:

- Postgres is the trusted system of record
- rollback confidence window has passed
- history/provenance behavior is preserved correctly

## 5. Phase 3: Auth and Audit Completion

Goal: finish the application-level controls needed for a stronger internal audit posture.

### 5.1 Work Items

1. Implement SSO if feasible.
2. If SSO is delayed, implement local login fallback.
   - hash user passwords
   - role/status handling
   - auth audit

3. Persist upstream collector credentials securely.
   - encrypted at rest
   - rotation metadata
   - config-change audit

4. Strengthen gateway request validation.
   - payload schema validation
   - request attribution
   - improved ingest audit

5. Add audience separation if required.
   - kiosk projection
   - authenticated user projection
   - restricted admin/config projection

### 5.2 Dependencies

- Phase 2 completed or stable enough for auth/config persistence
- decision on SSO vs interim local auth

### 5.3 Verification

- local user auth works or SSO works
- user access is attributable
- config changes are attributable
- no plaintext human credentials are stored
- upstream secrets are recoverable only through controlled decryption

### 5.4 Exit Criteria

Phase 3 is complete only when:

- user access control is in place
- security-relevant actions are auditable
- config and credential handling match the target architecture

## 6. Recommended Immediate Next Step

Start with these two items together:

1. make the gateway write path loopback-only
2. place the dashboard behind the intended reverse-proxy/HTTPS front door

This gives the best risk reduction for the least architectural churn.

After that, move directly into the PostgreSQL migration defined in [postgres_migration_plan_2026-07-14.md](C:/Users/omkar.s/Code/samixa/guide_next/postgres_migration_plan_2026-07-14.md).

## 7. Decision Summary

Recommended sequence:

1. minimum hardening first
2. PostgreSQL migration second
3. auth/audit completion third

This is the safest practical route because it avoids:

- migrating sensitive config into a database before the trust boundary is fixed
- building auth/config persistence against the wrong deployment model
- improving storage while leaving the highest-risk exposure unchanged
