/**
 * Desktop AI relay: run a user's AI request on Ollama on THEIR computer.
 *
 * The server can't reach a user's localhost, so the desktop app's page keeps a
 * socket open to the socket server and joins `desktop-ai:<userId>`. The web
 * process POSTs the Ollama request to the socket server's /internal/ai-relay,
 * which forwards it to that socket and returns the reply. The desktop app only
 * ever talks to 127.0.0.1:11434 (see desktop/src/main.js).
 */

const SOCKET_INTERNAL_URL = process.env.SOCKET_INTERNAL_URL || "http://localhost:3001"
const internalToken = () => process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key"

export class DesktopNotConnectedError extends Error {
  constructor() {
    super("The desktop app with AI on this computer is not open")
  }
}

export interface RelayReply {
  ok: boolean
  status: number
  data: any
}

/** Sends one Ollama API call (path + JSON body) through the user's desktop app. */
export async function relayToDesktop(userId: string, path: "/api/chat", body: unknown, timeoutMs: number): Promise<RelayReply> {
  let res: Response
  try {
    res = await fetch(`${SOCKET_INTERNAL_URL}/internal/ai-relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": internalToken() },
      body: JSON.stringify({ userId, path, body, timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 5_000),
    })
  } catch {
    throw new DesktopNotConnectedError()
  }
  if (res.status === 409) throw new DesktopNotConnectedError()
  const out = await res.json().catch(() => null)
  if (!res.ok || !out) throw new Error(out?.error || `Desktop AI relay failed (${res.status})`)
  return out as RelayReply
}

/** Is this user's desktop app bridge online, and which models does it have? */
export async function desktopBridgeStatus(userId: string): Promise<{ connected: boolean; models: string[] }> {
  try {
    const res = await fetch(`${SOCKET_INTERNAL_URL}/internal/ai-bridge?userId=${encodeURIComponent(userId)}`, {
      headers: { "x-internal-token": internalToken() },
      signal: AbortSignal.timeout(3_000),
    })
    if (!res.ok) return { connected: false, models: [] }
    const d = await res.json()
    return { connected: !!d.connected, models: Array.isArray(d.models) ? d.models : [] }
  } catch {
    return { connected: false, models: [] }
  }
}
