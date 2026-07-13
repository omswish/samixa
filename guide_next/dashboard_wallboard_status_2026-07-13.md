# Dashboard Wallboard Status - 2026-07-13

## Scope completed in this pass

- Reworked the dashboard into a single-screen wallboard for `1920x1200`.
- Moved Nutanix/HCI summary into the top header strip.
- Made HSD the dominant top-left panel with:
  - 4 large backlog cards
  - 2 SLA widgets
  - overall queue-mix state panel
- Redesigned the network panel around real SolarWinds `.46` interface detail data.
- Reworked the server panel into grouped operational views:
  - Windows / HCI VM
  - Windows / Physical
  - Linux / HCI VM
  - Linux / Physical

## Files changed

- [dashboard/src/app/page.tsx](/C:/Users/omkar.s/Code/samixa/dashboard/src/app/page.tsx)
- [dashboard/src/components/UnifiedNetworkCard.tsx](/C:/Users/omkar.s/Code/samixa/dashboard/src/components/UnifiedNetworkCard.tsx)
- [dashboard/src/app/globals.css](/C:/Users/omkar.s/Code/samixa/dashboard/src/app/globals.css)

## Verified live findings

### 1. Layout

- Production build succeeded.
- `localhost:3000` returns `200`.
- Captured wallboard screenshots at `1920x1200`.
- Verified `document.body.scrollHeight === window.innerHeight === 1200`, so the page is rendering as a one-page view.

### 2. SolarWinds `.46` network enrichment is live

The collector is now storing real interface-detail values for the SD-WAN links in SQLite, including:

- `alias`
- `interfaceType`
- `operationalStatus`
- `lastStatusChange`
- `configuredSpeedMbps`
- `currentTrafficTransmitMbps`
- `currentTrafficReceiveMbps`
- `realtimeTransmitUtilization`
- `realtimeReceiveUtilization`
- `dailyTransmitUtilization`
- `dailyReceiveUtilization`
- `packetsPerSecondTransmit`
- `packetsPerSecondReceive`

Current verified examples from live DB:

- `sw-net-3`
  - `alias: Jio`
  - `interfaceType: Ethernet`
  - `operationalStatus: Up`
  - `lastStatusChange: 16/05/2026 03:06 PM`
  - `configuredSpeedMbps: 500`
  - `currentTrafficTransmitMbps: 3.3`
  - `currentTrafficReceiveMbps: 9.76`

- `sw-net-4`
  - `alias: Railtel`
  - `interfaceType: Ethernet`
  - `operationalStatus: Up`
  - `lastStatusChange: 07/05/2026 05:51 AM`
  - `configuredSpeedMbps: 500`
  - `currentTrafficTransmitMbps: 7.92`
  - `currentTrafficReceiveMbps: 4.03`
  - `realtimeTransmitUtilization: 1.4`
  - `realtimeReceiveUtilization: 0.5`
  - `dailyTransmitUtilization: 1.6`
  - `dailyReceiveUtilization: 0.8`

### 3. HSD runtime state

- The dashboard is correctly showing **last synced HSD data** plus **error state**, not synthetic fallback data.
- Current visible HSD error is:
  - saved Symphony session expired before reaching the dashboard
- This is the correct current behavior based on the requirement:
  - show only real values
  - on failure, show last synced data with sync time and visible error state

### 4. Server grouping logic in use

Current grouping rule verified from live DB:

- names ending with `.abgplanet.abg.com` are treated as `Windows`
- Nutanix-enriched servers are treated as `HCI VM`
- remaining non-Nutanix systems fall under `Physical`

Current live counts:

- `Windows / HCI VM: 9`
- `Windows / Physical: 5`
- `Linux / HCI VM: 2`
- `Linux / Physical: 0`

## Runtime / PM2 notes

### Important

`pm2 restart dashboard-ui --update-env` is still unreliable in this environment and can leave the process stopped.

### Safe recovery

If that happens, use:

```powershell
pm2 start dashboard-ui
```

### Also verified

- `api-gateway` restart works normally.
- `solarwinds-collector` restart works normally.
- `dashboard-ui` requires a fresh production build in `dashboard/.next` before PM2 start succeeds.

## Recommended next steps

### Immediate

1. Refresh the Symphony session:

```powershell
npm run login --workspace collectors/symphony
pm2 restart symphony-collector --update-env
```

2. Confirm HSD resumes live sync and the visible error banner clears.

### After HSD is stable

3. Get operator review on the new network panel density.
   - The useful `.46` data is now live and rendered.
   - If needed, only do a final visual compression pass on the second SD-WAN card.

4. Resume the server-side work on `.45`.
   - This remains the weaker part of SolarWinds collection.
   - Earlier logs still show intermittent `.45` timeouts and unreachable errors.

### Suggested implementation order

1. HSD login/session stabilization
2. HSD collector runtime cleanup
3. Final network visual polish from operator feedback
4. Resume SolarWinds server collector hardening

## Build / verification commands used

```powershell
npm run build
pm2 restart api-gateway --update-env
pm2 restart solarwinds-collector --update-env
pm2 start dashboard-ui
```

## Current operational summary

- Nutanix: live
- SolarWinds `.46` network detail: live
- SolarWinds server feed: still usable but not the strongest collector path
- Symphony/HSD: showing last synced data, collector session currently expired
- Dashboard wallboard: live, one-page, production build verified
