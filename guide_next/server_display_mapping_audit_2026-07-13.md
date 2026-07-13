# Server Display Mapping Audit

Date: 2026-07-13

## Scope

Audit the current server data path specifically for:

- collector field correctness
- gateway storage correctness
- dashboard field usage correctness
- remaining gaps between collected data and displayed data

## Verified Collection -> Storage Mapping

### Nutanix-backed servers

Collector source:

- `collectors/nutanix/src/index.ts`

Stored in gateway:

- `cpu`
- `memory`
- `disk`
- `backupStatus`
- `status`
- `history`
- `sourceOfTruth = nutanix`
- `platform = hci-vm`

### SolarWinds-only servers

Collector source:

- `collectors/solarwinds/src/index.ts`

Stored in gateway:

- `cpu`
- `memory`
- `status`
- `history`
- `solarwindsNodeId`
- `pollingIp`
- `machineType`
- `hardwareType`
- `lastBoot`
- `availabilityToday`
- `sourceOfTruth = solarwinds`
- `platform = on-prem`

### Overlap hosts

Rule now enforced in storage:

- Nutanix keeps ownership of `cpu`, `memory`, `status`
- SolarWinds still enriches overlap hosts with metadata:
  - `solarwindsNodeId`
  - `pollingIp`
  - `machineType`
  - `hardwareType`
  - `lastBoot`
  - `availabilityToday`

## Dashboard Usage Audit

Before this pass, the server UI used:

- `name`
- `cpu`
- `memory`
- `disk`
- `backupStatus`
- `history`
- inferred OS from hostname
- inferred HCI vs On Prem from `disk` / `backupStatus`

Before this pass, the server UI did **not** use:

- `sourceOfTruth`
- explicit `platform`
- `machineType`
- `hardwareType`
- `lastBoot`
- `availabilityToday`
- `solarwindsNodeId`
- `pollingIp`

## Changes Applied In This Pass

### Cold-start ownership hardening

The default inventory is now seeded with verified ownership and platform metadata.

Effect:

- overlap hosts are Nutanix-owned even on a fresh DB before first Nutanix sync
- SolarWinds-only hosts remain explicitly On Prem / SolarWinds

### Server row refinement

The compact server rows now use the real stored metadata more honestly.

What changed:

- replaced repetitive `Windows | HCI VM` row text with compact operational pills
- shows source ownership:
  - `NX`
  - `SW45`
- shows hardware context when available:
  - `VIRT`
  - `PHYS`
  - `HCI`
- shows short boot marker when available
- uses `AVL` as the third metric when disk telemetry is absent
- keeps backup state visible for Nutanix-backed rows

## Result

The server card is now closer to the real data model:

- HCI rows visually read as Nutanix-owned
- On Prem rows visually read as SolarWinds `.45` owned
- SolarWinds-only rows no longer waste space on unavailable disk data
- collected metadata is now materially represented in the UI instead of being stored and ignored

## Remaining Gaps

Still collected but not yet surfaced directly:

- `pollingIp`
- `solarwindsNodeId`

These are useful for troubleshooting but not obviously wallboard-grade. They should stay in storage and be surfaced only if an operator drill-down view is added later.
