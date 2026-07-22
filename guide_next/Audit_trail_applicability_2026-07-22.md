# Audit Trail Applicability and Implementation

Date: 2026-07-22

## Conclusion

Yes. An audit trail is applicable for this application, but only for privileged and state-changing actions.

It is justified here because the application:

- stores and changes collector endpoints, usernames, and encrypted secrets,
- allows privileged operators to start, stop, and restart runtime services,
- launches session reauthentication helpers that affect live data collection,
- changes dashboard access passwords for `admin` and `operator`,
- uses PostgreSQL as the operational source for current and historical metric data.

It is **not** useful to log every dashboard read, websocket refresh, or normal wallboard page view. That would create noise without materially improving accountability or ISMS evidence.

## What Is Now Audited

Application-level audit records are now written into PostgreSQL table `app_action_audit`.

Covered actions:

- `auth.login`
- `admin.settings.update`
- `admin.app-auth.update`
- `admin.service-control`
- `admin.session-reauth.launch`
- `admin.session-import`

Each record captures:

- timestamp,
- action type,
- result (`success`, `failed`, `denied`),
- severity,
- actor username and role when known,
- surface (`admin` or `operator`),
- client source IP when forwarded,
- user agent,
- target type and target identifier,
- short message and error message,
- sanitized request summary JSON,
- sanitized result summary JSON.

## Existing Database Audit Already Present

The application already had table-trigger audit coverage for some configuration entities:

- `collector_target_config_audit`
- `collector_secret_config_audit`
- `app_user_audit`

Those remain useful because they capture row-level database changes. The new `app_action_audit` fills the application-layer gap by recording **who initiated the change through the UI or API route and whether it succeeded**.

In practice:

- trigger audit answers: "what row changed in the database?"
- app action audit answers: "who tried to do what, from where, and what happened?"

Both are needed for a clean operational audit story.

## Scope Boundaries

The following are intentionally out of scope for the audit trail:

- dashboard page views,
- websocket metric broadcasts,
- every collector poll cycle,
- every metric update written into telemetry history,
- raw secrets or passwords,
- full request bodies containing credentials.

Reason:

- these either already exist elsewhere (`collector_run`, `gateway_ingest_event`, telemetry history),
- or would create excess noise,
- or would create a new security issue by storing sensitive values in the audit log.

## Security and ISMS Value

This audit trail materially helps with corporate review because it provides:

- accountability for admin actions,
- evidence of denied and failed privileged attempts,
- separation between operator view activity and admin control activity,
- sanitized operational history without exposing secrets,
- correlation between UI actions and database-level configuration changes.

It is also aligned with the current architecture because PostgreSQL is already the correct durable store for:

- current dashboard state,
- historic telemetry used for charts,
- collector run history,
- gateway ingest events,
- configuration and secret metadata,
- administrative audit evidence.

## Current Limitations

The audit trail is useful, but not complete in a compliance-maximum sense.

Current limitations:

- local app passwords are still managed in runtime file storage rather than a database-backed identity store,
- source IP depends on forwarded headers from the frontdoor path,
- there is no dedicated audit viewer UI yet,
- privileged reads of admin pages are not individually logged,
- collector-internal actions are still represented mainly by `collector_run` and `gateway_ingest_event`, not by per-step forensic trails.

## Recommended Next Step

The right next step is not "log everything." The right next step is:

1. keep this focused admin/action audit in PostgreSQL,
2. use PostgreSQL retention and backup policies for durability,
3. later move local application credentials and user administration into PostgreSQL-backed auth if stronger control evidence is required,
4. add a small admin audit view/export only if operations or IS review actually needs it.

## Verification Performed

Verified after implementation:

- denied admin settings update without session created an `app_action_audit` record,
- denied admin login created an `app_action_audit` record,
- successful admin login created an `app_action_audit` record,
- denied authenticated reauth launch with invalid workflow created an actor-attributed `app_action_audit` record,
- application builds passed for `api-gateway` and `dashboard`,
- PM2 services for gateway and dashboard surfaces were restarted and remained online.
