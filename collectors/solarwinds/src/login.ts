import { chromium, type BrowserContext } from 'playwright';
import fs from 'fs';
import readline from 'readline';
import {
  LEGACY_NETWORK_PROFILE_DIR,
  LEGACY_SERVER_PROFILE_DIR,
  NETWORK_STORAGE_STATE_PATH,
  prepareRuntimeStorage,
  SERVER_STORAGE_STATE_PATH
} from './sessionPaths';

const SW_HOST_SERVERS = process.env.SW_HOST_SERVERS || '10.36.91.45';
const SW_HOST_NETWORKS = process.env.SW_HOST_NETWORKS || '10.36.91.46';
const IMPORT_LEGACY_PROFILE = process.argv.includes('--import-legacy-profile');

const LOGIN_TARGETS = [
  {
    label: 'Servers',
    targetUrl: `http://${SW_HOST_SERVERS}/Orion/SummaryView.aspx?ViewID=1`,
    readySelector: 'table.NeedsZebraStripes, table.sw-custom-query-table',
    storageStatePath: SERVER_STORAGE_STATE_PATH,
    legacyProfileDir: LEGACY_SERVER_PROFILE_DIR
  },
  {
    label: 'Networks',
    targetUrl: `http://${SW_HOST_NETWORKS}/Orion/SummaryView.aspx?ViewID=1`,
    readySelector: 'table.NeedsZebraStripes',
    storageStatePath: NETWORK_STORAGE_STATE_PATH,
    legacyProfileDir: LEGACY_NETWORK_PROFILE_DIR
  }
] as const;

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

async function ensureReady(context: BrowserContext, readySelector: string, label: string) {
  const page = context.pages()[0] ?? await context.newPage();
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 30000 });
  console.log(`${label}: target page is visible and ready to save.`);
}

async function bootstrapInteractiveSession(
  label: string,
  targetUrl: string,
  readySelector: string,
  storageStatePath: string
) {
  console.log('==================================================');
  console.log(`SolarWinds Session Bootstrap: ${label}`);
  console.log('==================================================');
  console.log(`Storage State: ${storageStatePath}`);
  console.log(`Opening: ${targetUrl}`);

  prepareRuntimeStorage();
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false
  });

  const context = await browser.newContext({
    ...(fs.existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
    viewport: null
  });

  try {
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('\n--> ACTION REQUIRED IN BROWSER WINDOW <--');
    console.log('1. Complete login in Edge if prompted.');
    console.log('2. Wait until the target Orion dashboard is fully visible.');
    console.log('3. Return here and press ENTER to save the session state.');
    await waitForEnter('\nPress ENTER after the Orion page has loaded...');

    await ensureReady(context, readySelector, label);
    await context.storageState({ path: storageStatePath });
    console.log(`Saved storage-state session for ${label}.\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function importLegacyProfileSession(
  label: string,
  targetUrl: string,
  readySelector: string,
  storageStatePath: string,
  legacyProfileDir: string
) {
  console.log('==================================================');
  console.log(`SolarWinds Legacy Session Import: ${label}`);
  console.log('==================================================');
  console.log(`Profile Directory: ${legacyProfileDir}`);
  console.log(`Storage State: ${storageStatePath}`);

  if (!fs.existsSync(legacyProfileDir)) {
    throw new Error(`Legacy profile directory does not exist for ${label}: ${legacyProfileDir}`);
  }

  prepareRuntimeStorage();

  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(legacyProfileDir, {
      channel: 'msedge',
      headless: true,
      viewport: { width: 1440, height: 900 }
    });
  } catch (err: any) {
    throw new Error(
      `Could not open the legacy ${label.toLowerCase()} profile. Stop the running solarwinds collector first, then retry the import. Original error: ${err.message}`
    );
  }

  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await ensureReady(context, readySelector, label);
    await context.storageState({ path: storageStatePath });
    console.log(`Imported legacy profile session for ${label} into storage-state JSON.\n`);
  } finally {
    await context.close();
  }
}

async function main() {
  for (const target of LOGIN_TARGETS) {
    if (IMPORT_LEGACY_PROFILE) {
      await importLegacyProfileSession(
        target.label,
        target.targetUrl,
        target.readySelector,
        target.storageStatePath,
        target.legacyProfileDir
      );
      continue;
    }

    await bootstrapInteractiveSession(
      target.label,
      target.targetUrl,
      target.readySelector,
      target.storageStatePath
    );
  }

  console.log('SolarWinds session bootstrap completed. Restart the collector to use these saved sessions.');
}

main().catch((err) => {
  console.error('Failed to initialize SolarWinds session bootstrap:', err);
  process.exit(1);
});
