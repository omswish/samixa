# Windows Server Rollout Checklist

Use this checklist for the final target-machine deployment of the UAIL IT Dashboard.

## Artifacts

- Installer: `deployment/installer/output/utkal-it-dashboard-setup.exe`
- Installer zip: `deployment/installer/output/utkal-it-dashboard-setup.zip`
- Offline bundle zip: `deployment/release/utkal-it-dashboard-offline-server-bundle-2026-07-25.zip`
- Hash manifest: `deployment/release/artifact-hashes-2026-07-25.md`

## Before Install

- Confirm the target machine is a dedicated Windows server or wallboard host.
- Confirm outbound network access exists to Nutanix, SolarWinds 45, SolarWinds 46, and HSD.
- Confirm Microsoft Edge is installed for HSD and SolarWinds reauthentication helpers.
- Confirm the target machine has a logged-in admin session available when HSD reauthentication is needed.
- Confirm ports `21060` and `21061` are free on the target machine.
- Confirm Windows Defender or endpoint controls allow the signed or approved installer payload to run.
- Verify the installer or zip SHA256 values against `artifact-hashes-2026-07-25.md`.

## Install

- Run `utkal-it-dashboard-setup.exe` as administrator.
- Enter separate source settings for:
  - Nutanix
  - SolarWinds Servers (`45`)
  - SolarWinds Networks (`46`)
  - HSD
- Enter app login IDs and passwords for:
  - `admin`
  - `operator`
- Complete the installer and allow firewall/bootstrap actions.

## Immediate Validation

- Open `http://<server>:21060/login` and confirm the operator login screen loads.
- Open `http://<server>:21061/login` and confirm the admin login screen loads.
- Log into admin and verify the Services view shows:
  - `api-gateway`
  - `nutanix-collector`
  - `solarwinds-collector`
  - `symphony-collector`
  - `dashboard-ui`
  - `dashboard-frontdoor-operator`
  - `dashboard-frontdoor-admin`
- Confirm the dashboard renders without chunk-load or 500 errors.
- Confirm the admin Sources view shows saved hosts and usernames for each configured source.

## Source Validation

- Nutanix:
  - confirm HCI metrics populate
  - confirm server rows populate
- SolarWinds 46:
  - confirm both network links render
  - confirm sparklines and status pills update
- SolarWinds 45:
  - confirm non-Nutanix server enrichment appears where expected
- HSD:
  - confirm queue tiles populate
  - confirm admin session state is valid
  - if expired, use server-local HSD reauthentication from admin

## Restart / Auto-Heal Validation

- Reboot the target machine once after installation.
- After restart, confirm the operator and admin URLs recover without manual PM2 commands.
- Confirm the admin Services view shows the stack back online.
- Confirm recent logs continue to update after reboot.

## Operational Handover

- Keep the operator surface permanently logged in on the wallboard display.
- Restrict admin access to the approved support/admin users only.
- Record the final URLs, admin credentials owner, and wallboard device owner.
- Store the installer, offline bundle, and hash manifest in the deployment handoff location.

## Recovery Notes

- If admin remediation fails because of runtime permissions, run `deployment\repair-installed-runtime.bat` as administrator.
- If HSD expires, use the admin reauthentication flow on the server host so the browser session is created locally.
- If the installer cannot be used, deploy from the offline bundle with `deployment\install-offline-server.bat`.
