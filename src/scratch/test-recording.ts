import { PrismaClient } from "@prisma/client"
import { startSession, activeSessions, saveCurrentRecordedTestCase, finishSession } from "../lib/recording/session-manager"

const prisma = new PrismaClient()

async function main() {
  console.log("Cleaning up active recording sessions in database...")
  await prisma.recordingSession.updateMany({
    where: { status: "Active" },
    data: { status: "Cancelled", finishedAt: new Date() }
  })

  const projectId = "9c57dd4e-5c96-45b6-9c56-84905b1e25fa"
  const userId = "c39816bc-044b-4a0c-89de-d61da5c2934f"

  console.log("Starting a new recording session via session-manager...")
  const result = await startSession(projectId, userId, {
    title: "Albawaba Login Flow",
    module: "Authentication",
    priority: "High",
    startUrl: "https://albawaba.apptomator.com/home",
    browserType: "Chromium",
    viewport: "Desktop"
  })

  const { session, testCase } = result
  if (!session) {
    throw new Error("Session was not created in database")
  }
  const sessionId = session.id
  const testCaseId = testCase.id
  console.log(`Started session: ${sessionId}, Test Case Draft: ${testCaseId}`)

  // Retrieve active session from session-manager map
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) {
    throw new Error("Active session was not found in activeSessions map!")
  }

  const { page } = activeSess

  // Register console and pageerror event listeners for debugging
  page.on("console", msg => console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`))
  page.on("pageerror", err => console.log(`[BROWSER EXCEPTION] ${err.stack || err.message}`))

  console.log("Waiting for page load and initial open_url step...")
  await page.waitForLoadState("load")
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Log diagnostic info from the page context
  const homeDiag = await page.evaluate(() => {
    const fn = (window as any).qaRecordAction;
    return {
      url: window.location.href,
      injected: (window as any).__qa_recorder_injected,
      hostExists: !!document.getElementById("__qa_recorder_host"),
      bodyExists: !!document.body,
      isTop: window.self === window.top,
      typeofQaRecordAction: typeof fn,
      isNull: fn === null,
      isUndefined: fn === undefined,
      isFunction: typeof fn === 'function',
      toStringVal: fn ? fn.toString() : 'null/undefined',
      keys: fn ? Object.keys(fn) : []
    }
  })
  console.log("DIAGNOSTICS ON HOME PAGE:", homeDiag)

  console.log("Clicking on 'Sign In' link...")
  // Click on Sign In link. The injected script will capture it, wait for flush, and navigate.
  await page.click('text="Sign In"')
  
  console.log("Waiting for login page navigation...")
  // Wait for the URL to change to identity app
  await page.waitForURL(/identity\.albawaba\.apptomator\.com|interaction/, { timeout: 15000 })
  console.log("Navigated to:", page.url())

  // Wait for the login elements to be ready
  await page.waitForSelector("#email")

  // Log diagnostic info from the page context
  const diag = await page.evaluate(() => {
    return {
      url: window.location.href,
      injected: (window as any).__qa_recorder_injected,
      hostExists: !!document.getElementById("__qa_recorder_host"),
      bodyExists: !!document.body,
      isTop: window.self === window.top,
      hasQaRecordAction: typeof (window as any).qaRecordAction
    }
  })
  console.log("DIAGNOSTICS ON LOGIN PAGE:", diag)

  console.log("Typing username...")
  await page.click("#email")
  await page.fill("#email", "Mary.Mellow")
  // manually trigger change event on input so injected script records it
  await page.evaluate(() => {
    const el = document.getElementById("email")
    if (el) {
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }
  })
  console.log("Waiting for username step flush...")
  await new Promise(resolve => setTimeout(resolve, 2000))

  console.log("Typing password...")
  await page.click("#password")
  await page.fill("#password", "P@ssw0rd@123")
  // manually trigger change event on input so injected script records it
  await page.evaluate(() => {
    const el = document.getElementById("password")
    if (el) {
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }
  })
  console.log("Waiting for password step flush...")
  await new Promise(resolve => setTimeout(resolve, 2000))

  console.log("Clicking submit login button...")
  await page.click("#submit_login")

  console.log("Waiting for redirect/navigation back to home page...")
  try {
    await page.waitForURL(/albawaba\.apptomator\.com\/home/, { timeout: 15000 })
  } catch (e) {
    console.log("Timed out waiting for URL redirect, continuing... Current URL:", page.url())
  }

  // Sleep to allow queue processing and screenshot saving to persist
  console.log("Sleeping to allow final flushes...")
  await new Promise(resolve => setTimeout(resolve, 5000))

  console.log("Saving the test case draft...")
  await saveCurrentRecordedTestCase(sessionId, testCaseId)

  console.log("Finishing the recording session...")
  await finishSession(sessionId)

  console.log("\n=================== RECORDED STEPS IN DB ===================")
  const steps = await prisma.recordedStep.findMany({
    where: { recordedTestCaseId: testCaseId },
    orderBy: { stepNumber: "asc" }
  })

  for (const step of steps) {
    console.log(`Step ${step.stepNumber}: [${step.actionType}] ${step.actionDescription}`)
    console.log(`  URL: ${step.pageUrl}`)
    console.log(`  Selector: ${step.recommendedSelector || step.cssSelector}`)
    console.log(`  Value: ${step.inputValue || step.targetValue}`)
    if (step.screenshotAfter) {
      console.log(`  Screenshot: ${step.screenshotAfter}`)
    }
    console.log("---------------------------------------------------------")
  }

  console.log("\nDraft successfully saved as a TestCase!")
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
