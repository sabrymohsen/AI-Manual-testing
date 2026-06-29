import { prisma } from "@/lib/db"
import { RecorderSessionManager } from "./session-manager"
import { recorderWorkerRequest } from "@/lib/recording/worker-client"

/**
 * RecorderService coordinates Design-Time Recording sessions.
 */
export class RecorderService {
  /**
   * Dispatches command to worker to start browser context step captures.
   */
  static async startRecording(sessionId: string, details: {
    startUrl: string
    browserType: string
    viewport: string
  }) {
    // 1. Get database session config
    const session = await prisma.recordingSession.findUnique({
      where: { id: sessionId }
    })
    if (!session) throw new Error("Recording session not found")

    // 2. Invoke background Playwright recorder worker
    const response = await recorderWorkerRequest<any>(`/sessions/${sessionId}/start`, {
      method: "POST",
      body: JSON.stringify({
        url: details.startUrl,
        browserType: details.browserType.toLowerCase(),
        viewport: details.viewport
      })
    })

    // 3. Register state in-memory
    RecorderSessionManager.registerSession(sessionId, {
      projectId: session.projectId,
      browserType: details.browserType,
      viewport: details.viewport,
      url: details.startUrl
    })

    return response
  }

  /**
   * Pauses the recording step listener on the worker.
   */
  static async pauseRecording(sessionId: string) {
    return await recorderWorkerRequest<any>(`/sessions/${sessionId}/pause`, {
      method: "POST"
    })
  }

  /**
   * Resumes the recording step listener.
   */
  static async resumeRecording(sessionId: string) {
    return await recorderWorkerRequest<any>(`/sessions/${sessionId}/resume`, {
      method: "POST"
    })
  }
}
