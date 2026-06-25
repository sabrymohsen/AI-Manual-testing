import { prisma } from "@/lib/db"
import { chromium, Browser, Page } from "playwright"
import { QAAgentRunStatus, QAAgentMode, QAAgentSafetyLevel, QAAgentFindingType, Priority } from "@prisma/client"
import { scanPage } from "./scanner"
import { generateTestPlan } from "./planner"
import { executeQAAgentPlan } from "./executor"
import { generateQAAgentSummary } from "./reporter"
import { isQAAgentCancelSignalSet } from "@/lib/queue"
import { decryptSecret } from "@/lib/crypto"
import { saveAgentScreenshot } from "./artifacts"
import path from "node:path"
import fs from "node:fs/promises"
import { Page as PlaywrightPage } from "playwright"

async function takeScreenshotSecure(page: PlaywrightPage, runId: string, name: string) {
  if (page.isClosed()) return ""
  try {
    // Mask password inputs values just in case they are shown
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      inputs.forEach(input => {
        (input as HTMLInputElement).value = "••••••••";
      });
    }).catch(() => {})
    const scr = await page.screenshot({ type: "png" })
    return await saveAgentScreenshot(runId, name, scr)
  } catch (err) {
    console.warn(`[QAAgentBrain] Secure screenshot failed for ${name}:`, err)
    return ""
  }
}

export class AgentRunCancelledError extends Error {
  constructor() {
    super("CANCELLED")
    this.name = "AgentRunCancelledError"
  }
}

export async function assertNotCancelled(agentRunId: string, browser?: Browser) {
  const isCancelledInRedis = await isQAAgentCancelSignalSet(agentRunId)
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: agentRunId },
    select: { status: true, cancelRequested: true }
  })

  if (!run || run.status === "Cancelled" || run.cancelRequested || isCancelledInRedis) {
    if (browser) {
      await browser.close().catch(() => {})
    }
    throw new AgentRunCancelledError()
  }
}

export const assertAgentRunNotCancelled = assertNotCancelled;

export async function logAgentRunEvent(
  agentRunId: string,
  level: string,
  phase: string | null,
  message: string,
  details?: any
) {
  try {
    await prisma.qAAgentRunEvent.create({
      data: {
        agentRunId,
        level,
        phase,
        message,
        details: details ? (details as any) : undefined
      }
    })
  } catch (err) {
    console.error("[QAAgentBrain] Failed to log agent run event:", err)
  }
}

export async function updateRunProgress(
  runId: string,
  phase: string,
  status: QAAgentRunStatus | null,
  stepStatus: "Pending" | "Running" | "Completed" | "Failed" | "Skipped" | "Cancelled",
  message: string,
  details?: any,
  error?: string,
  progressValue?: number
) {
  const now = new Date()
  
  // Calculate progress based on phase if not explicitly provided
  const progressByStatus: Record<string, number> = {
    "Queued": 5,
    "OpeningTargetUrl": 15,
    "DetectingLoginEntry": 25,
    "OpeningLoginPage": 35,
    "DetectingLoginForm": 45,
    "FillingCredentials": 55,
    "SubmittingLogin": 65,
    "VerifyingLogin": 75,
    "ScanningAuthenticatedPage": 85,
    "GeneratingTestPlan": 90,
    "Reporting": 95,
    "Completed": 100,
    "Failed": 100,
    "Cancelled": 100
  }
  const progress = progressValue !== undefined ? progressValue : (progressByStatus[phase] || 10)

  // Update QAAgentRun fields
  await prisma.qAAgentRun.update({
    where: { id: runId },
    data: {
      ...(status ? { status } : {}),
      currentPhase: phase,
      currentMessage: message,
      lastHeartbeatAt: now,
      currentPhaseStartedAt: now,
      progress
    }
  })

  // Automatically log a QAAgentRunEvent if not already logged
  try {
    const existing = await prisma.qAAgentRunEvent.findFirst({
      where: { agentRunId: runId, phase, message }
    })
    if (!existing) {
      await prisma.qAAgentRunEvent.create({
        data: {
          agentRunId: runId,
          level: (error || stepStatus === "Failed") ? "error" : "info",
          phase,
          message,
          details: details ? (details as any) : undefined
        }
      })
    }
  } catch (err) {
    console.error("[QAAgentBrain] Auto event log failed:", err)
  }

  // Map phase name to stepNumber for steps rendering order
  const phaseOrder: Record<string, number> = {
    "Queued": 1,
    "OpeningTargetUrl": 2,
    "DetectingLoginEntry": 3,
    "OpeningLoginPage": 4,
    "DetectingLoginForm": 5,
    "FillingCredentials": 6,
    "SubmittingLogin": 7,
    "VerifyingLogin": 8,
    "ScanningAuthenticatedPage": 9,
    "GeneratingTestPlan": 10,
    "Reporting": 11,
    "Completed": 12,
    "Failed": 12,
    "Cancelled": 12
  }
  const stepNumber = phaseOrder[phase] || 99

  // Check if step exists
  const existingStep = await prisma.qAAgentRunStep.findFirst({
    where: { agentRunId: runId, name: phase }
  })

  if (existingStep) {
    await prisma.qAAgentRunStep.update({
      where: { id: existingStep.id },
      data: {
        status: stepStatus,
        details: details ? (details as any) : undefined,
        error: error || null,
        completedAt: (stepStatus === "Completed" || stepStatus === "Failed" || stepStatus === "Cancelled") ? now : undefined,
        updatedAt: now
      }
    })
  } else {
    await prisma.qAAgentRunStep.create({
      data: {
        agentRunId: runId,
        stepNumber,
        name: phase,
        type: phase,
        status: stepStatus,
        startedAt: now,
        completedAt: (stepStatus === "Completed" || stepStatus === "Failed" || stepStatus === "Cancelled") ? now : undefined,
        details: details ? (details as any) : undefined,
        error: error || null
      }
    })
  }
}

// Global destructive keywords to prevent clicking
const DESTRUCTIVE_KEYWORDS = [
  "delete", "remove", "drop", "cancel", "terminate",
  "payment", "purchase", "transfer", "pay", "charge",
  "subscribe", "unsubscribe", "buy", "checkout",
  "irreversible", "wipe", "purge", "reset", "archive",
  "clear all", "save changes"
]

export async function runQAAgentPipeline(runId: string) {
  console.log(`[QAAgentBrain] Launching pipeline orchestrator for run: ${runId}`)
  const startTime = Date.now()

  // Fetch QAAgentRun details
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: { project: true }
  })

  if (!run) {
    throw new Error(`QAAgentRun ${runId} not found`)
  }

  // Validate target URL format
  if (!run.project.webAppUrl) {
    const errMsg = `Target webapp URL not configured for project: ${run.project.name}`
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: {
        status: QAAgentRunStatus.Failed,
        completedAt: new Date(),
        currentPhase: "Failed",
        currentMessage: errMsg,
        failedReason: errMsg,
        currentPhaseStartedAt: new Date(),
        progress: 100
      }
    })
    throw new Error(errMsg)
  }

  // 1. Set up heartbeat timer every 5 seconds
  const heartbeatTimer = setInterval(async () => {
    try {
      const current = await prisma.qAAgentRun.findUnique({
        where: { id: runId },
        select: { status: true }
      })
      if (!current || ["Completed", "Failed", "Cancelled"].includes(current.status)) {
        clearInterval(heartbeatTimer)
        return
      }
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: { lastHeartbeatAt: new Date() }
      })
    } catch (err) {
      console.error("[QAAgentBrain] Heartbeat error:", err)
    }
  }, 5000)

  let browser: Browser | null = null
  let page: Page | null = null

  // Configurable total timeout (default 10 minutes)
  const scopeData = run.scope as any
  const totalTimeoutMinutes = scopeData?.maxTime || scopeData?.totalTimeoutMinutes || 10
  const totalTimeoutMs = totalTimeoutMinutes * 60 * 1000

  // We wrap the main logic in a promise to allow race-timeout
  const runPromise = async () => {
    // If the goal is "Run existing tests" or if it is "Generate and run smoke tests" and we already have a plan
    if (run.goal === "Run existing tests" && run.plan) {
      console.log(`[QAAgentBrain] Goal is Run existing tests. Jumping straight to execution.`)
      await updateRunProgress(runId, "OpeningTargetUrl", QAAgentRunStatus.Running, "Completed", "Skipping scan, running plan...")
      await runQAAgentExecutionPipeline(runId)
      return
    }

    // Initialize all timeline phases to Pending in the DB (for a clean visual timeline)
    const allPhases = [
      "OpeningTargetUrl",
      "DetectingLoginEntry",
      "OpeningLoginPage",
      "DetectingLoginForm",
      "FillingCredentials",
      "SubmittingLogin",
      "VerifyingLogin",
      "ScanningAuthenticatedPage",
      "GeneratingTestPlan",
      "Reporting"
    ]
    for (let idx = 0; idx < allPhases.length; idx++) {
      const pName = allPhases[idx]
      const existing = await prisma.qAAgentRunStep.findFirst({
        where: { agentRunId: runId, name: pName }
      })
      if (!existing) {
        await prisma.qAAgentRunStep.create({
          data: {
            agentRunId: runId,
            stepNumber: idx + 2,
            name: pName,
            type: pName,
            status: "Pending"
          }
        })
      }
    }

    // Launch Browser
    await assertAgentRunNotCancelled(runId)
    await updateRunProgress(runId, "OpeningTargetUrl", QAAgentRunStatus.Scanning, "Running", "Launching Chromium browser...")
    
    browser = await chromium.launch({ headless: true, timeout: 60000 })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    })
    await context.addInitScript("window.__name = (t) => t;")
    page = await context.newPage()

    // Setup logging hooks
    const consoleErrors: string[] = []
    const networkErrors: string[] = []
    page.on("console", msg => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })
    page.on("pageerror", err => {
      consoleErrors.push(err.message)
    })
    page.on("requestfailed", req => {
      const errText = req.failure()?.errorText || "Network request failed"
      networkErrors.push(`${req.method()} ${req.url()} failed: ${errText}`)
    })

    const targetUrl = scopeData?.targetUrl || run.project.webAppUrl
    await logAgentRunEvent(runId, "info", "OpeningTargetUrl", `Opening target URL: ${targetUrl}`)
    
    // F. Opening Target URL phase
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
      await page.waitForTimeout(2000)
    } catch (err: any) {
      throw new Error(`Target URL ${targetUrl} did not load within 45 seconds: ${err.message}`)
    }

    // Capture initial screenshot
    const initialScrPath = await takeScreenshotSecure(page, runId, "initial-target.png")
    
    await updateRunProgress(
      runId,
      "OpeningTargetUrl",
      null,
      "Completed",
      `Target URL ${targetUrl} loaded successfully.`,
      { url: targetUrl, screenshotPath: initialScrPath }
    )

    // Load credentials if selected
    let credential = null
    if (run.credentialId) {
      credential = await prisma.projectCredential.findUnique({
        where: { id: run.credentialId }
      })
    }

    const isLoginRelatedGoal = ["Test login flow", "Test login and scan dashboard"].includes(run.goal)

    // Check if we should execute the login flow
    if (credential && isLoginRelatedGoal) {
      // PHASE 2: DetectingLoginEntry
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "DetectingLoginEntry", null, "Running", "Scanning page for login button or Sign In entry point...")

      const entryTexts = [
        "Sign In", "Signin", "Login", "Log In", "تسجيل الدخول", 
        "Continue", "Get Started", "Account", "Dashboard", "Admin Login"
      ]

      let clickMethod = ""
      let clicked = false
      let afterSignInScrPath = ""

      // Try finding data-testid login/signin
      const testidLocators = [
        "data-testid=login", "data-testid=signin", "data-testid=sign-in", "data-testid=log-in",
        "[data-testid*='login' i]", "[data-testid*='signin' i]", "[data-testid*='sign-in' i]"
      ]
      for (const sel of testidLocators) {
        const loc = page.locator(sel).first()
        if (await loc.isVisible().catch(() => false)) {
          await loc.click()
          clickMethod = `data-testid locator: ${sel}`
          clicked = true
          break
        }
      }

      // Try role button/link with name matching regex
      if (!clicked) {
        const roles: ("button" | "link")[] = ["button", "link"]
        for (const role of roles) {
          for (const text of entryTexts) {
            const loc = page.getByRole(role, { name: text, exact: false }).first()
            if (await loc.isVisible().catch(() => false)) {
              await loc.click()
              clickMethod = `getByRole(${role}, {name: "${text}"})`
              clicked = true
              break
            }
          }
          if (clicked) break
        }
      }

      // Try text match
      if (!clicked) {
        for (const text of entryTexts) {
          const loc = page.getByText(text, { exact: false }).first()
          if (await loc.isVisible().catch(() => false)) {
            await loc.click()
            clickMethod = `getByText("${text}")`
            clicked = true
            break
          }
        }
      }

      // Try href contains login/signin/auth
      if (!clicked) {
        const hrefSelectors = [
          "a[href*='login' i]", "a[href*='signin' i]", "a[href*='auth' i]",
          "button[onclick*='login' i]", "button[onclick*='signin' i]"
        ]
        for (const sel of hrefSelectors) {
          const loc = page.locator(sel).first()
          if (await loc.isVisible().catch(() => false)) {
            await loc.click()
            clickMethod = `CSS href/onclick locator: ${sel}`
            clicked = true
            break
          }
        }
      }

      let loginUrlUsed = credential.loginUrl || run.project.webAppUrl

      if (clicked) {
        await page.waitForTimeout(3000)
        afterSignInScrPath = await takeScreenshotSecure(page, runId, "after-sign-in.png")
        await updateRunProgress(
          runId,
          "DetectingLoginEntry",
          null,
          "Completed",
          `Detected and clicked Sign In button using: ${clickMethod}.`,
          { method: clickMethod, entryPointFound: true, screenshotPath: afterSignInScrPath }
        )
      } else {
        // Fallback: If not clicked but we have a login URL
        if (credential.loginUrl) {
          await page.goto(credential.loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
          await page.waitForTimeout(2000)
          afterSignInScrPath = await takeScreenshotSecure(page, runId, "after-sign-in.png")
          await updateRunProgress(
            runId,
            "DetectingLoginEntry",
            null,
            "Completed",
            `Login button not found. Direct navigating to credentials login URL: ${credential.loginUrl}`,
            { entryPointFound: false, loginUrlUsed: credential.loginUrl, screenshotPath: afterSignInScrPath }
          )
        } else {
          // Create a warning finding
          await prisma.qAAgentFinding.create({
            data: {
              agentRunId: runId,
              type: QAAgentFindingType.BrokenElement,
              severity: Priority.Medium,
              title: "Login Entry Point Not Detected",
              description: "The agent scanned the homepage but could not detect a visible Sign In or Login button. Please configure a login URL in Project Settings credentials.",
              evidence: { targetUrl }
            }
          })
          await updateRunProgress(
            runId,
            "DetectingLoginEntry",
            null,
            "Failed",
            "Login entry point not detected on page. Redirecting directly...",
            { entryPointFound: false }
          )
        }
      }

      // PHASE 3: OpeningLoginPage
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "OpeningLoginPage", null, "Running", "Loading login form interface...")
      await page.waitForTimeout(2000)
      
      const loginPageScrPath = await takeScreenshotSecure(page, runId, "login-page.png")

      await updateRunProgress(
        runId,
        "OpeningLoginPage",
        null,
        "Completed",
        "Login page/modal opened successfully.",
        { screenshotPath: loginPageScrPath }
      )

      // PHASE 4: DetectingLoginForm
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "DetectingLoginForm", null, "Running", "Detecting credentials input elements...")
      
      const formFields = await page.evaluate(() => {
        function getElementSelectorAndScore(el: HTMLInputElement | HTMLButtonElement | HTMLElement): { selector: string; score: number; type: string } {
          const testid = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa")
          if (testid) {
            return { selector: `[data-testid="${testid}"]`, score: 100, type: "testid" }
          }

          const role = el.getAttribute("role") || (el.tagName.toLowerCase() === "button" ? "button" : "")
          const ariaLabel = el.getAttribute("aria-label")
          const id = el.id
          const name = el.getAttribute("name")
          const placeholder = el.getAttribute("placeholder")

          if (role && ariaLabel) {
            return { selector: `role=${role}[name="${ariaLabel}"]`, score: 95, type: "role" }
          }
          if (ariaLabel) {
            return { selector: `[aria-label="${ariaLabel}"]`, score: 90, type: "aria-label" }
          }
          if (id) {
            return { selector: `#${id}`, score: 85, type: "id" }
          }
          if (name) {
            return { selector: `input[name="${name}"]`, score: 75, type: "name" }
          }
          if (placeholder) {
            return { selector: `input[placeholder="${placeholder}"]`, score: 75, type: "placeholder" }
          }

          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`)
            if (lbl && lbl.textContent) {
              return { selector: `label:has-text("${lbl.textContent.trim()}")`, score: 80, type: "label" }
            }
          }

          let css = el.tagName.toLowerCase()
          if (el.className) {
            const classes = Array.from(el.classList).filter(c => !c.includes(":")).join(".")
            if (classes) css += "." + classes
          }
          return { selector: css, score: 60, type: "css" }
        }

        // Username / Email input
        let usernameEl: any = null
        const usernameSelectors = [
          'input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]', 'input[placeholder*="email" i]',
          'input[name*="username" i]', 'input[id*="username" i]', 'input[placeholder*="username" i]',
          'input[name*="user" i]', 'input[id*="user" i]', 'input[placeholder*="user" i]'
        ]
        for (const sel of usernameSelectors) {
          const found = document.querySelector(sel)
          if (found) { usernameEl = found; break; }
        }
        if (!usernameEl) {
          const labels = Array.from(document.querySelectorAll("label"))
          for (const label of labels) {
            const txt = (label.textContent || "").toLowerCase()
            if (txt.includes("email") || txt.includes("username") || txt.includes("user")) {
              const assoc = label.getAttribute("for")
              usernameEl = assoc ? document.getElementById(assoc) : label.querySelector("input")
              if (usernameEl) break
            }
          }
        }

        // Password input
        let passwordEl: any = null
        const passwordSelectors = [
          'input[type="password"]', 'input[name*="password" i]', 'input[id*="password" i]', 'input[placeholder*="password" i]'
        ]
        for (const sel of passwordSelectors) {
          const found = document.querySelector(sel)
          if (found) { passwordEl = found; break; }
        }

        // Submit Button
        let submitEl: any = null
        const submitTexts = ["sign in", "login", "log in", "submit", "continue", "دخول", "تسجيل الدخول"]
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], [role='button']"))
        for (const btn of buttons) {
          const txt = (btn.textContent || (btn as HTMLInputElement).value || "").toLowerCase()
          if (submitTexts.some(t => txt.includes(t))) {
            submitEl = btn
            break
          }
        }
        if (!submitEl) {
          submitEl = document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]')
        }

        return {
          username: usernameEl ? getElementSelectorAndScore(usernameEl) : null,
          password: passwordEl ? getElementSelectorAndScore(passwordEl) : null,
          submit: submitEl ? getElementSelectorAndScore(submitEl) : null
        }
      })

      const missingFields: string[] = []
      if (!formFields.username) missingFields.push("Username/Email field")
      if (!formFields.password) missingFields.push("Password field")
      if (!formFields.submit) missingFields.push("Submit Button")

      if (missingFields.length > 0) {
        const desc = `Login form elements were not detected. Missing: ${missingFields.join(", ")}.`
        await prisma.qAAgentFinding.create({
          data: {
            agentRunId: runId,
            type: QAAgentFindingType.BrokenElement,
            severity: Priority.High,
            title: "Login Form Elements Missing",
            description: desc,
            evidence: { formFields }
          }
        })
        await updateRunProgress(
          runId,
          "DetectingLoginForm",
          null,
          "Failed",
          desc,
          {
            formFields,
            loginFormFound: false,
            usernameFieldFound: !!formFields.username,
            passwordFieldFound: !!formFields.password,
            submitButtonFound: !!formFields.submit
          }
        )
        throw new Error(desc)
      }

      // Log weak locator warnings if score < 80
      const fields = [
        { name: "Username", item: formFields.username },
        { name: "Password", item: formFields.password },
        { name: "Submit", item: formFields.submit }
      ]
      for (const f of fields) {
        if (f.item && f.item.score < 80) {
          await prisma.qAAgentFinding.create({
            data: {
              agentRunId: runId,
              type: QAAgentFindingType.AccessibilityIssue,
              severity: Priority.Low,
              title: `Weak Locator Detected for ${f.name}`,
              description: `The selector '${f.item.selector}' has a low score (${f.item.score}). Consider adding data-testid for robustness.`,
              evidence: { selector: f.item.selector, score: f.item.score }
            }
          })
        }
      }

      const loginFormScrPath = await takeScreenshotSecure(page, runId, "login-form-detected.png")

      await updateRunProgress(
        runId,
        "DetectingLoginForm",
        null,
        "Completed",
        "Username, password, and submit elements detected successfully.",
        {
          formFields,
          loginFormFound: true,
          usernameFieldFound: !!formFields.username,
          passwordFieldFound: !!formFields.password,
          submitButtonFound: !!formFields.submit,
          screenshotPath: loginFormScrPath
        }
      )

      // Get decrypted password
      const decryptedPassword = decryptSecret({
        encrypted: credential.encryptedPassword,
        iv: credential.encryptionIv,
        authTag: credential.encryptionAuthTag,
        keyVersion: credential.keyVersion
      })

      // PHASE 5: FillingCredentials
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "FillingCredentials", null, "Running", "Filling in masked credentials...")

      // Clear and fill username
      const userLoc = page.locator(formFields.username!.selector).first()
      await userLoc.fill(credential.username)

      // Clear and fill password
      const passLoc = page.locator(formFields.password!.selector).first()
      await passLoc.fill(decryptedPassword)

      await updateRunProgress(
        runId,
        "FillingCredentials",
        null,
        "Completed",
        "Username and password credentials populated successfully."
      )

      // PHASE 6: SubmittingLogin
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "SubmittingLogin", null, "Running", "Submitting login form authentication request...")

      // Submit click
      const submitLoc = page.locator(formFields.submit!.selector).first()
      await submitLoc.click()
      await page.waitForTimeout(3000)

      await updateRunProgress(
        runId,
        "SubmittingLogin",
        null,
        "Completed",
        "Login form submitted. Processing response..."
      )

      // PHASE 7: VerifyingLogin
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "VerifyingLogin", null, "Running", "Verifying authentication state changes...")

      // Verify using multiple signals
      const afterSubmitUrl = page.url()
      const urlChanged = afterSubmitUrl !== loginUrlUsed
      
      // Look for dashboard elements (sidebar, logout button/link, profile card, etc.)
      const hasSidebar = await page.locator("aside, nav, .sidebar, .sidenav, [role='navigation']").first().isVisible().catch(() => false)
      const hasLogout = await page.locator("button, a").filter({ hasText: /logout|signout|sign out|log out|خروج/i }).first().isVisible().catch(() => false)
      const hasAvatar = await page.locator("img[class*='avatar' i], div[class*='avatar' i], [role='img'][aria-label*='user' i]").first().isVisible().catch(() => false)
      
      // Verify no visible login error messages on page
      const hasLoginError = await page.evaluate(() => {
        const errorKeywords = ["invalid", "incorrect", "failed", "wrong", "error", "خطأ", "unauthorized", "credential"]
        const el = document.body
        const text = (el.textContent || el.innerText || "").toLowerCase()
        return errorKeywords.some(kw => text.includes(kw)) && (text.length < 5000) // avoid false alarms on big text
      })

      let loginResult: "Passed" | "Failed" | "Uncertain" = "Failed"
      if (hasSidebar || hasLogout || hasAvatar) {
        loginResult = "Passed"
      } else if (urlChanged && !hasLoginError) {
        loginResult = "Uncertain"
      } else {
        loginResult = "Failed"
      }

      const submitScrPath = await takeScreenshotSecure(page, runId, "after-login-submit.png")

      if (loginResult === "Passed") {
        await updateRunProgress(
          runId,
          "VerifyingLogin",
          null,
          "Completed",
          "Authentication succeeded. Dashboard loaded.",
          { afterUrl: afterSubmitUrl, hasSidebar, hasLogout, hasAvatar, screenshotPath: submitScrPath, loginResult }
        )
      } else if (loginResult === "Uncertain") {
        await prisma.qAAgentFinding.create({
          data: {
            agentRunId: runId,
            type: QAAgentFindingType.Risk,
            severity: Priority.Medium,
            title: "Authentication Result Uncertain",
            description: `The URL changed after submitting login to '${afterSubmitUrl}', but typical dashboard elements (sidebar, logout button, avatar) were not found on the page.`,
            evidence: { afterUrl: afterSubmitUrl, urlChanged, hasSidebar, hasLogout, hasAvatar, screenshotPath: submitScrPath }
          }
        })
        await updateRunProgress(
          runId,
          "VerifyingLogin",
          null,
          "Completed",
          "Authentication result is uncertain. Continuing scanning.",
          { afterUrl: afterSubmitUrl, hasSidebar, hasLogout, hasAvatar, screenshotPath: submitScrPath, loginResult }
        )
      } else {
        const failMsg = `Authentication failed. URL: ${afterSubmitUrl}`
        await prisma.qAAgentFinding.create({
          data: {
            agentRunId: runId,
            type: QAAgentFindingType.TestFailure,
            severity: Priority.High,
            title: "Authentication Failed",
            description: "The agent filled and submitted credentials but was unable to verify a successful login. Dashboard or logout indicators were not detected and/or errors were present.",
            evidence: { afterUrl: afterSubmitUrl, hasSidebar, hasLogout, hasAvatar, hasLoginError, screenshotPath: submitScrPath }
          }
        })
        await updateRunProgress(
          runId,
          "VerifyingLogin",
          null,
          "Failed",
          failMsg,
          { afterUrl: afterSubmitUrl, hasSidebar, hasLogout, hasAvatar, screenshotPath: submitScrPath, loginResult }
        )
        throw new Error(failMsg)
      }
    } else {
      // Credential-free or Public scan mode
      await updateRunProgress(runId, "DetectingLoginEntry", null, "Skipped", "Skipped Login Entry Point Scan (Public mode).")
      await updateRunProgress(runId, "OpeningLoginPage", null, "Skipped", "Skipped Login Page Open (Public mode).")
      await updateRunProgress(runId, "DetectingLoginForm", null, "Skipped", "Skipped Login Form Scan (Public mode).")
      await updateRunProgress(runId, "FillingCredentials", null, "Skipped", "Skipped Credentials Filling (Public mode).")
      await updateRunProgress(runId, "SubmittingLogin", null, "Skipped", "Skipped Submit Login (Public mode).")
      await updateRunProgress(runId, "VerifyingLogin", null, "Skipped", "Skipped Login Verification (Public mode).")
    }

    // PHASE 8: ScanningAuthenticatedPage (Authenticated Dashboard scan)
    const isAuthScanEnabled = run.goal === "Test login and scan dashboard"
    const hasActiveLogin = !!credential

    if (isAuthScanEnabled && hasActiveLogin) {
      await assertAgentRunNotCancelled(runId, browser)
      await updateRunProgress(runId, "ScanningAuthenticatedPage", null, "Running", "Scanning authenticated dashboard pages and interactive controls...")

      // Scan layout
      const dashboardScan = await scanPage(page, page.url(), runId)

      // Capture special authenticated-dashboard screenshot path
      const authScr = await page.screenshot({ type: "png" })
      const absoluteAuthPath = path.join(process.cwd(), "storage", "agent-runs", runId, "authenticated-dashboard.png")
      await fs.mkdir(path.dirname(absoluteAuthPath), { recursive: true })
      await fs.writeFile(absoluteAuthPath, authScr)

      const relativeAuthPath = await saveAgentScreenshot(runId, "authenticated-dashboard.png", authScr)

      // Safe navigation item clicks: Look for safe menu items to click
      const safeLinks = dashboardScan.links.filter(l => {
        const text = (l.text || "").toLowerCase()
        const isSafe = ["dashboard", "projects", "test cases", "bug reports", "reports", "settings", "profile", "view", "open", "search", "filter", "next", "back", "close", "cancel"].some(k => text.includes(k))
        const isDestructive = DESTRUCTIVE_KEYWORDS.some(k => text.includes(k))
        return isSafe && !isDestructive
      })

      if (safeLinks.length > 0) {
        // Try to click the first safe navigation link
        const firstLink = safeLinks[0]
        const linkSel = firstLink.testid ? `[data-testid="${firstLink.testid}"]` : (firstLink.id ? `#${firstLink.id}` : `a:has-text("${firstLink.text}")`)
        await logAgentRunEvent(runId, "info", "ScanningAuthenticatedPage", `Testing safe navigation link click: "${firstLink.text}"`)
        
        try {
          await page.locator(linkSel).first().click()
          await page.waitForTimeout(2000)
          await page.goBack() // return to dashboard
        } catch (clickErr: any) {
          console.warn(`[QAAgentBrain] Safe link navigation test failed: ${clickErr.message}`)
        }
      }

      // Check for destructive items to log warnings
      const destructiveLinks = dashboardScan.links.filter(l => {
        const text = (l.text || "").toLowerCase()
        return DESTRUCTIVE_KEYWORDS.some(k => text.includes(k))
      })

      const destructiveButtons = dashboardScan.buttons.filter(b => {
        const text = (b.text || "").toLowerCase()
        return DESTRUCTIVE_KEYWORDS.some(k => text.includes(k))
      })

      const allDestructives = [
        ...destructiveLinks.map(l => ({ text: l.text, type: "link", target: l.href || "" })),
        ...destructiveButtons.map(b => ({ text: b.text, type: "button", target: b.id || b.text || "" }))
      ]

      for (const item of allDestructives) {
        await prisma.qAAgentFinding.create({
          data: {
            agentRunId: runId,
            type: QAAgentFindingType.Risk,
            severity: Priority.Medium,
            title: "Skipped destructive action by safety policy",
            description: `The agent scanned the page and detected a destructive ${item.type}: "${item.text}" (target: "${item.target}"). Under the safety policy, this action was not clicked.`,
            evidence: { item }
          }
        })
      }

      await updateRunProgress(
        runId,
        "ScanningAuthenticatedPage",
        null,
        "Completed",
        `Dashboard scanning completed successfully. Detected: ${dashboardScan.inputs.length} inputs, ${dashboardScan.buttons.length} buttons, ${dashboardScan.links.length} links.`,
        { detectedInputs: dashboardScan.inputs.length, detectedButtons: dashboardScan.buttons.length, screenshotPath: relativeAuthPath }
      )

      // Save scan output to DB
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: { scannerResult: dashboardScan as any }
      })
    } else {
      await updateRunProgress(runId, "ScanningAuthenticatedPage", null, "Skipped", "Skipped authenticated dashboard scan (Public scan or Read-Only mode).")
      
      // Perform public scan instead
      const publicScan = await scanPage(page, targetUrl, runId)
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: { scannerResult: publicScan as any }
      })
    }

    // PHASE 9: GeneratingTestPlan
    await assertAgentRunNotCancelled(runId, browser)
    await updateRunProgress(runId, "GeneratingTestPlan", QAAgentRunStatus.Planning, "Running", "Generating rule-based QA test case plan scenarios...")

    // Fetch the stored scannerResult
    const updatedRun = await prisma.qAAgentRun.findUnique({
      where: { id: runId }
    })
    const scanData = updatedRun?.scannerResult || {}
    const generatedPlan = generateTestPlan(scanData)

    await updateRunProgress(
      runId,
      "GeneratingTestPlan",
      null,
      "Completed",
      `Test case plan generated successfully. Planned ${generatedPlan.tests.length} tests.`,
      { testsCount: generatedPlan.tests.length }
    )

    // Save plan
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: { plan: generatedPlan as any }
    })

    // PHASE 10: Reporting
    await assertAgentRunNotCancelled(runId, browser)
    await updateRunProgress(runId, "Reporting", QAAgentRunStatus.Reporting, "Running", "Compiling findings, logs, and report summaries...")

    // If goal is "Generate and save test cases", automatically save the generated plan directly to the database!
    if (run.goal === "Generate and save test cases") {
      let savedCount = 0
      for (const t of generatedPlan.tests) {
        // Avoid duplicate test titles
        const existing = await prisma.testCase.findFirst({
          where: { projectId: run.projectId, title: t.name }
        })
        if (!existing) {
          await prisma.testCase.create({
            data: {
              projectId: run.projectId,
              title: t.name,
              source: "AIGenerated",
              priority: "Medium",
              steps: {
                create: t.steps.map((s, idx) => ({
                  stepNumber: idx + 1,
                  actionDescription: s.expected ? `${s.action} on ${s.target}` : s.action,
                  expectedResult: s.expected || "Action succeeds",
                  actionType: (s.action as any) || "custom_instruction",
                  targetType: (s.targetType as any) || "none",
                  targetValue: s.targetValue || null,
                  inputValue: s.value || null
                }))
              }
            }
          })
          savedCount++
        }
      }
      await logAgentRunEvent(runId, "info", "Reporting", `Automatically saved ${savedCount} generated plan tests to TestCase database.`)
    }

    // Auto-create findings for console and network errors
    for (const cErr of consoleErrors) {
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: QAAgentFindingType.ConsoleError,
          severity: Priority.Medium,
          title: "Browser Console Error Logged",
          description: cErr,
          evidence: { error: cErr }
        }
      })
    }

    for (const nErr of networkErrors) {
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: QAAgentFindingType.NetworkError,
          severity: Priority.Medium,
          title: "Failed Network Request Detected",
          description: nErr,
          evidence: { error: nErr }
        }
      })
    }

    // Clean up browser
    await browser.close()
    browser = null

    // If goal is to run tests, execute the generated/saved plan now
    if (["Generate and run smoke tests", "Find bugs automatically"].includes(run.goal)) {
      await runQAAgentExecutionPipeline(runId)
    } else {
      const summaryText = await generateQAAgentSummary(runId)
      const duration = Date.now() - startTime

      await updateRunProgress(runId, "Reporting", null, "Completed", "Report generation finished.")

      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Completed,
          completedAt: new Date(),
          durationMs: duration,
          currentPhase: "Completed",
          currentMessage: "QA Agent Brain completed successfully.",
          summary: summaryText as any,
          currentPhaseStartedAt: new Date(),
          progress: 100
        }
      })
      await logAgentRunEvent(runId, "info", "Completed", "Run completed")
      
      await prisma.qAAgentRunStep.create({
        data: {
          agentRunId: runId,
          stepNumber: 12,
          name: "Completed",
          type: "Completed",
          status: "Completed",
          startedAt: new Date(),
          completedAt: new Date()
        }
      })
    }
  }

  // Promise.race between the run promise and the global run timeout
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error(`Total run timeout after ${totalTimeoutMinutes} minutes.`)), totalTimeoutMs)
  )

  try {
    await Promise.race([runPromise(), timeoutPromise])
  } catch (err: any) {
    const activePage = page as any
    const activeBrowser = browser as any
    if (activePage && !activePage.isClosed()) {
      try {
        await takeScreenshotSecure(activePage, runId, "failure-screenshot.png")
      } catch (scrErr) {
        console.error("[QAAgentBrain] Failed to capture failure screenshot:", scrErr)
      }
    }
    if (activeBrowser) {
      await activeBrowser.close().catch(() => {})
    }

    if (err.message === "CANCELLED") {
      console.warn(`[QAAgentBrain] Run ${runId} was cancelled successfully.`)
      await logAgentRunEvent(runId, "info", "Cancelled", "Run cancelled")
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Cancelled,
          completedAt: new Date(),
          currentPhase: "Cancelled",
          currentMessage: "Agent run was cancelled by the user.",
          currentPhaseStartedAt: new Date(),
          progress: 100
        }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: { in: ["Pending", "Running"] } },
        data: { status: "Cancelled", completedAt: new Date() }
      })
    } else {
      console.error(`[QAAgentBrain] Pipeline error for run ${runId}:`, err)
      await logAgentRunEvent(runId, "error", "Failed", "Run failed")
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Failed,
          completedAt: new Date(),
          currentPhase: "Failed",
          currentMessage: `Agent run failed: ${err.message}`,
          failedReason: err.message,
          failedAt: new Date(),
          errorStack: err.stack || null,
          currentPhaseStartedAt: new Date(),
          progress: 100
        }
      })
      // Mark current running steps as Failed, pending steps as Skipped
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Running" },
        data: { status: "Failed", error: err.message, completedAt: new Date() }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Pending" },
        data: { status: "Skipped", completedAt: new Date() }
      })

      // Add finding
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: QAAgentFindingType.Risk,
          severity: Priority.High,
          title: "Agent execution failed",
          description: err.message,
          evidence: { error: err.message, stack: err.stack }
        }
      })
      throw err
    }
  } finally {
    clearInterval(heartbeatTimer)
  }
}

export async function runQAAgentExecutionPipeline(runId: string) {
  const startTime = Date.now()
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId }
  })
  if (!run) throw new Error("QAAgentRun not found")

  try {
    console.log("[QAAgentBrain] Starting Phase: Running execution")
    await assertAgentRunNotCancelled(runId)
    await logAgentRunEvent(runId, "info", "ExecutingTests", "Execution started")
    await updateRunProgress(
      runId,
      "ExecutingTests",
      QAAgentRunStatus.Running,
      "Running",
      "Executing planned test scenarios..."
    )

    const executorOptions = {
      agentRunId: runId,
      projectId: run.projectId,
      safetyLevel: run.safetyLevel
    }

    const { success, errorCount, executionResult } = await executeQAAgentPlan(run.plan as any, executorOptions)

    await assertAgentRunNotCancelled(runId)

    // Save execution result
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: { executionResult }
    })
    
    await updateRunProgress(
      runId,
      "ExecutingTests",
      null,
      "Completed",
      `Executed planned test scenarios. Success: ${success}. Errors: ${errorCount}.`
    )

    // Phase: Reporting
    console.log("[QAAgentBrain] Starting Phase: Reporting summaries")
    await assertNotCancelled(runId)
    await updateRunProgress(
      runId,
      "GeneratingReport",
      QAAgentRunStatus.Reporting,
      "Running",
      "Generating report summaries and exporting files..."
    )

    const summary = await generateQAAgentSummary(runId)
    const duration = Date.now() - (run.startedAt ? run.startedAt.getTime() : startTime)

    await updateRunProgress(
      runId,
      "GeneratingReport",
      null,
      "Completed",
      "Report generated successfully."
    )

    // Complete the run
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: {
        status: QAAgentRunStatus.Completed,
        completedAt: new Date(),
        durationMs: duration,
        currentPhase: "Completed",
        currentMessage: "QA Agent run completed successfully.",
        summary: summary as any,
        currentPhaseStartedAt: new Date(),
        progress: 100
      }
    })
    await logAgentRunEvent(runId, "info", "Completed", "Run completed")
    
    // Set Completed step
    await prisma.qAAgentRunStep.create({
      data: {
        agentRunId: runId,
        stepNumber: 12,
        name: "Completed",
        type: "Completed",
        status: "Completed",
        startedAt: new Date(),
        completedAt: new Date()
      }
    })

    console.log(`[QAAgentBrain] Run ${runId} finished successfully.`)

  } catch (err: any) {
    if (err.message === "CANCELLED") {
      console.warn(`[QAAgentBrain] Execution run ${runId} was aborted by cancellation.`)
      await logAgentRunEvent(runId, "info", "Cancelled", "Run cancelled")
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Cancelled,
          completedAt: new Date(),
          currentPhase: "Cancelled",
          currentMessage: "Agent run execution cancelled by user.",
          currentPhaseStartedAt: new Date(),
          progress: 100
        }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: { in: ["Pending", "Running"] } },
        data: { status: "Cancelled", completedAt: new Date() }
      })
    } else {
      console.error(`[QAAgentBrain] Execution error for run ${runId}:`, err)
      await logAgentRunEvent(runId, "error", "Failed", "Run failed")
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Failed,
          completedAt: new Date(),
          currentPhase: "Failed",
          currentMessage: `Agent execution failed: ${err.message}`,
          failedReason: err.message,
          failedAt: new Date(),
          errorStack: err.stack || null,
          currentPhaseStartedAt: new Date(),
          progress: 100
        }
      })
      // Mark current running steps as Failed, pending steps as Skipped
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Running" },
        data: { status: "Failed", error: err.message, completedAt: new Date() }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Pending" },
        data: { status: "Skipped", completedAt: new Date() }
      })

      // Add finding
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: QAAgentFindingType.Risk,
          severity: Priority.High,
          title: "Agent execution failed",
          description: err.message,
          evidence: { error: err.message, stack: err.stack }
        }
      })
      throw err
    }
  }
}
