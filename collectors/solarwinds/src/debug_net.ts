import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set ${name} in the environment.`);
  }

  return value;
}

const SW_USER = requireEnv('SW_USER', process.env.SW_USER);
const SW_PASS = requireEnv('SW_PASS', process.env.SW_PASS);
const SW_HOST_NETWORKS = process.env.SW_HOST_NETWORKS || '10.36.91.46';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });
  const page = await browser.newPage();
  try {
    const url = `http://${SW_HOST_NETWORKS}/Orion/Login.aspx`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    const loginButtonSelector = '#ctl00_BodyContent_LoginButton, input[type="submit"], button:has-text("Login")';
    if (await page.locator(loginButtonSelector).count() > 0) {
      const userField = await page.locator('#ctl00_BodyContent_Username, input[name*="username"], input[type="text"]').first();
      const passField = await page.locator('#ctl00_BodyContent_Password, input[name*="password"], input[type="password"]').first();
      await userField.fill(SW_USER);
      await passField.fill(SW_PASS);
      console.log('Clicking login button...');
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          page.locator(loginButtonSelector).first().click()
        ]);
      } catch (navErr) {
        console.log('Navigation wait timed out or completed early. Continuing...');
      }
      console.log('After login title:', await page.title());
    }
    
    // Wait for the widgets to load
    console.log('Waiting for elements containing network names to load...');
    await page.waitForTimeout(5000); // give it some time for JS updates
    
    const targets = ['BSNL', 'OSP', 'TCL', 'SIFY'];
    for (const target of targets) {
      console.log(`\n--- Inspecting elements matching: ${target} ---`);
      const loc = page.locator(`text=/${target}/i`);
      const count = await loc.count();
      console.log(`Found ${count} element(s)`);
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        const text = await el.innerText();
        const html = await el.evaluate(node => node.outerHTML);
        console.log(`Element ${i}: Text = "${text.trim()}"`);
        console.log(`HTML: ${html.substring(0, 500)}`);
      }
    }
    
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}
run();
