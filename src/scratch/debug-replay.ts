import { chromium } from "playwright"

async function main() {
  console.log("Launching Chromium headlessly...")
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  })
  const page = await context.newPage()

  page.on("console", msg => console.log(`[CONSOLE] [${msg.type()}] ${msg.text()}`))
  page.on("pageerror", err => console.log(`[PAGE ERROR] ${err.message}`))

  console.log("Navigating to https://albawaba.apptomator.com/home...")
  await page.goto("https://albawaba.apptomator.com/home", { waitUntil: "domcontentloaded" })

  console.log("Polling page state for 25 seconds...")
  for (let i = 1; i <= 25; i++) {
    await page.waitForTimeout(1000)
    const screenshot = await page.screenshot({ type: "png" })
    console.log(`[Second ${i}] Screenshot captured.`)
    
    // Check if the "Sign In" link exists in DOM
    const signInVisible = await page.getByRole("link", { name: "Sign In", exact: false }).isVisible()
    console.log(`[Second ${i}] Is "Sign In" visible? ${signInVisible}`)
    
    if (signInVisible) {
      console.log(`[Second ${i}] Sign In link appeared! Clicking it...`)
      await page.getByRole("link", { name: "Sign In", exact: false }).click()
      break
    }
  }

  // Wait for login page
  console.log("Waiting 5 seconds for navigation...")
  await page.waitForTimeout(5000)
  const finalScreenshot = await page.screenshot({ type: "png" })
  console.log("Final URL:", page.url())

  await context.close()
  await browser.close()
}

main().catch(console.error)
