import { chromium } from 'playwright';
import path from 'path';
import readline from 'readline';

const SYM_URL = process.env.SYM_URL || 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx';
const profileDir = path.join(__dirname, '../../edge-profile');

console.log('==================================================');
console.log('Symphony HSD Interactive Login & MFA Initializer');
console.log('==================================================');
console.log(`Profile Directory: ${profileDir}`);
console.log('Opening MS Edge browser in interactive mode...');

async function interactiveLogin() {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'msedge',
    headless: false,
    viewport: null, // Allow browser window resizing
    args: ['--start-maximized']
  });

  const page = await context.newPage();
  console.log(`Navigating to: ${SYM_URL}`);
  await page.goto(SYM_URL);

  console.log('\n--> ACTION REQUIRED IN BROWSER WINDOW <--');
  console.log('1. Log in with your corporate AD credentials.');
  console.log('2. Perform the MFA OTP check and check "Don\'t ask again for 60 days" if prompted.');
  console.log('3. Wait until the Symphony Dashboard (incident counts page) fully loads.');
  console.log('\nOnce you see the dashboard, press ENTER here in the terminal to save session and close...');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('', async () => {
    console.log('Closing browser and saving persistent session...');
    await context.close();
    rl.close();
    console.log('Session saved successfully! You can now run the background PM2 scraper.');
    process.exit(0);
  });
}

interactiveLogin().catch((err) => {
  console.error('Failed to run interactive login:', err);
  process.exit(1);
});
