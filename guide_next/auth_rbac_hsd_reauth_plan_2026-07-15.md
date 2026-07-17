# Auth, RBAC, Admin Settings, and HSD Re-Auth Plan

Date: 2026-07-15

## Objective

Add a proper login layer and role-based access control to the dashboard, introduce an admin settings surface for collector configuration, and provide an admin-only HSD re-authentication flow when the Symphony session expires.

This plan is intentionally limited to architecture and implementation sequencing. It does not change current application behavior.

## Current State

- `frontdoor-proxy` is a thin unauthenticated HTTP proxy to the Next.js dashboard.
- `dashboard` is currently public to anyone who can reach the front door.
- `api-gateway` already exposes loopback-only runtime config and runtime secret endpoints:
  - `GET /api/runtime-config/:source`
  - `GET /api/runtime-secrets/:source`
- Postgres-backed audited config and secret storage already exists for collector targets and secrets.
- The Symphony collector still depends on a saved authenticated browser session in:
  - `C:\ProgramData\UAIL\itdash\sessions\symphony\symphony-storage-state.json`
- The existing interactive re-login helper already exists:
  - `npm run login --workspace collectors/symphony`

## Requested Scope

### User roles

1. `viewer`
   - Default role for IT helpdesk and approved view-only users
   - Can view dashboard
   - Can use filters
   - Cannot change config
   - Cannot trigger collector auth flows

2. `admin`
   - Can view dashboard
   - Can use filters
   - Can manage collector settings
   - Can trigger HSD re-authentication
   - Can manage viewer allowlist

### Initial users

- Viewer:
  - `uail-dor.helpdesk@adityabirla.com`
- Admin:
  - `hil-dor.itdashboard@adityabirla.com`

### Admin settings requested

- HSD URL and credentials
- Nutanix URL and credentials, optional
- SolarWinds server URL and credentials, optional
- SolarWinds network URL and credentials, optional
- HSD exact workgroup identifiers
- SolarWinds network object IDs, up to five
- SolarWinds server targets to monitor
- Viewer user allowlist by mail ID only

## Feasibility Assessment

## 1. HSD re-auth button

Feasible, but only with an important constraint:

- A browser button clicked from a remote client cannot open a tab in the browser session running on the Windows server.
- Therefore, "open HSD in a new tab on the server only" must be implemented through a local server-side helper.

Recommended implementation:

- Add an admin-only "Re-authenticate HSD" action in the dashboard UI.
- That action calls a new loopback-only gateway/admin endpoint.
- The gateway launches the existing Symphony interactive login flow locally on the Windows server:
  - either via `npm run login --workspace collectors/symphony`
  - or a direct Node entrypoint wrapping the same login helper
- The helper opens MS Edge on the server itself and waits for login completion.

Important behavior:

- If the admin is using the dashboard remotely, the button should either:
  - be hidden unless the request originates from loopback or the server console session, or
  - remain visible but disabled with a message like `Available only on the dashboard host`

This is the cleanest way to satisfy "server only" without pretending a remote browser can control the server desktop.

## 2. RBAC and login layer

Feasible and appropriate.

Recommended model:

- Add authentication at the `dashboard` and `frontdoor-proxy` boundary, not inside collector code.
- Store application users and roles in Postgres.
- Use email as the identity key.
- Keep collector credentials separate from human login.

Recommended roles:

- `viewer`
- `admin`

Future-safe extension:

- `display` for large wall TV / kiosk mode if needed later

## 3. "No-expiry login"

Not recommended for admin users.

Safer interpretation:

- For normal users:
  - use standard session expiration with renewal
- For wallboard display:
  - use a dedicated kiosk/display mode on the Windows server
  - or a long-lived display session restricted to a single trusted machine / IP

Rationale:

- A true no-expiry admin session is difficult to defend in audit.
- A dedicated display route is much easier to justify than a universal never-expiring login.

## 4. "Screen never sleeps"

Feasible, but this is an operating system / kiosk deployment concern, not a dashboard feature.

Recommended handling:

- Document Windows power settings for the wallboard host:
  - no sleep
  - no display timeout
  - browser kiosk or startup task
- Do not try to enforce OS power behavior from the web app.

## 5. SSO feasibility

Feasible if your organization can register the dashboard as an application with the corporate identity provider.

Recommended target:

- Microsoft Entra ID / Azure AD OIDC login
- Dashboard receives verified identity from the IdP
- Application maps the returned email address to local RBAC roles in Postgres

Important clarification:

- Proper SSO does not mean "capture only mail ID and skip password/MFA ourselves".
- Proper SSO means:
  - redirect to corporate IdP
  - IdP decides password / MFA policy
  - app trusts the returned identity claims

So the app can avoid managing passwords for dashboard users, but it cannot safely bypass corporate MFA policy by itself.

## 6. Optional collectors

Fully feasible.

Recommended behavior:

- All collector targets become individually enable/disable-able
- UI must state clearly:
  - configured and enabled
  - configured but disabled
  - unconfigured
  - failed

That fits the existing truthful-status rule already used elsewhere in the dashboard.

## 7. Admin-configured server targeting

Feasible and preferable.

Recommended data model:

- Admin maintains an explicit monitored server inventory for SolarWinds server collection
- Each target stores:
  - display label
  - matching hostname or node caption
  - source preference
  - enabled flag
  - notes

Suggested source preference rules:

- `prefer_nutanix`
- `prefer_solarwinds`
- `nutanix_only`
- `solarwinds_only`

This supports your existing rule that Nutanix is the source of truth when both sources exist.

## Proposed Architecture

## A. User authentication

- Add application auth middleware to the Next.js app or front door
- Sessions stored in secure HTTP-only cookies
- Postgres-backed user table
- Role checks enforced on:
  - page access
  - settings API routes
  - re-auth action routes

## B. Admin settings plane

- Add authenticated dashboard API routes for admin settings
- Those routes call the loopback gateway endpoints or Postgres directly on the same host
- Settings UI opened from a gear icon in the top bar

Recommended settings sections:

1. HSD
2. Nutanix
3. SolarWinds Servers
4. SolarWinds Networks
5. Monitored Servers
6. Viewer Access

## C. HSD re-auth control plane

- Add gateway endpoint:
  - `POST /api/admin/symphony/reauth`
- Restrict it to:
  - authenticated admin session
  - loopback host only for actual browser launch
- Endpoint starts the existing interactive login helper
- UI polls re-auth status
- After successful login, collector continues using refreshed storage state

Recommended status states:

- `idle`
- `required`
- `in_progress`
- `completed`
- `failed`

## D. Wallboard display mode

Recommended two-mode model:

1. Normal user mode
   - login required
   - RBAC enforced

2. Display mode
   - intended for dedicated TV / kiosk host only
   - restricted by local machine, allowlisted IP, or dedicated display token
   - view-only
   - no settings access

This avoids forcing the helpdesk/admin credentials to remain permanently logged in on a TV.

## Proposed Data Model Additions

## 1. Application users

Suggested table:

- `app_user`
  - `user_id`
  - `email`
  - `display_name`
  - `role`
  - `enabled`
  - `created_at`
  - `updated_at`
  - `last_login_at`

## 2. Application sessions

Suggested table:

- `app_session`
  - `session_id`
  - `user_id`
  - `created_at`
  - `expires_at`
  - `last_seen_at`
  - `client_ip`
  - `user_agent`

## 3. Display clients

Optional but recommended if kiosk mode is required:

- `display_client`
  - `display_id`
  - `label`
  - `client_ip` or `device_key`
  - `enabled`
  - `created_at`
  - `updated_at`

## 4. Monitored server inventory

Suggested table:

- `collector_monitored_server`
  - `server_id`
  - `label`
  - `match_value`
  - `match_type`
  - `source_preference`
  - `enabled`
  - `notes`
  - `created_at`
  - `updated_at`

## 5. Network targets

Suggested table:

- `collector_network_target`
  - `network_target_id`
  - `label`
  - `net_object_id`
  - `enabled`
  - `sort_order`
  - `notes`
  - `created_at`
  - `updated_at`

## 6. HSD workgroup mapping

Suggested table:

- `collector_hsd_workgroup`
  - `workgroup_id`
  - `label`
  - `exact_identifier`
  - `enabled`
  - `notes`
  - `created_at`
  - `updated_at`

## API Plan

## Viewer/admin auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

If SSO is enabled later:

- `GET /api/auth/sso/start`
- `GET /api/auth/sso/callback`

## Admin settings

- `GET /api/admin/settings`
- `PUT /api/admin/settings/hds`
- `PUT /api/admin/settings/nutanix`
- `PUT /api/admin/settings/solarwinds/servers`
- `PUT /api/admin/settings/solarwinds/networks`
- `GET /api/admin/monitored-servers`
- `PUT /api/admin/monitored-servers`
- `GET /api/admin/network-targets`
- `PUT /api/admin/network-targets`
- `GET /api/admin/hsd-workgroups`
- `PUT /api/admin/hsd-workgroups`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`

## Admin collector actions

- `POST /api/admin/symphony/reauth`
- `GET /api/admin/symphony/reauth-status`

## UX Plan

## Top bar

- Add gear icon for admins only
- Add user avatar or email indicator
- Add logout action

## HSD card

- When Symphony auth/session is healthy:
  - no admin re-auth prompt
- When auth/session failure is detected:
  - show compact data-link status as today
  - for admins only, show `Re-authenticate` action

## Settings UI

- Modal or side sheet from gear icon
- Use sections, not one long form
- Keep optional collectors visually explicit

## Viewer experience

- Same dashboard visuals
- No settings icon
- Filters remain available

## Delivery Phases

## Phase 1: foundations

- Add app user/session schema
- Seed initial viewer and admin users
- Add login/logout/session endpoints
- Add route protection for dashboard and admin APIs

## Phase 2: admin settings

- Build audited settings APIs
- Build settings UI
- Connect settings to existing Postgres-backed runtime config and secret stores

## Phase 3: HSD re-auth

- Add Symphony re-auth status model
- Add loopback-only server-side launch endpoint
- Add admin-only UI action and status polling

## Phase 4: wallboard display mode

- Add dedicated display route or display session mode
- Restrict to trusted machine/IP/token
- Document Windows kiosk startup

## Phase 5: optional SSO

- Integrate corporate OIDC if available
- Map returned email to local RBAC role
- Keep local fallback admin access until SSO is proven stable

## Key Open Points

These need explicit confirmation before implementation:

1. Should the wall TV use:
   - a dedicated view-only display mode, or
   - a permanently logged-in viewer account?

2. Should the admin settings UI be accessible:
   - from any admin browser on the LAN, or
   - only from the dashboard host?

3. For HSD re-auth:
   - should the re-auth button be visible but disabled for remote admins, or
   - hidden unless the admin is on the dashboard host itself?

4. For user management:
   - do you want only allowlist-based viewer creation by email, or
   - full user enable/disable with role edits in the UI?

5. For SSO:
   - can your IT/identity team register this dashboard as an enterprise application in the corporate IdP?

## Recommended Decisions

If you want the least risky implementation path:

1. Build local app auth and RBAC first
2. Add admin settings next
3. Add HSD server-local re-auth after that
4. Keep display mode separate from normal user auth
5. Treat SSO as a second-phase integration, not a first dependency

## Compatibility With Current Standalone Functionality

This plan can be implemented without breaking current collector behavior if done in the recommended order.

Key reason:

- collectors already pull their config and secrets from loopback-only gateway endpoints
- the new auth layer would apply to human users at the dashboard/front-door level
- collector-to-gateway behavior can stay unchanged during the initial auth/RBAC rollout

The only area that needs careful handling is the HSD re-auth launcher, because it must interact with the server desktop session deliberately and only for authorized admins.
