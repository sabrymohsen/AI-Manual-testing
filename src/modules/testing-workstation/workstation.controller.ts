import { prisma } from "@/lib/db"
import { SessionEngine } from "./session.engine"
import { BrowserManager } from "./browser.manager"
import { BugCaptureService } from "./bug.capture.service"
import { BrowserType, Environment, ViewportType } from "@prisma/client"

/**
 * WorkstationController handles manual execution sessions, screenshots, video renfiles, and bug logs.
 */
export class WorkstationController {
  /**
   * Initializes a workstation browser execution session.
   */
  static async startSession(projectId: string, payload: {
    title: string
    startUrl: string
    browserType: "Chromium" | "Firefox" | "WebKit"
    viewport: "Desktop" | "Tablet" | "Mobile" | "Custom"
    recordVideo: boolean
  }) {
    // 1. Create ManualTestSession row in DB with all required fields
    const session = await prisma.manualTestSession.create({
      data: {
        projectId,
        status: "Active",
        name: payload.title,
        environment: Environment.Dev,
        browserType: payload.browserType as BrowserType,
        viewport: payload.viewport as ViewportType
      }
    })

    // 2. Spawn headful browser context
    try {
      await BrowserManager.launchSession(session.id, {
        browserType: payload.browserType,
        startUrl: payload.startUrl,
        viewport: payload.viewport === "Tablet" ? { width: 768, height: 1024 } : 
                  payload.viewport === "Mobile" ? { width: 375, height: 667 } : { width: 1280, height: 800 },
        recordVideo: payload.recordVideo
      })

      // 3. Cache state in engine
      SessionEngine.startWorkstation(session.id, {
        projectId,
        checklist: []
      })

      return { success: true, session }
    } catch (err: any) {
      await prisma.manualTestSession.update({
        where: { id: session.id },
        data: { status: "Error" }
      })
      throw err
    }
  }

  /**
   * Shuts down context and finalizes status metrics.
   */
  static async stopSession(sessionId: string, status: "Completed" | "Cancelled") {
    await BrowserManager.shutdownSession(sessionId)
    SessionEngine.stopWorkstation(sessionId)

    const session = await prisma.manualTestSession.update({
      where: { id: sessionId },
      data: {
        status,
        completedAt: new Date()
      }
    })

    return { success: true, session }
  }

  /**
   * Logs a defect linked to the active session.
   */
  static async fileDefect(sessionId: string, payload: {
    title: string
    actualResult: string
    screenshotPath?: string
  }) {
    const session = await prisma.manualTestSession.findUnique({
      where: { id: sessionId }
    })
    if (!session) throw new Error("Manual test session not found")

    const bug = await BugCaptureService.logWorkstationDefect({
      projectId: session.projectId,
      title: payload.title,
      actualResult: payload.actualResult,
      screenshotPath: payload.screenshotPath
    })

    return { success: true, bug }
  }
}
