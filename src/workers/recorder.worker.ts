import http from "node:http"
import { URL } from "node:url"
import {
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
  cancelSession,
  startNewRecordedTestCase,
  saveCurrentRecordedTestCase,
  validateStepLocator,
  createBugFromSession,
  validateRecordedFlow,
  getSessionStats,
  getSessionConnectionStatus,
  activeSessions,
} from "@/lib/recording/session-manager"

const PORT = Number(process.env.RECORDER_WORKER_PORT) || 3847

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

async function checkPlaywrightInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright")
    return !!chromium
  } catch {
    return false
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Invalid request" })
    return
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  try {
    if (req.method === "GET" && path === "/health") {
      const playwrightInstalled = await checkPlaywrightInstalled()
      sendJson(res, 200, {
        online: true,
        playwrightInstalled,
        activeSessionCount: activeSessions.size,
        version: "1.0.0",
      })
      return
    }

    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/connection$/)) {
      const sessionId = path.split("/")[2]
      const status = await getSessionConnectionStatus(sessionId)
      sendJson(res, 200, status)
      return
    }

    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/stats$/)) {
      const sessionId = path.split("/")[2]
      const stats = await getSessionStats(sessionId)
      sendJson(res, 200, stats)
      return
    }

    if (req.method === "POST" && path === "/sessions/start") {
      const body = await readBody(req)
      const { projectId, userId, options } = body
      if (!projectId || !userId || !options) {
        sendJson(res, 400, { error: "projectId, userId, and options are required" })
        return
      }
      const result = await startSession(projectId, userId, options)
      sendJson(res, 201, result)
      return
    }

    const sessionMatch = path.match(/^\/sessions\/([^/]+)\/(.+)$/)
    if (sessionMatch && req.method === "POST") {
      const sessionId = sessionMatch[1]
      const action = sessionMatch[2]
      const body = await readBody(req)

      switch (action) {
        case "pause":
          await pauseSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "resume":
          await resumeSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "finish":
          await finishSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "cancel":
          await cancelSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "validate-flow": {
          const result = await validateRecordedFlow(sessionId, { replay: body.replay !== false })
          sendJson(res, 200, result)
          return
        }
        case "test-case/start-new": {
          const testCase = await startNewRecordedTestCase(sessionId, body)
          sendJson(res, 200, { testCase })
          return
        }
        case "test-case/save-current": {
          const { testCaseId } = body
          if (!testCaseId) {
            sendJson(res, 400, { error: "testCaseId is required" })
            return
          }
          const saved = await saveCurrentRecordedTestCase(sessionId, testCaseId)
          sendJson(res, 200, { testCase: saved })
          return
        }
        case "bug": {
          const bug = await createBugFromSession(sessionId, body)
          sendJson(res, 200, { bug })
          return
        }
        default:
          sendJson(res, 404, { error: "Unknown session action" })
          return
      }
    }

    const stepMatch = path.match(/^\/steps\/([^/]+)\/validate-locator$/)
    if (stepMatch && req.method === "POST") {
      const stepId = stepMatch[1]
      const result = await validateStepLocator(stepId)
      sendJson(res, 200, result)
      return
    }

    sendJson(res, 404, { error: "Not found" })
  } catch (err: any) {
    console.error("[RECORDER WORKER]", err)
    sendJson(res, 500, {
      error: err.message || "Internal recorder worker error",
      code: err.code || "INTERNAL_ERROR",
      details: err.stack,
    })
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[RECORDER WORKER] Listening on http://127.0.0.1:${PORT}`)
})

process.on("SIGINT", async () => {
  console.log("[RECORDER WORKER] Shutting down, closing active browsers...")
  for (const [sessionId, sess] of activeSessions.entries()) {
    try {
      await sess.browser.close()
    } catch {
      // ignore
    }
    activeSessions.delete(sessionId)
  }
  server.close()
  process.exit(0)
})
