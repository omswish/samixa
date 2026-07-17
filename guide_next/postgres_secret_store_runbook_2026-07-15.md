# Postgres Secret Store Runbook - 2026-07-15

## Purpose

This runbook defines the current encrypted secret-storage model for collector credentials.

The design goal is:

- remove long-term dependency on plaintext env credentials
- keep the current wallboard runtime stable
- avoid giving collectors direct database access or encryption-key access

## Current Architecture

Current secret flow:

1. Secrets are stored encrypted in Postgres.
2. The gateway holds the master passphrase in its own process environment.
3. The gateway decrypts secrets only for loopback runtime use.
4. Collectors fetch decrypted secrets from the gateway over `127.0.0.1`.
5. If Postgres secret storage is unavailable, collectors fall back to env values.

This means the gateway is the only component that needs:

- `POSTGRES_URL`
- `POSTGRES_SECRET_PASSPHRASE`

Collectors do **not** need the Postgres passphrase.

## Tables

Secret rows:

- `collector_secret_config`

Secret audit trail:

- `collector_secret_config_audit`

## Secret Coverage

Current seeded secret rows:

- `nutanix:primary` -> `username`, `password`
- `solarwinds:servers` -> `username`, `password`
- `solarwinds:networks` -> `username`, `password`
- `symphony:primary` -> `username`, `password`

## Encryption Model

Current envelope model:

- algorithm: `aes-256-gcm`
- key derivation: `scrypt`
- per-secret random salt
- per-secret random IV
- authenticated encryption tag
- key version: `v1`

Secrets are stored only as encrypted JSON envelopes in Postgres.

## Required Environment

Gateway:

- `POSTGRES_URL`
- `POSTGRES_SSL`
- `POSTGRES_SECRET_PASSPHRASE`

Optional env fallback remains supported for now:

- `NUTANIX_USER`
- `NUTANIX_PASS`
- `SW_USER`
- `SW_PASS`
- `SYM_USER`
- `SYM_PASS`

## Runtime Endpoints

Loopback-only non-secret config:

- `GET /api/runtime-config/:source`

Loopback-only decrypted secrets:

- `GET /api/runtime-secrets/:source`

Supported sources:

- `nutanix`
- `solarwinds`
- `symphony`

## Bootstrap Behavior

When both of these are true:

- `POSTGRES_URL` is configured
- `POSTGRES_SECRET_PASSPHRASE` is configured

the gateway seeds encrypted secret rows from env only when those rows are missing.

Bootstrap is conservative:

- existing secret rows are not overwritten
- env is used only as the initial source for missing rows

## Verification Queries

### 1. Confirm secret rows exist

```sql
SELECT
  source_name,
  target_name,
  secret_name,
  key_version,
  created_at,
  updated_at
FROM collector_secret_config
ORDER BY source_name, target_name, secret_name;
```

### 2. Confirm audit rows exist

```sql
SELECT
  operation,
  count(*) AS row_count
FROM collector_secret_config_audit
GROUP BY operation
ORDER BY operation;
```

### 3. Confirm loopback runtime secret resolution

Run from the application host:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-secrets/nutanix
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-secrets/solarwinds
Invoke-RestMethod -Uri http://127.0.0.1:4000/api/runtime-secrets/symphony
```

Expected:

- top-level `backingStore = postgres`
- each target shows `secretOrigin = postgres`
- username and password are present

### 4. Confirm collectors still run

Check PM2 logs for:

- Nutanix collector posting successfully
- SolarWinds collector posting successfully
- Symphony collector posting successfully

## Secret Rotation Model

Current safe rotation path:

1. Update encrypted rows in `collector_secret_config`.
2. Verify the gateway runtime secret endpoint resolves the new values.
3. Restart the affected collector if the target system needs a fresh login/API auth cycle.
4. Verify collector success and dashboard freshness.

Current limitation:

- no admin UI exists for rotating secrets
- no dedicated CLI rotation tool exists yet

So current rotation is DBA-managed SQL only.

## Audit Queries

To inspect recent secret changes:

```sql
SELECT
  audit_id,
  config_key,
  source_name,
  target_name,
  secret_name,
  operation,
  changed_at,
  changed_by,
  session_user_name,
  application_name,
  client_addr,
  txid,
  changed_fields
FROM collector_secret_config_audit
ORDER BY audit_id DESC
LIMIT 20;
```

To inspect encrypted row snapshots:

```sql
SELECT
  audit_id,
  config_key,
  secret_name,
  operation,
  old_row_json,
  new_row_json
FROM collector_secret_config_audit
ORDER BY audit_id DESC
LIMIT 10;
```

Note:

- audit rows contain encrypted envelopes, not plaintext secrets

## Rollback

If Postgres secret resolution fails:

1. Keep env fallback values in place temporarily.
2. Restore the previous encrypted row from audit evidence or backup.
3. Verify `GET /api/runtime-secrets/:source` again.
4. Verify collector success after restart if needed.

If the master passphrase is wrong or missing:

- the gateway cannot decrypt Postgres secret rows
- collectors should still fall back to env values if those are still present

## Current Limitations

1. Secret rotation is still manual SQL.
2. No passphrase rotation workflow exists yet.
3. Existing env fallbacks are still present during rollout.
4. Collectors still load root `.env`, so plaintext env credentials may still exist locally until explicitly removed.

## Recommended Next Step

After this phase is stable:

1. Add a controlled secret rotation tool or DBA SQL playbook with prebuilt encrypted write helpers.
2. Then remove plaintext env credentials from the normal collector runtime on the server.
