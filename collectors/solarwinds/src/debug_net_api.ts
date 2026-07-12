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
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  // Intercept and print JSON API calls
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (url.includes('api') || url.includes('services') || contentType.includes('application/json')) {
      console.log(`API Resp: [${response.status()}] ${url}`);
      try {
        const text = await response.text();
        console.log(`  Length: ${text.length}. Preview: ${text.substring(0, 300)}\n`);
      } catch (e) {
        // Not a text response or failed
      }
    }
  });

  try {
    const url = `http://${SW_HOST_NETWORKS}/Orion/Login.aspx`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    const loginButtonSelector = '#ctl00_BodyContent_LoginButton, input[type="submit"], button:has-text("Login")';
    if (await page.locator(loginButtonSelector).count() > 0) {
      const userField = await page.locator('#ctl00_BodyContent_Username, input[name*="username"], input[type="text"]').first();
      const passField = await page.locator('#ctl00_BodyContent_Password, input[name*="password"], input[type="password"]').first();
      await userField.fill(SW_USER);
      await passField.fill(SW_PASS);
      console.log('Logging in...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
        page.locator(loginButtonSelector).first().click()
      ]);
    }
    
    console.log('Logged in. Waiting for AJAX requests...');
    await page.waitForTimeout(12000); // Wait for background requests to fire
    
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}
run();
