"use client"

/**
 * Automation Hub → Browser Agent: playwright-cli in the app.
 *
 * - Run test cases: the AI performs each manual step in a real browser and
 *   checks the expected result; every step is saved with what the page showed
 *   and a screenshot (Runs tab).
 * - Record: do the steps yourself by picking elements; get a no-code test and
 *   Playwright code (JavaScript or Python).
 * - Find locators: open a page and copy stable locators for any element.
 *
 * The browser runs on the server, or on this computer through the desktop app
 * (internal/VPN sites, visible browser).
 */
import { useEffect, useState } from "react"
import { Bot, Crosshair, Laptop, MousePointerClick, Server } from "lucide-react"
import { desktopBa, type RunsOn } from "@/lib/browser-agent/client"
import { RunCasesPanel } from "./run-cases"
import { RecordPanel } from "./record"
import { LocatorsPanel } from "./locators"

export interface AgentSettings {
  runsOn: RunsOn
  headed: boolean
  startUrl: string
  testData: string
}

const KEY = "qa-browser-agent-settings"

export function BrowserAgentSection({ projectId, onOpenRun, onOpenTests }: { projectId: string; onOpenRun: (executionId: string) => void; onOpenTests: (name: string) => void }) {
  const [mode, setMode] = useState<"run" | "record" | "locators">("run")
  const [hasDesktop, setHasDesktop] = useState(false)
  const [desktopBrowser, setDesktopBrowser] = useState<string | null | undefined>(undefined)
  const [settings, setSettings] = useState<AgentSettings>({ runsOn: "server", headed: true, startUrl: "", testData: "" })

  useEffect(() => {
    const ba = desktopBa()
    setHasDesktop(!!ba)
    ba?.info().then((i) => setDesktopBrowser(i.browser)).catch(() => setDesktopBrowser(null))
    try {
      const saved = JSON.parse(localStorage.getItem(`${KEY}:${projectId}`) || "null")
      if (saved) setSettings((s) => ({ ...s, ...saved, runsOn: saved.runsOn === "computer" && ba ? "computer" : "server" }))
    } catch {}
  }, [projectId])

  const update = (patch: Partial<AgentSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch }
      try {
        // Test data can hold passwords: never kept in the browser.
        const { testData, ...rest } = next
        void testData
        localStorage.setItem(`${KEY}:${projectId}`, JSON.stringify(rest))
      } catch {}
      return next
    })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Bot className="h-4 w-4 text-primary" /> Browser Agent
            </h2>
            <p className="mt-0.5 max-w-2xl text-[13px] font-normal text-muted-foreground">
              Drives a real browser with playwright-cli. Let the AI run your manual test cases step by step, record a test by doing it, or find locators
              for any element.
            </p>
          </div>
          <div className="inline-flex rounded-lg border bg-muted p-0.5" role="tablist" aria-label="Browser Agent mode">
            {[
              { id: "run", label: "Run test cases", icon: Bot },
              { id: "record", label: "Record", icon: MousePointerClick },
              { id: "locators", label: "Find locators", icon: Crosshair },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => setMode(t.id as any)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium ${mode === t.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr]">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Runs on</p>
            <div className="inline-flex rounded-lg border bg-muted p-0.5">
              <button
                onClick={() => update({ runsOn: "server" })}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium ${settings.runsOn === "server" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                <Server className="h-3.5 w-3.5" /> Server
              </button>
              <button
                onClick={() => hasDesktop && update({ runsOn: "computer" })}
                disabled={!hasDesktop}
                title={hasDesktop ? "Your own Chrome/Edge, through the desktop app" : "Needs the QA Engine desktop app"}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 ${settings.runsOn === "computer" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                <Laptop className="h-3.5 w-3.5" /> This computer
              </button>
            </div>
            {settings.runsOn === "computer" ? (
              <label className="mt-1.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <input type="checkbox" checked={settings.headed} onChange={(e) => update({ headed: e.target.checked })} /> Show the browser
                {desktopBrowser === null && <span className="text-amber-700"> — install Google Chrome or Edge first</span>}
              </label>
            ) : (
              <p className="mt-1.5 max-w-xs text-xs font-normal text-muted-foreground">
                {hasDesktop ? "Internal or VPN-only site? Choose This computer." : "Internal or VPN-only site? Use the desktop app and choose This computer."}
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Start page</span>
              <input
                value={settings.startUrl}
                onChange={(e) => update({ startUrl: e.target.value })}
                placeholder="https://staging.example.com/login"
                className="h-9 w-full rounded-md border bg-card px-2.5 text-[13px] font-normal"
                dir="ltr"
              />
            </label>
            {mode !== "locators" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Test data <span className="font-normal">(name=value per line; use as {"{name}"} — passwords never go to the AI)</span>
                </span>
                <textarea
                  value={settings.testData}
                  onChange={(e) => update({ testData: e.target.value })}
                  rows={2}
                  placeholder={"username=tomsmith\npassword=…"}
                  className="w-full rounded-md border bg-card px-2.5 py-1.5 font-mono text-xs font-normal"
                  dir="ltr"
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {mode === "run" && <RunCasesPanel projectId={projectId} settings={settings} onOpenRun={onOpenRun} />}
      {mode === "record" && <RecordPanel projectId={projectId} settings={settings} onOpenTests={onOpenTests} />}
      {mode === "locators" && <LocatorsPanel projectId={projectId} settings={settings} />}
    </div>
  )
}

/** The browser's current page: screenshot, title and address. */
export function LiveView({ shot, page, busy, note }: { shot?: string; page?: { title: string; url: string } | null; busy?: boolean; note?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center gap-2 border-b bg-card px-3 py-1.5 text-xs">
        <span className={`h-2 w-2 shrink-0 rounded-full ${busy ? "animate-pulse bg-amber-500" : page ? "bg-emerald-500" : "bg-slate-300"}`} />
        <span className="truncate font-medium text-foreground" dir="auto">
          {page?.title || "No page open"}
        </span>
        <span className="truncate font-normal text-muted-foreground" dir="ltr">
          {page?.url}
        </span>
      </div>
      {shot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot} alt="The page in the agent's browser" className="block w-full" />
      ) : (
        <div className="flex aspect-video items-center justify-center p-6 text-center text-[13px] font-normal text-muted-foreground">
          {note || "The page shows here once the browser is open."}
        </div>
      )}
    </div>
  )
}
