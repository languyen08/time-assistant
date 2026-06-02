const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4300', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('#settings');
  await page.screenshot({ path: 'artifacts/settings-modal-before.png' });
  await browser.close();
})();
