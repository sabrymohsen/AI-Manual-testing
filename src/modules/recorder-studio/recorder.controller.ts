import { NextResponse } from "next/server"
import { RecorderService } from "./recorder.service"
import { prisma } from "@/lib/db"
import { BrowserType, ViewportType } from "@prisma/client"

/**
 * RecorderController routes design-time incoming API requests.
 */
export class RecorderController {
  /**
   * Initializes a design-time browser recording session.
   */
  static async startSession(projectId: string, payload: {
    title: string
    startUrl: string
    browserType: "Chromium" | "Firefox" | "WebKit"
    viewport: "Desktop" | "Tablet" | "Mobile" | "Custom"
  }) {
    // 1. Create recording session row in database with all required fields
    const session = await prisma.recordingSession.create({
      data: {
        projectId,
        startUrl: payload.startUrl,
        browserType: payload.browserType as BrowserType,
        viewport: payload.viewport as ViewportType,
        status: "Starting"
      }
    })

    // 2. Invoke background recorder service to launch Playwright
    try {
      await RecorderService.startRecording(session.id, {
        startUrl: payload.startUrl,
        browserType: payload.browserType,
        viewport: payload.viewport
      })
      
      // Update session status to active
      await prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: "Active" }
      })

      return { success: true, session }
    } catch (err: any) {
      // Rollback session status to Failed
      await prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: "Failed" }
      })
      throw err
    }
  }

  /**
   * Pauses an active recording.
   */
  static async pauseSession(sessionId: string) {
    await RecorderService.pauseRecording(sessionId)
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: { status: "Paused" }
    })
    return { success: true }
  }

  /**
   * Resumes a paused recording.
   */
  static async resumeSession(sessionId: string) {
    await RecorderService.resumeRecording(sessionId)
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: { status: "Active" }
    })
    return { success: true }
  }
}
