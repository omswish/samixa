import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type FrameLocator, type Page } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { DEBUG_ROOT, PROFILE_ROOT, STORAGE_STATE_PATH } from './sessionPaths';

// Load env from workspace root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const API_URL = process.env.API_URL || 'http://localhost:4000/api/update';
const SYM_USER = process.env.SYM_USER;
const SYM_PASS = process.env.SYM_PASS;
const SYM_URL = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
const SYM_DEBUG = /^(1|true)$/i.test(process.env.SYM_DEBUG || '');
const POLL_INTERVAL = 60000; // 60 seconds (tickets poll less frequently)
const NAVIGATION_TIMEOUT = 30000;
const USERNAME_SELECTOR = '#i0116, input[type="email"], input[name="loginfmt"]';
const PASSWORD_SELECTOR = '#i0118, input[type="password"], input[name="passwd"]';
const SUBMIT_SELECTOR = '#idSIButton9, input[type="submit"]';
const DASHBOARD_READY_SELECTOR = 'span[ng-bind="INCIDENT.MyWorkgroupCount"], span[ng-bind="REQUEST.MyWorkgroupCount"], span[ng-bind="WORKORDER.MyWorkgroupCount"], span[ng-bind="CR.MyWorkgroupCount"]';
const GRID_READY_SELECTOR = '#divRecords, #BodyContentPlaceHolder_gvMyTickets, #BodyContentPlaceHolder_gvChangeRequests';

type TicketBreakdown = {
  new: number;
  assigned: number;
  inProgress: number;
  pending: number;
};

type SpecialQueueCounts = {
  priority1Incidents: number;
  priority2Incidents: number;
  onboardingRequests: number;
  securityRequests: number;
};

type GridRow = Record<string, string>;

let browserPromise: Promise<Browser> | null = null;
let cycleInProgress = false;
let nextCycleTimer: NodeJS.Timeout | null = null;

async function postUpdate(payload: object) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function reportFailure(attemptedAt: string, error: string) {
  try {
    await postUpdate({
      symphony: {
        meta: {
          ok: false,
          attemptedAt,
          error
        }
      }
    });
  } catch (reportErr: any) {
    console.error(`[${new Date().toISOString()}] Failed to report Symphony collector failure to gateway:`, reportErr.message);
  }
}

function buildBootstrapRequiredMessage(reason: string): string {
  return `${reason} Run npm run login --workspace collectors/symphony to seed or refresh the Symphony session.`;
}

async function ensureBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      channel: 'msedge',
      headless: true
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }

  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) {
    await browser.close();
  }
}

function ensureRuntimeDirs() {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  if (SYM_DEBUG) {
    fs.mkdirSync(DEBUG_ROOT, { recursive: true });
  }
}

function debugPath(fileName: string): string {
  ensureRuntimeDirs();
  return path.join(DEBUG_ROOT, fileName);
}

async function captureDebugArtifacts(page: Page, prefix: string) {
  if (!SYM_DEBUG) {
    return;
  }

  await page.screenshot({ path: debugPath(`${prefix}.png`), fullPage: true });
  fs.writeFileSync(debugPath(`${prefix}.html`), await page.content(), 'utf-8');
}

async function createContext(): Promise<{ context: BrowserContext; hasSavedSession: boolean }> {
  ensureRuntimeDirs();
  const browser = await ensureBrowser();
  const hasSavedSession = fs.existsSync(STORAGE_STATE_PATH);
  const contextOptions: BrowserContextOptions = {
    viewport: { width: 1440, height: 900 }
  };

  if (hasSavedSession) {
    contextOptions.storageState = STORAGE_STATE_PATH;
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
  context.setDefaultTimeout(15000);
  return { context, hasSavedSession };
}

async function isLoginPromptVisible(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes('login.microsoftonline.com') || url.includes('oauth') || url.includes('kmsi')) {
    return true;
  }

  const usernameVisible = await page.locator(USERNAME_SELECTOR).first().isVisible().catch(() => false);
  const passwordVisible = await page.locator(PASSWORD_SELECTOR).first().isVisible().catch(() => false);
  return usernameVisible || passwordVisible;
}

async function clickSubmit(page: Page) {
  const button = page.locator(SUBMIT_SELECTOR).first();
  await Promise.allSettled([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
    button.click()
  ]);
  await page.waitForTimeout(1500);
}

async function attemptCredentialLogin(page: Page) {
  if (!SYM_USER || !SYM_PASS) {
    throw new Error(buildBootstrapRequiredMessage('Symphony login requires credentials or a saved session.'));
  }

  const usernameInput = page.locator(USERNAME_SELECTOR).first();
  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(SYM_USER);
    await clickSubmit(page);
  }

  const passwordInput = page.locator(PASSWORD_SELECTOR).first();
  await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
  await passwordInput.fill(SYM_PASS);
  await clickSubmit(page);

  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  if (bodyText.includes('stay signed in') || page.url().toLowerCase().includes('kmsi')) {
    const submitButton = page.locator(SUBMIT_SELECTOR).first();
    if (await submitButton.isVisible().catch(() => false)) {
      await clickSubmit(page);
    }
  }
}

async function dismissDuplicateLoginPopup(page: Page) {
  let popupFrame: FrameLocator;
  try {
    popupFrame = page.frameLocator('#SPopUp-frame');
  } catch {
    return;
  }

  const continueBtn = popupFrame.locator('#btnContinue, input[value="CONTINUE"], input[type="submit"]').first();
  if (!await continueBtn.isVisible().catch(() => false)) {
    return;
  }

  console.log('Duplicate Login popup detected. Continuing with the current session...');
  await continueBtn.click();
  await page.waitForTimeout(5000);
}

async function ensureAuthenticatedPage(): Promise<{ context: BrowserContext; page: Page }> {
  const { context, hasSavedSession } = await createContext();
  const page = await context.newPage();

  try {
    console.log(`Navigating to Symphony HSD at ${SYM_URL}`);
    await page.goto(SYM_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

    if (await isLoginPromptVisible(page)) {
      console.log('Symphony login prompt detected. Attempting authenticated session setup...');
      await attemptCredentialLogin(page);
    }

    if (await isLoginPromptVisible(page)) {
      const message = hasSavedSession
        ? buildBootstrapRequiredMessage('Saved Symphony session expired before reaching the dashboard.')
        : buildBootstrapRequiredMessage('Symphony login did not complete automatically.');
      throw new Error(message);
    }

    if (!/SDE_Dashboard|Summit|MDLIncidentMgmt/i.test(page.url())) {
      await page.goto(SYM_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    }

    await dismissDuplicateLoginPopup(page);
    await page.locator(DASHBOARD_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
    await context.storageState({ path: STORAGE_STATE_PATH });
    await captureDebugArtifacts(page, 'symphony_dashboard');
    return { context, page };
  } catch (err) {
    await context.close();
    throw err;
  }
}

async function getCount(page: Page, selector: string): Promise<number | null> {
  const locator = page.locator(selector).first();
  if (await locator.count() === 0) {
    return null;
  }

  const txt = await locator.innerText();
  const val = parseInt(txt.trim(), 10);
  return Number.isNaN(val) ? null : val;
}

async function parseChartBuckets(page: Page, selector: string, labels: string[]): Promise<Record<string, number>> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 30000 });

  const counts = await locator.evaluate((element, expectedLabels) => {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const labelSet = new Set(expectedLabels.map(normalize));
    const texts = Array.from(element.querySelectorAll('svg text'))
      .map((textNode) => {
        const text = (textNode.textContent || '').replace(/\s+/g, ' ').trim();
        const x = parseFloat(textNode.getAttribute('x') || '0');
        return { text, normalized: normalize(text), x };
      })
      .filter((entry) => entry.text);

    const labelNodes = texts.filter((entry) => labelSet.has(entry.normalized));
    const valueNodes = texts.filter((entry) => /^\d+$/.test(entry.text));
    const result = Object.fromEntries(expectedLabels.map((label) => [normalize(label), 0]));

    for (const valueNode of valueNodes) {
      const nearestLabel = labelNodes.reduce<{ distance: number; label: string } | null>((closest, labelNode) => {
        const distance = Math.abs(labelNode.x - valueNode.x);
        if (!closest || distance < closest.distance) {
          return { distance, label: labelNode.normalized };
        }
        return closest;
      }, null);

      if (!nearestLabel) {
        continue;
      }

      result[nearestLabel.label] = parseInt(valueNode.text, 10);
    }

    return result;
  }, labels);

  const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return Object.fromEntries(labels.map((label) => [normalized(label), counts[normalized(label)] ?? 0]));
}

function chartBucketsToBreakdown(buckets: Record<string, number>): TicketBreakdown {
  return {
    new: buckets.new ?? 0,
    assigned: buckets.assigned ?? 0,
    inProgress: buckets['in-progress'] ?? 0,
    pending: buckets.pending ?? 0
  };
}

function changeBucketsToBreakdown(buckets: Record<string, number>): TicketBreakdown {
  return {
    new: buckets.initiated ?? 0,
    assigned: buckets.implemented ?? 0,
    inProgress: buckets['approved stage'] ?? 0,
    pending: 0
  };
}

async function getQueueUrl(page: Page, hrefNeedle: string): Promise<string> {
  const href = await page.locator(`a[href*="${hrefNeedle}"]`).first().getAttribute('href');
  if (!href) {
    throw new Error(`Could not resolve Symphony queue link for ${hrefNeedle}`);
  }

  return new URL(href, page.url()).toString();
}

async function setGridPageSize(page: Page, totalRows: number) {
  const selector = '#BodyContentPlaceHolder_ddlRecords';
  const dropdown = page.locator(selector).first();
  if (await dropdown.count() === 0) {
    return;
  }

  const currentValue = await dropdown.inputValue().catch(() => '');
  const currentPageSize = parseInt(currentValue, 10);
  if ((Number.isFinite(currentPageSize) && totalRows <= currentPageSize) || currentValue === '100') {
    return;
  }

  await Promise.allSettled([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
    dropdown.selectOption('100')
  ]);
  await page.locator(GRID_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function readGridRows(page: Page, tableId: string): Promise<{ rows: GridRow[]; totalRows: number }> {
  await page.locator(GRID_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

  const totalRowsBeforeResize = await page.evaluate(() => {
    const summaryText = (document.getElementById('divRecords')?.textContent || '').replace(/\s+/g, ' ').trim();
    const totalMatch = summaryText.match(/of\s+(\d+)/i);
    return totalMatch ? parseInt(totalMatch[1], 10) : 0;
  });

  await setGridPageSize(page, totalRowsBeforeResize);

  const extracted = await page.evaluate((currentTableId) => {
    const table = document.getElementById(currentTableId) as HTMLTableElement | null;
    const summaryText = (document.getElementById('divRecords')?.textContent || '').replace(/\s+/g, ' ').trim();
    const totalMatch = summaryText.match(/of\s+(\d+)/i);
    const totalRows = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    if (!table) {
      return { rows: [], totalRows };
    }

    const headers = Array.from(table.querySelectorAll('th'))
      .map((header) => (header.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const rows = Array.from(table.querySelectorAll('tbody tr'))
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
      .map((cells) => cells.length > headers.length ? cells.slice(cells.length - headers.length) : cells)
      .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])))
      .filter((row) => {
        const merged = Object.values(row).join(' ').trim();
        return merged.length > 0 && !/^No Data$/i.test(merged);
      });

    return { rows, totalRows };
  }, tableId);

  if (extracted.totalRows > extracted.rows.length) {
    throw new Error(`Symphony grid ${tableId} spans ${extracted.totalRows} rows but only ${extracted.rows.length} rows were loaded after expanding to 100 records per page`);
  }

  return extracted;
}

async function scrapeSpecialQueues(page: Page): Promise<SpecialQueueCounts> {
  const incidentUrl = await getQueueUrl(page, 'IM_WorkgroupTickets.aspx?dashboard=true');
  const requestUrl = await getQueueUrl(page, 'SR_WorkgroupTickets.aspx?dashboard=true');
  const incidentPage = await page.context().newPage();
  const requestPage = await page.context().newPage();

  try {
    await incidentPage.goto(incidentUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    await requestPage.goto(requestUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });

    const incidentGrid = await readGridRows(incidentPage, 'BodyContentPlaceHolder_gvMyTickets');
    const requestGrid = await readGridRows(requestPage, 'BodyContentPlaceHolder_gvMyTickets');

    return {
      priority1Incidents: incidentGrid.rows.filter((row) => /^P1\b/i.test(row.Priority || '')).length,
      priority2Incidents: incidentGrid.rows.filter((row) => /^P2\b/i.test(row.Priority || '')).length,
      onboardingRequests: requestGrid.rows.filter((row) => /on-?boarding|off-?boarding/i.test(row.Category || '')).length,
      securityRequests: requestGrid.rows.filter((row) => /security/i.test(row.Category || '')).length
    };
  } finally {
    await Promise.allSettled([incidentPage.close(), requestPage.close()]);
  }
}

async function parseSla(page: Page, renderTargetId: string): Promise<number | null> {
  const html = await page.content();
  const patterns = [
    new RegExp(`defaultCenterLabel=['"]([^'"]+)['"];\\s*chartObj = new FusionCharts\\([^)]*renderAt: ['"]${renderTargetId}['"]`, 'i'),
    new RegExp(`renderAt: ['"]${renderTargetId}['"].*?defaultCenterLabel=['"]([^'"]+)['"]`, 'is')
  ];

  let centerLabel: string | null = null;
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      centerLabel = match[1];
      break;
    }
  }

  if (!centerLabel) {
    return null;
  }

  const fractionMatch = centerLabel.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!fractionMatch) {
    return null;
  }

  const num = parseFloat(fractionMatch[1]);
  const den = parseFloat(fractionMatch[2]);
  if (Number.isNaN(num) || Number.isNaN(den) || den <= 0) {
    return null;
  }

  return Number(((num / den) * 100).toFixed(2));
}

async function scrapeSymphonyPage(page: Page, attemptedAt: string) {
  const dashboardSignals = await page.locator('svg, table, [ng-bind]').count();
  if (dashboardSignals === 0) {
    throw new Error('Symphony dashboard did not render expected data elements');
  }

  console.log('Found dashboard elements. Parsing Symphony stats from DOM...');

  const openIncidents = await getCount(page, 'span[ng-bind="INCIDENT.MyWorkgroupCount"]');
  const openIncidentsAssigned = await getCount(page, 'span[ng-bind="INCIDENT.AssignedCount"]');
  const serviceRequests = await getCount(page, 'span[ng-bind="REQUEST.MyWorkgroupCount"]');
  const serviceRequestsAssigned = await getCount(page, 'span[ng-bind="REQUEST.AssignedCount"]');
  const workOrders = await getCount(page, 'span[ng-bind="WORKORDER.MyWorkgroupCount"]');
  const workOrdersAssigned = await getCount(page, 'span[ng-bind="WORKORDER.AssignedCount"]');
  const changeRecords = await getCount(page, 'span[ng-bind="CR.MyWorkgroupCount"]');
  const changeRecordsAssigned = await getCount(page, 'span[ng-bind="CR.AssignedCount"]');

  const topLevelCounts = [
    openIncidents,
    openIncidentsAssigned,
    serviceRequests,
    serviceRequestsAssigned,
    workOrders,
    workOrdersAssigned,
    changeRecords,
    changeRecordsAssigned
  ];
  if (topLevelCounts.some((value) => value === null)) {
    throw new Error('One or more Symphony ticket counters could not be read reliably');
  }

  console.log('Extracting HSD chart buckets from rendered dashboard charts...');
  const incidentBuckets = await parseChartBuckets(page, '#myWorkgroupIncidents', ['New', 'Assigned', 'In-Progress', 'Pending']);
  const requestBuckets = await parseChartBuckets(page, '#myWorkgroupRequests', ['New', 'Assigned', 'In-Progress', 'Pending']);
  const workOrderBuckets = await parseChartBuckets(page, '#myWorkgroupWorkorders', ['New', 'Assigned', 'In-Progress', 'Pending']);
  const changeBuckets = await parseChartBuckets(page, '#myWorkgroupCRs', ['Initiated', 'Implemented', 'Approved Stage']);

  const openIncidentsBreakdown = chartBucketsToBreakdown(incidentBuckets);
  const serviceRequestsBreakdown = chartBucketsToBreakdown(requestBuckets);
  const workOrdersBreakdown = chartBucketsToBreakdown(workOrderBuckets);
  const changeRecordsBreakdown = changeBucketsToBreakdown(changeBuckets);

  if (openIncidents !== openIncidentsBreakdown.new + openIncidentsBreakdown.assigned + openIncidentsBreakdown.inProgress + openIncidentsBreakdown.pending) {
    throw new Error('Incident chart breakdown does not match the Incident total');
  }
  if (serviceRequests !== serviceRequestsBreakdown.new + serviceRequestsBreakdown.assigned + serviceRequestsBreakdown.inProgress + serviceRequestsBreakdown.pending) {
    throw new Error('Service Request chart breakdown does not match the Service Request total');
  }
  if (workOrders !== workOrdersBreakdown.new + workOrdersBreakdown.assigned + workOrdersBreakdown.inProgress + workOrdersBreakdown.pending) {
    throw new Error('Work Order chart breakdown does not match the Work Order total');
  }
  if (changeRecords !== changeRecordsBreakdown.new + changeRecordsBreakdown.assigned + changeRecordsBreakdown.inProgress) {
    throw new Error('Change Record chart breakdown does not match the Change Record total');
  }

  console.log('Extracting SLA performance percentages...');
  const incidentsResponseSla = await parseSla(page, 'responseSLA');
  const incidentsResolutionSla = await parseSla(page, 'resolutionSLA');
  const requestsResponseSla = await parseSla(page, 'SRresponseSLA');
  const requestsResolutionSla = await parseSla(page, 'SRresolutionSLA');

  if ([incidentsResponseSla, incidentsResolutionSla, requestsResponseSla, requestsResolutionSla].some((value) => value === null)) {
    throw new Error('One or more Symphony SLA widgets could not be read reliably');
  }

  console.log('Extracting P1/P2 and service request category counts from queue pages...');
  const specialQueues = await scrapeSpecialQueues(page);

  return {
    meta: {
      ok: true,
      attemptedAt
    },
    openIncidents,
    openIncidentsBreakdown,
    serviceRequests,
    serviceRequestsBreakdown,
    workOrders,
    workOrdersBreakdown,
    changeRecords,
    changeRecordsBreakdown,
    ...specialQueues,
    serviceRequestsSla: requestsResponseSla,
    incidentsResponseSla,
    incidentsResolutionSla,
    requestsResponseSla,
    requestsResolutionSla
  };
}

async function scrapeSymphony() {
  if (cycleInProgress) {
    console.warn(`[${new Date().toISOString()}] Previous Symphony cycle is still running. Skipping overlap.`);
    return;
  }

  cycleInProgress = true;
  const cycleStartedAt = Date.now();
  const attemptedAt = new Date().toISOString();
  console.log(`[${attemptedAt}] Starting Symphony HSD scraping session...`);

  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    const authenticated = await ensureAuthenticatedPage();
    context = authenticated.context;
    page = authenticated.page;

    const symphonyData = await scrapeSymphonyPage(page, attemptedAt);
    console.log('Symphony Data Scraped Successfully:', JSON.stringify(symphonyData, null, 2));
    await postUpdate({ symphony: symphonyData });
    console.log(`[${new Date().toISOString()}] Symphony metrics posted successfully.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Error in Symphony scraper:`, err.message);
    await reportFailure(attemptedAt, err.message);
    if (page) {
      await captureDebugArtifacts(page, 'symphony_error');
    }
  } finally {
    if (context) {
      await context.close();
    }
    cycleInProgress = false;
    const elapsed = Date.now() - cycleStartedAt;
    scheduleNextCycle(Math.max(1000, POLL_INTERVAL - elapsed));
  }
}

function scheduleNextCycle(delayMs: number) {
  if (nextCycleTimer) {
    clearTimeout(nextCycleTimer);
  }

  nextCycleTimer = setTimeout(() => {
    void scrapeSymphony();
  }, delayMs);
}

async function shutdown() {
  if (nextCycleTimer) {
    clearTimeout(nextCycleTimer);
  }

  await closeBrowser();
}

console.log('Symphony scraper service started.');
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

void scrapeSymphony();
