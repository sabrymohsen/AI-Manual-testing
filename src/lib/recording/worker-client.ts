const RECORDER_WORKER_URL =
  process.env.RECORDER_WORKER_URL || "http://127.0.0.1:3847"

export class RecorderWorkerError extends Error {
  code: string
  status?: number
  details?: string

  constructor(message: string, code: string, status?: number, details?: string) {
    super(message)
    this.name = "RecorderWorkerError"
    this.code = code
    this.status = status
    this.details = details
  }
}

export type RecorderWorkerHealth = {
  online: boolean
  playwrightInstalled: boolean
  activeSessionCount: number
  version: string
}

export async function checkRecorderWorkerHealth(): Promise<RecorderWorkerHealth> {
  try {
    const res = await fetch(`${RECORDER_WORKER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return {
        online: false,
        playwrightInstalled: false,
        activeSessionCount: 0,
        version: "unknown",
      }
    }
    return (await res.json()) as RecorderWorkerHealth
  } catch {
    return {
      online: false,
      playwrightInstalled: false,
      activeSessionCount: 0,
      version: "unknown",
    }
  }
}

export async function recorderWorkerRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const health = await checkRecorderWorkerHealth()
  if (!health.online) {
    throw new RecorderWorkerError(
      "Recorder service is offline. Start it with: npm run recorder-worker",
      "WORKER_OFFLINE"
    )
  }

  let res: Response
  try {
    res = await fetch(`${RECORDER_WORKER_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(120000),
    })
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new RecorderWorkerError(
        "Recorder service did not respond in time.",
        "WORKER_TIMEOUT"
      )
    }
    throw new RecorderWorkerError(
      "Could not connect to recorder service. Ensure npm run recorder-worker is running.",
      "WORKER_UNREACHABLE",
      undefined,
      err?.message
    )
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      body.error ||
      body.message ||
      "Recorder service returned an error."
    const code = body.code || "WORKER_ERROR"
    throw new RecorderWorkerError(message, code, res.status, body.details)
  }

  return body as T
}
