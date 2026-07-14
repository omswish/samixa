# Target Security Architecture
Date: 2026-07-14

Scope: target-state security design for the `samixa` dashboard stack, based on the current architecture and the agreed operational model:

- dedicated VM for application runtime
- large wallboard display required
- users access via browser
- collectors run on the same VM
- no application code changes in this document

## 1. Objective

Move the current design from:

- directly exposed gateway/dashboard
- locally stored session artifacts in workspace paths
- weak write-path trust

to a model that is operationally practical and significantly closer to corporate ISMS acceptance.

This is a **target architecture note**, not an implementation record.

## 2. Recommended Deployment Model

### Core principle

Separate the system into:

1. **Internal collector plane**
2. **User-facing dashboard plane**
3. **Fixed wallboard kiosk plane**

### Recommended host model

Deploy the full stack on **one dedicated VM**:

- `nutanix-collector`
- `solarwinds-collector`
- `symphony-collector`
- `api-gateway`
- `dashboard-ui`
- reverse proxy in front of `dashboard-ui`

This is acceptable because the highest-risk write path can then remain **local-only**.

## 3. Trust Boundary Design

### Boundary A: Upstream source systems

External dependencies:

- Nutanix
- SolarWinds 45 / 46
- Symphony / HSD

Risk:

- credentials and sessions are required for access
- some upstream controls are outside application ownership

Control goal:

- isolate and minimize the blast radius of these source connections

### Boundary B: Internal collector-to-gateway path

This is the most important change.

Target state:

- collectors send updates to `api-gateway` on `127.0.0.1` only
- `api-gateway` does **not** listen on LAN for write traffic

Result:

- `/api/update` is no longer exposed to other LAN hosts
- separate collector API keys become optional rather than mandatory in the first hardening step

### Boundary C: User-facing read path

Users should **not** connect directly to the gateway.

Target state:

- users connect only to reverse proxy
- reverse proxy serves dashboard over HTTPS
- reverse proxy forwards read-only traffic to `dashboard-ui`

### Boundary D: Fixed wallboard display

The wallboard display can be treated as a separate read-only audience.

Target state:

- dedicated route or dedicated browser session for kiosk display
- no admin capability
- no write capability
- minimal interaction surface

## 4. Network and Port Layout

### Internal-only services

Bind these to loopback only:

- `api-gateway`: `127.0.0.1:4000`

Collectors should post only to:

- `http://127.0.0.1:4000/api/update`

This is acceptable because traffic never leaves the host.

### User-facing services

Expose only the reverse proxy to the network:

- reverse proxy: `443/tcp`

Do not expose directly:

- `4000`
- raw `3000`

### Firewall posture

On the VM:

1. Allow inbound `443` only from approved user networks.
2. Block inbound `4000` from all non-loopback sources.
3. Block inbound `3000` from all non-loopback sources unless temporarily needed for maintenance.
4. Restrict outbound traffic to only:
   - Nutanix host/port
   - SolarWinds hosts/ports
   - Symphony URL
   - time/DNS/AD dependencies if needed

## 5. Authentication Model

### Preferred model: SSO

Best option:

- SSO via corporate IdP / AD / Entra ID
- authorization by allowed email IDs or security group membership

Recommended authorization rule:

- only approved users or groups can access the standard dashboard

Examples:

- `UAIL-IT-Wallboard-Users`
- `UAIL-IT-Ops`
- `UAIL-IT-Managers`

### Fallback model: local dashboard login

If SSO is not feasible immediately:

- local application login is acceptable as an interim control
- passwords must be **hashed**, not encrypted
- use a strong password hashing algorithm:
  - Argon2id preferred
  - bcrypt acceptable

This only applies to **human users of the dashboard**, not collector credentials.

### Kiosk / wallboard login model

For the large display:

- a **no-login kiosk view** is acceptable
- but only if tightly controlled

Recommended controls:

1. Dedicated device only
2. Fixed source IP if possible
3. Read-only route
4. No settings panel
5. No access to raw APIs
6. Session locked to the wallboard purpose

So the final split should be:

- normal users: authenticated
- wallboard display: controlled kiosk access

## 6. Secret and Credential Storage Model

## 6.1 Human dashboard users

If local login exists:

- store user passwords **hashed** in DB
- never store them plaintext or reversibly encrypted

Recommended DB fields:

- `user_id`
- `email`
- `display_name`
- `password_hash`
- `role`
- `status`
- `created_at`
- `last_login_at`

## 6.2 Collector upstream credentials

For Nutanix / SolarWinds / Symphony:

- passwords must be **recoverable by the collector**
- therefore they must be **encrypted at rest**, not hashed

Recommended storage options, in order:

1. Enterprise secret manager
2. OS-protected secret store
3. DB encrypted with machine/service-account protected key

If stored in DB:

- encrypt the credential value
- key must not live in the same plain config file
- key should be protected via Windows DPAPI or equivalent machine-bound secret

Recommended DB fields:

- `source_name`
- `target_url`
- `username`
- `encrypted_password`
- `credential_version`
- `last_rotated_at`
- `owner`
- `enabled`

### Service account position

Using a service account is acceptable and expected.

Requirements:

1. Dedicated to this application
2. Not shared with human users
3. Minimum required privilege
4. Documented owner
5. Rotated periodically
6. Logged/monitored

## 7. Session Artifact Handling

You already stated session persistence is operationally required. That is acceptable.

The control issue is **where and how** sessions are stored.

### Target state

Do not store session artifacts inside the repo/workspace tree.

Move them to a protected runtime path such as:

- `C:\ProgramData\UAIL\itdash\sessions\`

Subpaths:

- `C:\ProgramData\UAIL\itdash\sessions\solarwinds\`
- `C:\ProgramData\UAIL\itdash\sessions\symphony\`

### Required controls

1. NTFS ACLs restricted to:
   - service account
   - local administrators
2. No interactive user write access
3. Exclude from casual shares/sync tools
4. Define retention and cleanup rules
5. Avoid storing unnecessary browser profile data if storage-state alone is enough

## 8. Plaintext HTTP / WS Compensating Control Plan

### 8.1 Collector to gateway

If kept on loopback only:

- plaintext `http://127.0.0.1` is acceptable as a compensating control
- because traffic never leaves the VM

This should be the immediate target.

### 8.2 Dashboard to users

This should **not** remain plaintext.

Target state:

- HTTPS via reverse proxy
- secure cookies if login is used
- WSS for dashboard WebSocket path

### 8.3 SolarWinds upstream traffic

If SolarWinds only supports HTTP in your environment:

document the exception and apply compensating controls:

1. Dedicated VM
2. Source/destination ACLs
3. No internet exposure
4. Isolated internal segment/VLAN where possible
5. Firewall rules limited to exact host pairs
6. Service account with least privilege
7. Risk acceptance signed by infrastructure/security owner

### 8.4 Compensating control statement

Suggested posture:

> Plaintext transport to SolarWinds is tolerated only on a restricted internal network path, from a dedicated collector VM, with host firewall restrictions, no external exposure, and documented risk acceptance pending upstream HTTPS enablement.

## 9. Nutanix Expired Certificate Compensating Control Plan

This does remain a valid finding unless addressed.

### Preferred fix

- renew/replace the expired Nutanix certificate

### If immediate renewal is not possible

Use a formal compensating control package:

1. Dedicated VM only
2. Firewall restrict collector outbound only to the Nutanix host/port
3. No shared host use
4. Document certificate exception with expiry/review date
5. If technically feasible later, replace global TLS disable with targeted certificate pinning/fingerprint validation

### Important note

"Certificate is expired and cannot currently be fixed" is a workable **exception statement**, not a security resolution. It must be formally tracked.

## 10. API Write-Path Security Position

You asked whether `/api/update` is effectively safe because the upstream scrape is authenticated.

Answer:

- not by itself
- but it becomes practically acceptable if `/api/update` is loopback-only on the dedicated VM

### Phase 1 acceptable control

- bind gateway to `127.0.0.1`
- collectors call `127.0.0.1`
- no LAN write exposure

### Phase 2 stronger control

Add collector identity anyway:

- local shared secret
- or signed request token
- or mTLS if architecture later expands across hosts

## 11. Database Target Model

You already want PostgreSQL. That is a good next step.

### Postgres should store

1. User accounts
2. Encrypted collector config
3. Dashboard state
4. Historical collector results
5. Audit trail

### Postgres should not store plaintext unnecessarily

Avoid:

- plaintext user passwords
- unencrypted upstream credentials

### Required audit tables

At minimum:

#### `collector_write_audit`

- `id`
- `timestamp`
- `collector_name`
- `section_name`
- `result`
- `error_message`
- `request_checksum`
- `source_host`
- `duration_ms`

#### `auth_audit`

- `id`
- `timestamp`
- `user_id`
- `email`
- `action`
- `ip_address`
- `user_agent`
- `result`

#### `config_change_audit`

- `id`
- `timestamp`
- `actor`
- `changed_object`
- `change_type`
- `before_checksum`
- `after_checksum`

## 12. Reverse Proxy Target

Recommended reverse proxy responsibilities:

1. HTTPS termination
2. SSO integration
3. IP allowlisting where needed
4. Security headers
5. Optional kiosk route separation

### Example logical routing

- `/dashboard` -> authenticated user dashboard
- `/wallboard` -> kiosk read-only route
- no external route to `/api/update`
- no external route to raw gateway admin/debug endpoints

## 13. Minimum Viable Audit Improvement Plan

To move from current `Fail` toward "conditionally acceptable", the smallest practical package is:

1. Dedicated VM deployment
2. `api-gateway` loopback-only
3. collectors loopback-only to gateway
4. dashboard exposed only through HTTPS reverse proxy
5. SSO for users if possible, else local login
6. kiosk route for wallboard display
7. runtime sessions moved out of repo/workspace and ACL-protected
8. formal compensating control record for:
   - SolarWinds HTTP
   - Nutanix expired certificate
9. Postgres migration with audit tables

## 14. Final Position

Your proposed direction is valid with one important correction:

- **hashing** is for local dashboard users
- **encryption** is for upstream collector credentials

The strongest practical design for your case is:

- collectors and gateway on one dedicated VM
- gateway write path local-only
- dashboard exposed via proxy
- authenticated users for normal access
- controlled kiosk access for the large display
- encrypted collector credentials
- hashed local user passwords if SSO is unavailable
- documented network and certificate compensating controls

This is the target state I would recommend implementing before the next formal IS review.
