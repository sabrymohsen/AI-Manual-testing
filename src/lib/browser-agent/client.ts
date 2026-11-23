/**
 * The Browser Agent page's browser: playwright-cli on the server, or on the
 * tester's computer through the desktop app. Same commands, same results.
 */

export type RunsOn = "server" | "computer"

export interface ExecResult {
  session: string
  ok: boolean
  error?: string
  result?: any
  snapshot?: string
  screenshot?: string
  page?: { title: string; url: string } | null
}

interface DesktopBa {
  info(): Promise<{ browser: string | null }>
  exec(session: string, cmd: string, args: string[], opts?: { headed?: boolean }): Promise<ExecResult>
}

export function desktopBa(): DesktopBa | null {
  if (typeof window === "undefined") return null
  return ((window as any).qaDesktop?.ba as DesktopBa) ?? null
}

/** One browser (one playwright-cli session). */
export class AgentBrowser {
  session = ""
  page: { title: string; url: string } | null = null
  /** The test case's BRDs: on the server, their users' logins are filled in there. */
  brdIds: string[] = []

  constructor(
    private projectId: string,
    public runsOn: RunsOn,
    private headed = false
  ) {}

  get open() {
    return !!this.session
  }

  async exec(cmd: string, args: string[] = []): Promise<ExecResult> {
    let r: ExecResult
    if (this.runsOn === "computer") {
      const ba = desktopBa()
      if (!ba) throw new Error("Running on this computer needs the QA Engine desktop app (version 0.6 or newer).")
      r = await ba.exec(this.session, cmd, args, { headed: this.headed })
    } else {
      const res = await fetch("/api/hub/browser-agent/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: this.projectId, session: this.session, cmd, args, ...(this.brdIds.length ? { brdIds: this.brdIds } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 410) this.session = ""
        throw new Error(d.error || `The browser command failed (${res.status})`)
      }
      r = d
    }
    if (cmd === "close") {
      this.session = ""
      this.page = null
    } else if (r.session) {
      this.session = r.session
    }
    if (r.page) this.page = r.page
    return r
  }

  /** Runs a command and throws its error message when it fails. */
  async must(cmd: string, args: string[] = []): Promise<ExecResult> {
    const r = await this.exec(cmd, args)
    if (!r.ok) throw new Error(r.error || `${cmd} failed`)
    return r
  }

  async openAt(url: string) {
    if (this.session) await this.exec("close").catch(() => {})
    return this.must("open", [url])
  }

  async snapshot(): Promise<string> {
    return (await this.must("snapshot")).snapshot || ""
  }

  async screenshot(): Promise<string | undefined> {
    return (await this.exec("screenshot").catch(() => null))?.screenshot
  }

  async close() {
    if (this.session) await this.exec("close").catch(() => {})
    this.session = ""
  }
}

/** "name=value" lines → data; names that look secret are kept out of AI prompts. */
export function parseTestData(text: string): { data: Record<string, string>; secrets: Record<string, string> } {
  const data: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const line of (text || "").split("\n")) {
    const m = line.match(/^\s*([\p{L}\p{N}_ -]{1,40}?)\s*=\s*(.*)$/u)
    if (!m) continue
    const name = m[1].trim()
    data[name] = m[2]
    if (/pass|secret|token|pin\b|otp|api[-_]?key|credential/i.test(name)) secrets[name] = m[2]
  }
  return { data, secrets }
}

/** {name} → its value (unknown names stay as written). */
export function fillData(value: string, data: Record<string, string>): string {
  return value.replace(/\{([\p{L}\p{N}_ -]{1,40})\}/gu, (all, n: string) => (n in data ? data[n] : all))
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
