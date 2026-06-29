import { chromium, firefox, webkit, BrowserContext } from "playwright"

/**
 * BrowserManager coordinates launching headful Playwright browsers explicitly for execution-time workstation sessions.
 * Implements video capturing setups.
 */
export class BrowserManager {
  private static contexts: Map<string, BrowserContext> = new Map()

  /**
   * Spawns a controlled execution browser context.
   */
  static async launchSession(sessionId: string, details: {
    browserType: "Chromium" | "Firefox" | "WebKit"
    startUrl: string
    viewport: { width: number; height: number }
    recordVideo: boolean
  }): Promise<BrowserContext> {
    const browserLauncher = 
      details.browserType === "Firefox" ? firefox :
      details.browserType === "WebKit" ? webkit : chromium

    const browser = await browserLauncher.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    })

    const context = await browser.newContext({
      viewport: details.viewport,
      recordVideo: details.recordVideo ? {
        dir: "./public/videos",
        size: details.viewport
      } : undefined
    })

    const page = await context.newPage()
    await page.goto(details.startUrl)

    this.contexts.set(sessionId, context)
    return context
  }

  /**
   * Closes active browser session.
   */
  static async shutdownSession(sessionId: string) {
    const context = this.contexts.get(sessionId)
    if (context) {
      await context.close()
      const browser = context.browser()
      if (browser) await browser.close()
      this.contexts.delete(sessionId)
    }
  }
}
