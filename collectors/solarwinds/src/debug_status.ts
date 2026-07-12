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
    }
    
    await page.waitForTimeout(6000); // Wait for tree widgets to render fully
    
    // Let's find each element and look at its ancestors/siblings
    const targets = ['BSNL', 'OSP', 'TCL', 'SIFY'];
    for (const target of targets) {
      console.log(`\n================== ANCESTRY FOR ${target} ==================`);
      const loc = page.locator(`span:has-text("${target}")`).first();
      if (await loc.count() > 0) {
        const info = await loc.evaluate((node) => {
          let current = node;
          const layers = [];
          for (let i = 0; i < 4; i++) {
            if (current.parentElement) {
              layers.push({
                tagName: current.parentElement.tagName,
                className: current.parentElement.className,
                html: current.parentElement.outerHTML.substring(0, 1000)
              });
              current = current.parentElement;
            }
          }
          return layers;
        });
        
        info.forEach((layer, idx) => {
          console.log(`Layer ${idx + 1}: <${layer.tagName}> class="${layer.className}"`);
          console.log(`HTML snippet: ${layer.html.substring(0, 400)}...\n`);
        });
      } else {
        console.log(`No span matching ${target} found.`);
      }
    }
    
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}
run();
