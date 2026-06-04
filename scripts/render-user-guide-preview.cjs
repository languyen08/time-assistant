const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const GUIDE_FILE = path.join(ROOT, 'docs', 'user-guide.html');
const OUTPUT_FILE = path.join(ARTIFACTS_DIR, 'user-guide-preview.png');

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (_error) {
    return chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
  }
}

async function main() {
  if (!fs.existsSync(GUIDE_FILE)) {
    throw new Error('user-guide.html was not found.');
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 2600 } });
    const target = `file:///${GUIDE_FILE.replace(/\\/g, '/')}`;
    await page.goto(target, { waitUntil: 'load' });
    await page.screenshot({ path: OUTPUT_FILE, fullPage: true });

    const result = await page.evaluate(() => ({
      title: document.title,
      imageCount: document.images.length,
      loadedImages: Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth > 0,
      ).length,
    }));

    console.log(JSON.stringify({ output: OUTPUT_FILE, ...result }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
