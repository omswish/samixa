import { chromium, type BrowserContext, type Page } from 'playwright';
import fs from 'fs';
import readline from 'readline';
import {
  COLLECTOR_LOCAL_PROFILE_DIR,
  DEBUG_ROOT,
  INTERACTIVE_PROFILE_DIR,
  LEGACY_PROFILE_DIR,
  getImportProfileCandidates,
  resolveImportProfileCandidate,
  prepareRuntimeStorage,
  STORAGE_STATE_PATH
} from './sessionPaths';

const SYM_URL = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
const IMPORT_LEGACY_PROFILE = process.argv.includes('--import-legacy-profile');
const READY_SELECTOR = 'span[ng-bind="INCIDENT.MyWorkgroupCount"], span[ng-bind="REQUEST.MyWorkgroupCount"], span[ng-bind="WORKORDER.MyWorkgroupCount"], span[ng-bind="CR.MyWorkgroupCount"]';

console.log('==================================================');
console.log('Symphony HSD Interactive Login & MFA Initializer');
console.log('==================================================');
console.log(`Storage State: ${STORAGE_STATE_PATH}`);

async function waitForEnter(prompt: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function pickActivePage(context: BrowserContext, preferredPage?: Page | null) {
  const openPages = context.pages().filter((page) => !page.isClosed());
  if (preferredPage && !preferredPage.isClosed()) {
    return preferredPage;
  }

  const interestingPage = openPages.find((page) => /adityabirla|microsoftonline|saml|mdlincidentmgmt|sde_dashboard/i.test(page.url()));
  return interestingPage ?? openPages[openPages.length - 1] ?? null;
}

async function ensureReady(context: BrowserContext, preferredPage?: Page | null) {
  const deadline = Date.now() + 120000;
  let trackedPage = preferredPage ?? null;
  let lastObservedState = 'No active page detected yet.';

  while (Date.now() < deadline) {
    trackedPage = pickActivePage(context, trackedPage);
    if (!trackedPage) {
      await context.waitForEvent('page', { timeout: 5000 }).then((page) => {
        trackedPage = page;
      }).catch(() => null);
      if (!trackedPage) {
        lastObservedState = 'No browser page remained open after login.';
        await wait(500);
        continue;
      }
    }

    try {
      await trackedPage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => null);
      await trackedPage.locator(READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 5000 });
      console.log('Symphony dashboard is visible and ready to save.');
      return trackedPage;
    } catch (error: any) {
      if (trackedPage.isClosed()) {
        lastObservedState = 'The active browser page closed before the HSD dashboard became ready.';
        trackedPage = null;
        await wait(500);
        continue;
      }

      const currentUrl = trackedPage.url();
      const normalizedUrl = currentUrl.toLowerCase();
      if (normalizedUrl.includes('login.microsoftonline.com') || normalizedUrl.includes('/saml2') || normalizedUrl.includes('kmsi')) {
        lastObservedState = `Still waiting for Microsoft sign-in flow to finish (${currentUrl}).`;
        await wait(1000);
        continue;
      }

      lastObservedState = error?.message
        ? `${error.message} (${currentUrl || 'unknown page'})`
        : `Still waiting for the HSD dashboard on ${currentUrl || 'unknown page'}.`;
      await wait(1000);
    }
  }

  throw new Error(`Timed out waiting for the Symphony dashboard to become visible. Last observed state: ${lastObservedState}`);
}

async function interactiveLogin() {
  console.log('Opening MS Edge browser in interactive mode...');
  prepareRuntimeStorage();
  fs.mkdirSync(DEBUG_ROOT, { recursive: true });

  const context = await chromium.launchPersistentContext(INTERACTIVE_PROFILE_DIR, {
    channel: 'msedge',
    headless: false,
    viewport: null
  });

  let activePage: Page | null = null;
  context.on('close', () => {
    console.log('Interactive Edge context closed.');
  });
  context.on('page', (page) => {
    activePage = page;
    page.on('close', () => {
      console.log(`Interactive page closed: ${page.url() || 'unknown url'}`);
    });
  });

  if (fs.existsSync(STORAGE_STATE_PATH)) {
    try {
      const existingState = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf8')) as { cookies?: unknown };
      if (Array.isArray(existingState.cookies) && existingState.cookies.length > 0) {
        await context.addCookies(existingState.cookies as Parameters<BrowserContext['addCookies']>[0]);
      }
    } catch (error: any) {
      console.warn(`Unable to preload saved HSD storage state into the interactive profile: ${error?.message || error}`);
    }
  }

  try {
    const page = context.pages()[0] ?? await context.newPage();
    activePage = page;
    console.log(`Navigating to: ${SYM_URL}`);

    try {
      await page.goto(SYM_URL, { waitUntil: 'commit', timeout: 15000 });
    } catch (error: any) {
      if (context.isClosed()) {
        throw new Error(`Interactive Edge closed during initial HSD navigation. ${describeError(error)}`);
      }

      if (page.isClosed()) {
        throw new Error(`The interactive HSD page closed during initial navigation. ${describeError(error)}`);
      }

      console.warn(`Initial HSD navigation did not fully settle yet: ${describeError(error)}`);
      console.warn('Continuing in interactive mode. Complete the login flow in Edge, then return here and press ENTER.');
    }

    console.log('\n--> ACTION REQUIRED IN BROWSER WINDOW <--');
    console.log('1. Log in with your corporate AD credentials if prompted.');
    console.log('2. Complete MFA and "Stay signed in" if prompted.');
    console.log('3. Wait until the Symphony dashboard fully loads.');
    console.log('4. Return here and press ENTER to save the session state.');
    await waitForEnter('\nPress ENTER after the dashboard has loaded...');

    activePage = await ensureReady(context, activePage);
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('Storage-state session saved successfully. You can now run the PM2 scraper.');
  } finally {
    await context.close();
  }
}

async function importLegacyProfileSession() {
  const selectedProfile = resolveImportProfileCandidate();
  console.log(`Legacy Profile Directory: ${LEGACY_PROFILE_DIR}`);
  console.log(`Symphony Local Profile Directory: ${COLLECTOR_LOCAL_PROFILE_DIR}`);
  console.log(`Interactive Profile Directory: ${INTERACTIVE_PROFILE_DIR}`);

  if (!selectedProfile) {
    const checked = getImportProfileCandidates()
      .map((candidate) => `${candidate.label}: ${candidate.path} (${candidate.exists ? (candidate.populated ? 'available' : 'empty') : 'missing'})`)
      .join('\n');
    throw new Error(
      `No importable Symphony profile directory was found.\nChecked:\n${checked}\nUse the normal interactive login command or set SYM_LEGACY_PROFILE_DIR to a valid Edge profile directory.`
    );
  }

  console.log(`Using profile import source: ${selectedProfile.label}`);
  console.log(`Resolved import path: ${selectedProfile.path}`);
  prepareRuntimeStorage();

  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(selectedProfile.path, {
      channel: 'msedge',
      headless: true,
      viewport: { width: 1440, height: 900 }
    });
  } catch (err: any) {
    throw new Error(`Could not open the selected Symphony profile import source. Stop any running Symphony collector/browser using it, then retry. Original error: ${err.message}`);
  }

  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(SYM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await ensureReady(context);
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('Imported legacy Symphony session into storage-state JSON.');
  } finally {
    await context.close();
  }
}

async function main() {
  if (IMPORT_LEGACY_PROFILE) {
    await importLegacyProfileSession();
    return;
  }

  await interactiveLogin();
}

main().catch((err) => {
  console.error('Failed to run interactive login:', err);
  process.exit(1);
});
