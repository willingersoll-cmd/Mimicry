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

/** Lightweight DOM signal counts captured at action time. */
export interface DomSignals {
  buttons: number;
  links: number;
  inputs: number;
  clickable: number;
}

/**
 * Count interactive targets currently in the DOM. Used by the effort model to
 * estimate pointing/clutter cost. Falls back to zeros if evaluation fails.
 */
export async function captureDomSignals(page: Page): Promise<DomSignals> {
  try {
    return await page.evaluate(() => {
      const count = (sel: string) => document.querySelectorAll(sel).length;
      const buttons = count(
        'button, input[type="submit"], input[type="button"], [role="button"]'
      );
      const links = count('a[href]');
      const inputs = count('input:not([type="hidden"]), textarea, select');
      return { buttons, links, inputs, clickable: buttons + links };
    });
  } catch {
    return { buttons: 0, links: 0, inputs: 0, clickable: 0 };
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
