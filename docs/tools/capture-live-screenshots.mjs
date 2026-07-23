import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const screenshotRoot = path.resolve(repoRoot, 'docs', 'assets', 'screenshots');

const operatorLoginUrl = process.env.ITDASH_OPERATOR_URL || 'http://127.0.0.1:21060/login';
const adminLoginUrl = process.env.ITDASH_ADMIN_URL || 'http://127.0.0.1:21061/login';
const operatorPassword = process.env.ITDASH_OPERATOR_PASSWORD || '17172737';
const adminPassword = process.env.ITDASH_ADMIN_PASSWORD || '17172737';

async function ensureRoot() {
  await fs.mkdir(screenshotRoot, { recursive: true });
}

async function captureOperatorScreens(browser) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 980 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  await page.goto(operatorLoginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotRoot, 'operator-login.png'), fullPage: true });

  await page.getByLabel(/operator password/i).fill(operatorPassword);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30000 }),
    page.getByRole('button', { name: /open operator dashboard/i }).click()
  ]);
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(screenshotRoot, 'operator-dashboard.png'), fullPage: true });

  await context.close();
}

async function captureAdminScreens(browser) {
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1040 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  await page.goto(adminLoginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByLabel(/admin password/i).fill(adminPassword);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30000 }),
    page.getByRole('button', { name: /open admin portal/i }).click()
  ]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading service state...')
      && !document.body.innerText.includes('Loading session state...')
      && !document.body.innerText.includes('Loading source settings...'),
    null,
    { timeout: 30000 }
  ).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotRoot, 'admin-overview.png'), fullPage: true });

  const adminTabs = [
    { name: 'Sessions', file: 'admin-sessions.png', heading: 'Sessions' },
    { name: 'Sources', file: 'admin-sources.png', heading: 'Source Configuration' },
    { name: 'Audit', file: 'admin-audit.png', heading: 'Audit Trail' },
    { name: 'Help', file: 'admin-help.png', heading: 'Help' }
  ];

  for (const tab of adminTabs) {
    await page.getByRole('tab', { name: new RegExp(tab.name, 'i') }).click();
    await page.getByRole('heading', { name: new RegExp(tab.heading, 'i') }).waitFor({ timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotRoot, tab.file), fullPage: true });
  }

  await context.close();
}

async function main() {
  await ensureRoot();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    await captureOperatorScreens(browser);
    await captureAdminScreens(browser);
    console.log(path.relative(repoRoot, screenshotRoot));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
