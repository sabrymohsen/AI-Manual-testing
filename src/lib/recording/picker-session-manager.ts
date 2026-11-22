import { chromium, Browser, BrowserContext, Page } from "playwright"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/db"
import { saveFile } from "@/lib/storage"
import { decryptSecret } from "@/lib/crypto"
import { handleLogin } from "@/lib/playwright/login-handler"
import { INJECTED_PICKER_SCRIPT } from "./injected-picker"
import { nextBugKey } from "@/lib/bug-reports/keys"

// A picked element. Mirrors the shape produced by injected-picker.js so it maps cleanly onto
// ElementLocator rows when the user saves a collection.
export interface PickedElement {
  id: string
  suggestedName: string
  actionType: string
  pageUrl: string
  tagName?: string | null
  visibleText?: string | null
  locatorType: string
  locatorValue: string
  recommendedSelector?: string | null
  cssSelector?: string | null
  xpathSelector?: string | null
  idSelector?: string | null
  testIdSelector?: string | null
  roleSelector?: string | null
  textSelector?: string | null
  labelSelector?: string | null
  placeholderSelector?: string | null
  reliabilityScore: number
  attributes?: Record<string, string>
  capturedAt: string
}

interface PickerSession {
  id: string
  projectId: string
  browser: Browser
  context: BrowserContext
  page: Page
  status: "Active" | "Paused" | "Stopped"
  elements: PickedElement[]
  pageHistory: string[]
  pendingCommand: string | null
  consoleErrors: string[]
  networkErrors: string[]
  startUrl: string
  createdAt: string
}

// Survive Next.js / tsx hot reloads in dev, exactly like activeSessions in session-manager.ts.
const globalForPicker = global as unknown as {
  activePickerSessions: Map<string, PickerSession>
}
export const activePickerSessions =
  globalForPicker.activePickerSessions || new Map<string, PickerSession>()
if (process.env.NODE_ENV !== "production") {
  globalForPicker.activePickerSessions = activePickerSessions
}

const MAX_ELEMENTS = 500

function publicState(s: PickerSession) {
  return {
    sessionId: s.id,
    projectId: s.projectId,
    status: s.status,
    elements: s.elements,
    count: s.elements.length,
    pageHistory: s.pageHistory,
    pendingCommand: s.pendingCommand,
    currentUrl: (() => {
      try {
        return s.page.url()
      } catch {
        return s.startUrl
      }
    })(),
  }
}

function requireSession(sessionId: string): PickerSession {
  const s = activePickerSessions.get(sessionId)
  if (!s) throw new Error("Picker session not found. The browser may have been closed.")
  return s
}

async function syncOverlay(s: PickerSession) {
  // After a navigation the init-script re-injects fresh (count resets to 0), so push state back.
  try {
    await s.page.evaluate((n) => (window as any).__pickerSetCount?.(n), s.elements.length)
    await s.page.evaluate((p) => (window as any).__pickerSetPaused?.(p), s.status === "Paused")
  } catch {
    // page mid-navigation — next framenavigated will resync
  }
}

export async function startPickerSession(opts: {
  projectId: string
  url: string
  credentialId?: string | null
}): Promise<ReturnType<typeof publicState>> {
  const project = await prisma.project.findUnique({ where: { id: opts.projectId } })
  if (!project) throw new Error("Project not found")

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  const sessionId = randomUUID()
  const session: PickerSession = {
    id: sessionId,
    projectId: opts.projectId,
    browser,
    context,
    page,
    status: "Active",
    elements: [],
    pageHistory: [],
    pendingCommand: null,
    consoleErrors: [],
    networkErrors: [],
    startUrl: opts.url,
    createdAt: new Date().toISOString(),
  }

  // Capture console + failing responses so "Create Bug" can attach diagnostics.
  page.on("console", (msg) => {
    if (msg.type() === "error") session.consoleErrors.push(msg.text())
  })
  page.on("response", (res) => {
    if (res.status() >= 400) session.networkErrors.push(`${res.status()} ${res.url()}`)
  })

  // Receive captured elements from the overlay.
  await page.exposeFunction("onElementPicked", (data: any) => {
    if (session.elements.length >= MAX_ELEMENTS) return
    session.elements.push({
      id: randomUUID(),
      suggestedName: data.suggestedName || data.tagName || "element",
      actionType: data.actionType || "click",
      pageUrl: data.pageUrl || session.page.url(),
      tagName: data.tagName ?? null,
      visibleText: data.visibleText ?? null,
      locatorType: data.locatorType || "css",
      locatorValue: data.locatorValue || "",
      recommendedSelector: data.recommendedSelector ?? null,
      cssSelector: data.cssSelector ?? null,
      xpathSelector: data.xpathSelector ?? null,
      idSelector: data.idSelector ?? null,
      testIdSelector: data.testIdSelector ?? null,
      roleSelector: data.roleSelector ?? null,
      textSelector: data.textSelector ?? null,
      labelSelector: data.labelSelector ?? null,
      placeholderSelector: data.placeholderSelector ?? null,
      reliabilityScore: Number(data.reliabilityScore || 0),
      attributes: data.attributes || {},
      capturedAt: new Date().toISOString(),
    })
  })

  // Toolbar buttons. stop/clear act immediately; the rest set a pendingCommand the web UI reacts to.
  await page.exposeFunction("__pickerCommand", (cmd: string) => {
    if (cmd === "clear") {
      session.elements = []
      syncOverlay(session)
      return
    }
    if (cmd === "stop") {
      stopPickerSession(sessionId).catch(() => {})
      return
    }
    session.pendingCommand = cmd
  })

  await page.addInitScript(INJECTED_PICKER_SCRIPT)

  // Optional login before navigating to the target.
  if (opts.credentialId) {
    const cred = await prisma.projectCredential.findFirst({
      where: { id: opts.credentialId, projectId: opts.projectId },
    })
    if (cred) {
      const decryptedPassword = decryptSecret({
        encrypted: cred.encryptedPassword,
        iv: cred.encryptionIv,
        authTag: cred.encryptionAuthTag,
        keyVersion: cred.keyVersion,
      })
      await handleLogin(page, {
        url: cred.loginUrl || project.webAppUrl,
        username: cred.username,
        password: decryptedPassword,
      })
    }
  }

  // Track navigation: record page history + resync the overlay's count/paused state.
  page.on("framenavigated", async (frame) => {
    if (frame !== page.mainFrame()) return
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {})
      const url = page.url()
      if (session.pageHistory[session.pageHistory.length - 1] !== url) {
        session.pageHistory.push(url)
      }
      await syncOverlay(session)
    } catch {
      // ignore navigation probe errors
    }
  })

  browser.on("disconnected", () => {
    const s = activePickerSessions.get(sessionId)
    if (s) s.status = "Stopped"
    activePickerSessions.delete(sessionId)
  })

  await page.goto(opts.url, { waitUntil: "load", timeout: 60000 })
  session.pageHistory.push(page.url())

  activePickerSessions.set(sessionId, session)
  return publicState(session)
}

export function getPickerSessionState(sessionId: string) {
  return publicState(requireSession(sessionId))
}

export function ackPickerCommand(sessionId: string) {
  const s = requireSession(sessionId)
  s.pendingCommand = null
  return publicState(s)
}

export async function pausePickerSession(sessionId: string, paused: boolean) {
  const s = requireSession(sessionId)
  s.status = paused ? "Paused" : "Active"
  await syncOverlay(s)
  return publicState(s)
}

export async function clearPickerElements(sessionId: string) {
  const s = requireSession(sessionId)
  s.elements = []
  await syncOverlay(s)
  return publicState(s)
}

export function removePickerElement(sessionId: string, elementId: string) {
  const s = requireSession(sessionId)
  s.elements = s.elements.filter((e) => e.id !== elementId)
  syncOverlay(s)
  return publicState(s)
}

export async function stopPickerSession(sessionId: string) {
  const s = activePickerSessions.get(sessionId)
  if (!s) return { stopped: true }
  s.status = "Stopped"
  try {
    await s.context.close()
  } catch {}
  try {
    await s.browser.close()
  } catch {}
  activePickerSessions.delete(sessionId)
  return { stopped: true }
}

// Create a bug from a picked element with locator + element screenshot + DOM snapshot attached.
export async function createBugFromPickerElement(
  sessionId: string,
  elementId: string | null,
  bugData: any
) {
  const s = requireSession(sessionId)
  const element = elementId
    ? s.elements.find((e) => e.id === elementId)
    : s.elements[s.elements.length - 1]

  // Element screenshot (fallback to full page), plus a DOM snapshot.
  let screenshotPath: string | null = bugData?.screenshotPath || null
  if (!screenshotPath) {
    try {
      if (element?.cssSelector) {
        const buf = await s.page.locator(element.cssSelector).first().screenshot({ type: "png", timeout: 5000 })
        screenshotPath = await saveFile("screenshots", `picker-bug-${sessionId}-${Date.now()}.png`, buf)
      }
    } catch {}
  }
  if (!screenshotPath) {
    try {
      const buf = await s.page.screenshot({ type: "png" })
      screenshotPath = await saveFile("screenshots", `picker-bug-${sessionId}-${Date.now()}.png`, buf)
    } catch {}
  }

  let domSnapshotPath: string | null = null
  try {
    const html = await s.page.content()
    domSnapshotPath = await saveFile("dom_snapshots", `picker-bug-${sessionId}-${Date.now()}.html`, Buffer.from(html))
  } catch {}

  const bugKey = await nextBugKey(s.projectId)
  const locatorLine = element
    ? `Element: ${element.suggestedName} | ${element.locatorType}=${element.locatorValue}` +
      (element.cssSelector ? ` | css=${element.cssSelector}` : "") +
      (element.xpathSelector ? ` | xpath=${element.xpathSelector}` : "")
    : "No element captured."

  const bug = await prisma.bugReport.create({
    data: {
      bugKey,
      title: bugData?.title || `Element issue: ${element?.suggestedName || "unknown"}`,
      projectId: s.projectId,
      severity: bugData?.severity || "Medium",
      priority: bugData?.priority || "Medium",
      status: "Open",
      environment: "Dev",
      roleUsed: "None",
      browser: "Chromium",
      viewport: "Desktop",
      stepsToReproduce:
        (bugData?.stepsToReproduce || `Locate element on ${element?.pageUrl || s.page.url()}.\n${locatorLine}`) +
        (domSnapshotPath ? `\n\nDOM snapshot: ${domSnapshotPath}` : ""),
      expectedResult: bugData?.expectedResult || "Element is present, visible and interactable.",
      actualResult: bugData?.actualResult || "Element is missing / broken / not interactable.",
      screenshotPath,
      consoleLogs: s.consoleErrors.join("\n") || null,
      networkErrors: s.networkErrors.join("\n") || null,
    },
  })

  await prisma.bugActivity.create({
    data: {
      bugId: bug.id,
      action: "CREATE_FROM_PICKER",
      details: `Bug created from Element Picker. ID: ${bugKey}. ${locatorLine}`,
    },
  })

  s.pendingCommand = null
  return bug
}
