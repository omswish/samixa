import { chromium, type BrowserContext } from 'playwright';
import fs from 'fs';
import readline from 'readline';
import {
  DEBUG_ROOT,
  LEGACY_PROFILE_DIR,
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

async function ensureReady(context: BrowserContext) {
  const page = context.pages()[0] ?? await context.newPage();
  await page.locator(READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
  console.log('Symphony dashboard is visible and ready to save.');
}

async function interactiveLogin() {
  console.log('Opening MS Edge browser in interactive mode...');
  prepareRuntimeStorage();
  fs.mkdirSync(DEBUG_ROOT, { recursive: true });

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false
  });

  const context = await browser.newContext({
    ...(fs.existsSync(STORAGE_STATE_PATH) ? { storageState: STORAGE_STATE_PATH } : {}),
    viewport: null
  });

  try {
    const page = await context.newPage();
    console.log(`Navigating to: ${SYM_URL}`);
    await page.goto(SYM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('\n--> ACTION REQUIRED IN BROWSER WINDOW <--');
    console.log('1. Log in with your corporate AD credentials if prompted.');
    console.log('2. Complete MFA and "Stay signed in" if prompted.');
    console.log('3. Wait until the Symphony dashboard fully loads.');
    console.log('4. Return here and press ENTER to save the session state.');
    await waitForEnter('\nPress ENTER after the dashboard has loaded...');

    await ensureReady(context);
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.log('Storage-state session saved successfully. You can now run the PM2 scraper.');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function importLegacyProfileSession() {
  console.log(`Legacy Profile Directory: ${LEGACY_PROFILE_DIR}`);
  if (!fs.existsSync(LEGACY_PROFILE_DIR)) {
    throw new Error(`Legacy profile directory does not exist: ${LEGACY_PROFILE_DIR}`);
  }

  prepareRuntimeStorage();

  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(LEGACY_PROFILE_DIR, {
      channel: 'msedge',
      headless: true,
      viewport: { width: 1440, height: 900 }
    });
  } catch (err: any) {
    throw new Error(`Could not open the legacy Symphony profile. Stop any running Symphony collector/browser using it, then retry. Original error: ${err.message}`);
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
