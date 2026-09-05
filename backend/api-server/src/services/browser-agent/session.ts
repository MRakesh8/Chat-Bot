import puppeteer, { Browser, BrowserContext, Page } from "puppeteer";
import { logger } from "../../lib/logger";
import fs from "fs";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export class BrowserSessionManager {
  /**
   * Spawns an isolated, ephemeral browser session for a specific project/task.
   * Enforces zero cross-tenant storage/cookie sharing.
   */
  public static async createIsolatedSession(projectId: string, sessionId: string): Promise<BrowserSession> {
    let executablePath: string | undefined;
    try {
      executablePath = await puppeteer.executablePath();
      if (!fs.existsSync(executablePath)) {
        executablePath = undefined;
      }
    } catch (e) {
      executablePath = undefined;
    }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process"
      ]
    });

    // Create an isolated incognito browser context
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Set safe viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("RAGHUB-BrowserAgent/1.0 (Secure Business Assistant)");

    const closeSession = async () => {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
        await context.close();
        await browser.close();
      } catch (err: any) {
        logger.error({ err: err.message, projectId, sessionId }, "[BROWSER_SESSION] Error closing session");
      }
    };

    return {
      browser,
      context,
      page,
      close: closeSession
    };
  }
}
