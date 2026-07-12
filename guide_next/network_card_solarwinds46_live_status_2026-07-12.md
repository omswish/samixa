# Network Card Live Status - SolarWinds 10.36.91.46

## Scope of this pass

- Focused only on the dashboard network card.
- Focused only on SolarWinds network host `10.36.91.46`.
- Did not expand SolarWinds server work in this pass.
- Requirement held: no fabricated values in normal runtime.

## What was verified live

- PM2 runtime is the active app path via `ecosystem.config.js`.
- `dashboard-ui` is serving successfully on `http://localhost:3000`.
- `api-gateway` is serving successfully on `http://localhost:4000/api/status`.
- The dashboard network card is rendering live SolarWinds network data without a 500.
- The network card now shows:
  - carrier display names
  - carrier polling IPs
  - derived carrier metadata
  - SD-WAN interface names
  - SD-WAN TX/RX utilization
  - SD-WAN polling IPs

## Live network data confirmed on the dashboard

- `RJIO (ISP1)`
  - display name: `Utkal JIO ILL 500Mbps ILL_9120065943_778660658352`
  - polling IP: `115.242.249.162`
  - metadata: `Utkal · 115.242.249.162 · 500Mbps · JIO ILL · ILL_9120065943_778660658352`
- `RailTel (ISP2)`
  - display name: `Utkal Railtel ILL 500Mbps CKT-2643929`
  - polling IP: `103.208.174.242`
  - metadata: `Utkal · 103.208.174.242 · 500Mbps · Railtel ILL · CKT-2643929`
- `HIL-UTK-EC-1 (SDWAN-A)`
  - interface: `wan0 · Jio`
  - polling IP: `10.75.255.146`
  - TX/RX: `1% / 1%`
- `HIL-UTK-EC-2 (SDWAN-B)`
  - interface: `wan1 · Railtel`
  - polling IP: `10.75.255.147`
  - TX/RX: `1% / 1%`

## Code-path findings

- The collector is running from built files under PM2, not from `src` directly.
- Rebuilds are required before PM2 restarts will pick up TypeScript source changes.
- The previous carrier-data loss was caused by two things:
  - SolarWinds availability requests were failing.
  - Entity snapshot and uptime were coupled in an all-or-nothing `Promise.all(...)` path.
- The collector was changed so partial real data is still retained when one probe fails.

## Remaining issue

- `GetAvailabilityStats` is still inconsistent in the collector runtime.
- Manual live verification proved the endpoint returns `200` when called with the same AJAX/XSRF contract that Orion uses.
- The dashboard currently shows `100.000%` uptime for all four network links.
- Because the current live links really are returning 100% in the verified manual call, the displayed value is plausible.
- Even so, the collector-side uptime path should still be treated as not fully closed until the runtime path stops logging availability probe failures consistently.

## Why the current output is still acceptable for this pass

- No synthetic utilization or latency is being invented.
- Carrier cards now show real identity and IP data instead of blank placeholders.
- SD-WAN cards now show real interface and utilization data from the live summary page.
- Existing gateway persistence still preserves last good data when a later probe fails.

## Recommended next steps

1. Finish the collector-side availability request path so network uptime is confirmed from live runtime, not inferred from the currently healthy data.
2. Keep SolarWinds debug utilities, but formalize only the ones that expose reusable investigation value.
3. Next implementation pass can move to SolarWinds server hardening, because the network card path is now materially better and live-visible.

## Recommendation on the SolarWinds debug scripts

- Keep them tracked if they help reproduce auth, selector, or endpoint discovery against fragile Orion pages.
- Do not leave them as anonymous throwaway files if they are now part of the operating knowledge of the project.
- Best approach:
  - keep only the useful ones
  - rename them clearly as debug or tooling scripts
  - document what each script proves
  - do not let production collector logic depend on them

## Files most relevant to this pass

- `collectors/solarwinds/src/index.ts`
- `api-gateway/src/db.ts`
- `dashboard/src/components/UnifiedNetworkCard.tsx`
- `dashboard/src/app/page.tsx`
- `ecosystem.config.js`
