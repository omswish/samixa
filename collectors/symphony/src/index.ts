import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env from workspace root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const API_URL = process.env.API_URL || 'http://localhost:4000/api/update';
const SYM_USER = process.env.SYM_USER;
const SYM_PASS = process.env.SYM_PASS;
const SYM_URL = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
const SYM_DEBUG = /^(1|true)$/i.test(process.env.SYM_DEBUG || '');
const POLL_INTERVAL = 60000; // 60 seconds (tickets poll less frequently)

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

async function scrapeSymphony() {
  const attemptedAt = new Date().toISOString();
  console.log(`[${attemptedAt}] Starting Symphony HSD scraping session...`);
  
  let context: any;
  let page: any;
  try {
    const profileDir = path.join(__dirname, '../../edge-profile');

    // Launch Microsoft Edge using the persistent profile directory
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'msedge',
      headless: true
    });
    
    page = context.pages().length ? context.pages()[0] : await context.newPage();
    
    console.log(`Navigating to Symphony HSD at ${SYM_URL}`);
    await page.goto(SYM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 1. Log in to Symphony HSD (which redirects to Microsoft AD login)
    // Selectors for MS login page
    const usernameInput = '#i0116, input[type="email"], input[name="loginfmt"]';
    const passwordInput = '#i0118, input[type="password"], input[name="passwd"]';
    const submitButton = '#idSIButton9, input[type="submit"]';

    console.log('Checking for login fields...');
    if (await page.locator(usernameInput).count() > 0 && SYM_USER && SYM_PASS) {
      console.log('Microsoft AD Login screen detected. Step 1: Entering Username...');
      await page.locator(usernameInput).fill(SYM_USER);
      if (SYM_DEBUG) {
        await page.screenshot({ path: path.join(__dirname, '../../../symphony_step1_entered_user.png') });
      }
      await page.locator(submitButton).click();

      console.log('Waiting for password field...');
      await page.locator(passwordInput).waitFor({ state: 'visible', timeout: 15000 });
      console.log('Step 2: Entering Password...');
      await page.locator(passwordInput).fill(SYM_PASS);
      if (SYM_DEBUG) {
        await page.screenshot({ path: path.join(__dirname, '../../../symphony_step2_entered_pass.png') });
      }
      await page.locator(submitButton).click();

      console.log('Waiting for Stay Signed In prompt...');
      try {
        await page.locator(submitButton).waitFor({ state: 'visible', timeout: 10000 });
        if (SYM_DEBUG) {
          await page.screenshot({ path: path.join(__dirname, '../../../symphony_step3_stay_signed_in.png') });
        }
        console.log('Step 3: Confirming Stay Signed In...');
        await page.locator(submitButton).click();
      } catch (e) {
        console.log('No Stay Signed In prompt or timed out. Proceeding.');
      }

      console.log('Waiting for dashboard redirection to complete...');
      await page.waitForURL(/SDE_Dashboard|Summit|MDLIncidentMgmt/, { timeout: 30000 });
      if (SYM_DEBUG) {
        await page.screenshot({ path: path.join(__dirname, '../../../symphony_step4_redirected.png') });
      }
      console.log('Dashboard redirection successful.');
    } else {
      console.log('Already logged in via cached Edge profile or login skipped.');
    }

    // Wait for the main page elements to load
    await page.waitForTimeout(5000); // Give the dashboard extra time to render fully

    // Handle Duplicate Login popup if it appears (loads inside #SPopUp-frame iframe)
    try {
      const popupFrame = page.frameLocator('#SPopUp-frame');
      const continueBtn = popupFrame.locator('#btnContinue, input[value="CONTINUE"], input[type="submit"]').first();
      
      console.log('Checking for Duplicate Login popup...');
      if (await continueBtn.count() > 0) {
        console.log('Duplicate Login popup detected. Clicking CONTINUE to log out other sessions...');
        await continueBtn.click();
        console.log('Duplicate Login CONTINUE clicked.');
        // Wait for page to settle after session override
        await page.waitForTimeout(8000);
      }
    } catch (popupErr: any) {
      console.log('No Duplicate Login popup or failed to dismiss:', popupErr.message);
    }

    // Save a screenshot to inspect the logged-in state and layout
    if (SYM_DEBUG) {
      const screenshotPath = path.join(__dirname, '../../../symphony_screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to ${screenshotPath}`);

      const htmlPath = path.join(__dirname, '../../../symphony_page.html');
      const htmlContent = await page.content();
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
      console.log(`HTML content dumped to ${htmlPath}`);
    }

    // Scrape data (tickets, SLAs, etc.)
    const hasDashboardElements = await page.locator('svg, table, [ng-bind]').count() > 0;
    
    if (!hasDashboardElements) {
      throw new Error('Symphony dashboard did not render expected data elements');
    }

    console.log('Found dashboard elements. Parsing Symphony stats from DOM...');

    const getVal = async (selector: string): Promise<number | null> => {
      const locator = page.locator(selector).first();
      if (await locator.count() === 0) {
        return null;
      }

      const txt = await locator.innerText();
      const val = parseInt(txt.trim(), 10);
      return Number.isNaN(val) ? null : val;
    };

    const openIncidents = await getVal('span[ng-bind="INCIDENT.MyWorkgroupCount"]');
    const openIncidentsAssigned = await getVal('span[ng-bind="INCIDENT.AssignedCount"]');
    const serviceRequests = await getVal('span[ng-bind="REQUEST.MyWorkgroupCount"]');
    const serviceRequestsAssigned = await getVal('span[ng-bind="REQUEST.AssignedCount"]');
    const workOrders = await getVal('span[ng-bind="WORKORDER.MyWorkgroupCount"]');
    const workOrdersAssigned = await getVal('span[ng-bind="WORKORDER.AssignedCount"]');
    const changeRecords = await getVal('span[ng-bind="CR.MyWorkgroupCount"]');
    const changeRecordsAssigned = await getVal('span[ng-bind="CR.AssignedCount"]');

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

    const parseSla = async (renderTargetId: string): Promise<number | null> => {
      const html = await page.content();
      const patterns = [
        new RegExp(`defaultCenterLabel='([^']+)';\\s*chartObj = new FusionCharts\\([^)]*renderAt: '${renderTargetId}'`, 'i'),
        new RegExp(`renderAt: '${renderTargetId}'.*?defaultCenterLabel='([^']+)'`, 'is')
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
    };

    console.log('Extracting SLA performance percentages...');
    const incidentsResponseSla = await parseSla('responseSLA');
    const incidentsResolutionSla = await parseSla('resolutionSLA');
    const requestsResponseSla = await parseSla('SRresponseSLA');
    const requestsResolutionSla = await parseSla('SRresolutionSLA');

    if ([incidentsResponseSla, incidentsResolutionSla, requestsResponseSla, requestsResolutionSla].some((value) => value === null)) {
      throw new Error('One or more Symphony SLA widgets could not be read reliably');
    }

    const symphonyData = {
      meta: {
        ok: true,
        attemptedAt
      },
      openIncidents,
      openIncidentsBreakdown: { new: 0, assigned: openIncidentsAssigned, inProgress: openIncidents, pending: 0 },
      serviceRequests,
      serviceRequestsBreakdown: { new: 0, assigned: serviceRequestsAssigned, inProgress: serviceRequests, pending: 0 },
      workOrders,
      workOrdersBreakdown: { new: 0, assigned: workOrdersAssigned, inProgress: workOrders, pending: 0 },
      changeRecords,
      changeRecordsBreakdown: { new: 0, assigned: changeRecordsAssigned, inProgress: changeRecords, pending: 0 },
      serviceRequestsSla: requestsResponseSla,
      incidentsResponseSla,
      incidentsResolutionSla,
      requestsResponseSla,
      requestsResolutionSla
    };

    console.log('Symphony Data Scraped Successfully:', JSON.stringify(symphonyData, null, 2));

    // Post to API Gateway
    await postUpdate({ symphony: symphonyData });
    console.log(`[${new Date().toISOString()}] Symphony metrics posted successfully.`);

  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Error in Symphony scraper:`, err.message);
    await reportFailure(attemptedAt, err.message);
    if (page && SYM_DEBUG) {
      try {
        const errorScreenshotPath = path.join(__dirname, '../../../symphony_error_screenshot.png');
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(`Error screenshot saved to ${errorScreenshotPath}`);
      } catch (screenshotErr) {
        console.error('Failed to capture error screenshot:', screenshotErr);
      }
    }
  } finally {
    if (context) {
      await context.close();
    }
  }
}

// Start polling
console.log('Symphony scraper service started.');
scrapeSymphony();
setInterval(scrapeSymphony, POLL_INTERVAL);
