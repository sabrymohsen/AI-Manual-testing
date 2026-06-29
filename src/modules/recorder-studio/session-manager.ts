import { prisma } from "@/lib/db"

/**
 * Recorder Studio Design-Time Recording Session Cache State Manager.
 */
export class RecorderSessionManager {
  private static activeSessions: Map<string, any> = new Map()

  /**
   * Tracks an active recording session ID in-memory.
   */
  static registerSession(sessionId: string, sessionContext: any) {
    this.activeSessions.set(sessionId, {
      ...sessionContext,
      startedAt: new Date()
    })
  }

  /**
   * Removes session context from cache.
   */
  static endSession(sessionId: string) {
    this.activeSessions.delete(sessionId)
  }

  /**
   * Returns session context from cache.
   */
  static getSession(sessionId: string) {
    return this.activeSessions.get(sessionId) || null
  }

  /**
   * Fetches active session model context from Database.
   */
  static async getActiveProjectSession(projectId: string) {
    return await prisma.recordingSession.findFirst({
      where: {
        projectId,
        status: { in: ["Active", "Paused"] }
      },
      orderBy: { createdAt: "desc" }
    })
  }
}
