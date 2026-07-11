# Implementation Plan: Utkal Alumina IT Dashboard Migration

## Goal Description
The objective is to migrate the current "IT Dashboard", which relies on fragile Google Chrome extensions that scrape DOM data from multiple active browser tabs, to a robust, headless backend architecture. Due to enterprise VPN and firewall restrictions, we cannot access direct server metrics via WMI/SSH, nor the backend SolarWinds SWIS APIs. The new architecture runs entirely in the background as Node.js processes managed by **PM2** on a Windows operator PC. 

The dashboard will continue to be a single pane of glass, but all scraping and API calls will happen invisibly in the background.

## User Review Required
> [!WARNING]
> **API Blockages Confirmed**: The SolarWinds SWIS APIs on ports 17774 and 17778 are completely blocked via your VPN connection. 
> **Resolution**: We have updated the architecture so that both **SolarWinds** and **Symphony** will be scraped via headless Chromium (using Playwright) running silently in the background, rather than using REST APIs. **Nutanix** will successfully use the REST API since we confirmed port 9440 is accessible.

## Open Questions
> [!IMPORTANT]
> The current plan relies on Playwright to spawn invisible browser instances to log in and scrape SolarWinds and Symphony. Are you comfortable with Playwright installing its headless browser binaries on your operator PC? (It happens automatically during `npm install`).

## Proposed Changes

---

### Backend Data Collectors (PM2 Scripts)
These scripts replace the Chrome Extensions and run continuously in the background.

#### [NEW] `collectors/nutanix/src/index.ts`
Uses `node-fetch` to query the Prism v2 REST API (which successfully returned cluster stats in our tests).
```typescript
const res = await fetch('https://10.23.50.27:9440/PrismGateway/services/rest/v2.0/cluster/', {
  headers: { 'Authorization': `Basic ${auth}` }
});
// Posts data to http://localhost:4000/api/update
```

#### [NEW] `collectors/solarwinds/src/index.ts`
Uses `playwright` to invisibly navigate to the SolarWinds Orion portals (10.36.91.45/46) and scrape the DOM elements, reusing the logic from `content_solarwinds.js`.

#### [NEW] `collectors/symphony/src/index.ts`
Uses `playwright` to invisibly navigate to the Symphony Summit portal and scrape the incident/SLA DOM elements, reusing the logic from `content_symphony.js`.

---

### API Gateway (Central Hub)
Replaces the Next.js API route with a persistent background Express server.

#### [NEW] `api-gateway/src/index.ts`
An Express server running on port 4000. It receives HTTP POSTs from the three collectors, writes the data to a local SQLite database, and pushes real-time updates to the dashboard UI via WebSockets.
```typescript
import express from 'express';
import { WebSocketServer } from 'ws';
// Creates POST /api/update to ingest data
// Creates WebSocket server to push to UI
```

#### [NEW] `api-gateway/src/db.ts`
Initializes a `better-sqlite3` database to store historical data and configurations, replacing the fragile `db.json` flat file.

---

### Frontend Dashboard
The Next.js application will be slightly modified to listen to WebSockets rather than HTTP polling.

#### [MODIFY] `dashboard/src/app/page.tsx`
Update the existing React dashboard to use a WebSocket client hook for real-time, low-latency updates from the `api-gateway`.

---

### Deployment Config

#### [NEW] `ecosystem.config.js`
The PM2 configuration file that orchestrates the entire system on Windows. It injects credentials securely as environment variables so they aren't hardcoded in the scrapers.
```javascript
require('dotenv').config(); // Load credentials from a local .env file

module.exports = {
  apps: [
    { name: 'api-gateway', script: './api-gateway/dist/index.js' },
    { name: 'nutanix-collector', script: './collectors/nutanix/dist/index.js', env: { NUTANIX_USER: process.env.NUTANIX_USER, NUTANIX_PASS: process.env.NUTANIX_PASS } },
    { name: 'solarwinds-collector', script: './collectors/solarwinds/dist/index.js', env: { SW_USER: process.env.SW_USER, SW_PASS: process.env.SW_PASS } },
    { name: 'symphony-collector', script: './collectors/symphony/dist/index.js', env: { SYM_USER: process.env.SYM_USER, SYM_PASS: process.env.SYM_PASS } },
    { name: 'dashboard-ui', script: 'npm', args: 'start', cwd: './dashboard' }
  ]
};
```

---

### Credentials Management
Instead of the Chrome Extension reading from the `db.json` or frontend state, we will use a central `.env` file on your operator PC. 
When PM2 starts the headless Playwright scrapers, it passes these credentials as hidden environment variables. Playwright will then use these variables to automatically type the username and password into the SolarWinds and Symphony login screens during its background scraping runs.

## Verification Plan

### Automated Tests
* None explicitly required for Phase 1. We will rely on TypeScript compiler checks (`tsc --noEmit`).

### Manual Verification
1. Run `pm2 start ecosystem.config.js`.
2. Observe `pm2 logs` to ensure all three collectors successfully log in and post data.
3. Open `http://localhost:3000` (Dashboard UI).
4. Unplug the network cable or drop the VPN briefly to ensure the UI shows "disconnected" and auto-recovers when the VPN reconnects.
