import { chromium, Browser, Page } from 'playwright';

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    try {
      browserInstance = await chromium.launch({
        headless: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Executable doesn't exist") || msg.includes("chromium_headless_shell")) {
        // Fallback: use system Chrome when Playwright's bundled browser isn't installed
        browserInstance = await chromium.launch({
          channel: 'chrome',
          headless: true,
        });
      } else {
        throw err;
      }
    }
  }
  return browserInstance;
}

export async function createPage(): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Set a reasonable viewport size
  await page.setViewportSize({ width: 1280, height: 720 });
  
  return page;
}

export async function captureScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ fullPage: false });
  return buffer.toString('base64');
}

export async function navigateToUrl(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle times out
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
