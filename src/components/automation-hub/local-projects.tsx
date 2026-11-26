"use client"

/**
 * Playwright projects on the tester's own computer (desktop app): link a
 * folder, run it there with its own setup, watch the output, and share the
 * results in the Automation Hub. In a browser, the shared results are visible
 * but running needs the desktop app on the computer that has the project.
 */
import { BusyDot } from "@/components/ui/skeleton"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FolderOpen, Laptop, Loader2, Play, Square, Unlink } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"

interface PwApi {
  pick(): Promise<null | { error: string } | LocalProject>
  list(): Promise<LocalProject[]>
  unlink(dir: string): Promise<boolean>
  run(
    dir: string,
    opts?: { headed?: boolean; grep?: string; marker?: string }
  ): Promise<{ exitCode: number; report: any; format?: "playwright" | "junit"; log: string; durationMs: number }>
  stop(dir: string): Promise<boolean>
  onLog(cb: (p: { dir: string; text: string }) => void): () => void
}

export interface LocalProject {
  path: string
  name: string
  /** "pytest" = Python pytest-playwright project; "node" (or missing, older desktop app) = JavaScript. */
  kind?: "node" | "pytest"
  config: string | null
  hasPlaywright: boolean
  installed: boolean
}

export function pwApi(): PwApi | null {
  if (typeof window === "undefined") return null
  return ((window as any).qaDesktop?.pw as PwApi) ?? null
}

/** Sidebar list of linked folders (desktop app only). */
export function LocalProjectsSidebar({ selectedPath, onSelect }: { selectedPath: string | null; onSelect: (p: LocalProject) => void }) {
  const pw = pwApi()
  const [list, setList] = useState<LocalProject[]>([])
  const reload = useCallback(() => {
    pw?.list().then(setList).catch(() => {})
  }, [pw])
  useEffect(() => reload(), [reload])
  if (!pw) return null

  const link = async () => {
    const r = await pw.pick().catch((e) => ({ error: String(e?.message || e) }))
    if (!r) return
    if ("error" in r) return toast.error(r.error)
    reload()
    onSelect(r)
  }

  return (
    <div className="border-t p-2">
      <p className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-muted-foreground">
        <Laptop className="h-3.5 w-3.5" /> On my computer
      </p>
      {list.map((p) => (
        <button
          key={p.path}
          type="button"
          onClick={() => onSelect(p)}
          title={p.path}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${selectedPath === p.path ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
      <button type="button" onClick={link} className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs font-medium text-primary hover:bg-primary/10">
        + Link a Playwright project folder
      </button>
    </div>
  )
}

/** One local project: run it here and share the results. */
export function LocalProjectPanel({
  projectId,
  project,
  onShared,
  onUnlinked,
}: {
  projectId: string
  project: LocalProject
  onShared: (executionId: string, name: string) => void
  onUnlinked: () => void
}) {
  const pw = pwApi()
  const [running, setRunning] = useState(false)
  const [headed, setHeaded] = useState(false)
  const [grep, setGrep] = useState("")
  const [marker, setMarker] = useState("")
  const isPy = project.kind === "pytest"
  const [log, setLog] = useState("")
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!pw) return
    return pw.onLog((p) => {
      if (p.dir === project.path) setLog((l) => (l + p.text).slice(-100_000))
    })
  }, [pw, project.path])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const run = async () => {
    if (!pw) return
    setRunning(true)
    setLog("")
    try {
      const r = await pw.run(project.path, { headed, grep, ...(isPy ? { marker } : {}) })
      const res = await fetch("/api/hub/local-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: project.name, path: project.path, report: r.report, format: r.format, log: r.log, durationMs: r.durationMs, exitCode: r.exitCode }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Couldn't share the results")
      const s = d.summary || {}
      ;(s.failed ? toast.error : toast.success)(
        s.total ? `${s.passed} passed, ${s.failed} failed — shared with your team` : r.exitCode === 0 ? "Finished — shared with your team" : "The run didn't finish — see the output"
      )
      onShared(d.executionId, project.name)
    } catch (e: any) {
      toast.error(e?.message || String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Laptop className="h-4 w-4" /> {project.name}
          </h3>
          <p className="truncate font-mono text-xs text-muted-foreground" title={project.path}>
            {project.path}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs here with the project&apos;s own setup ({isPy ? `pytest, ${project.config}` : project.config || "package.json"}). Results are shared in this Automation Hub; the
            screenshots, traces and videos stay on this computer.
          </p>
          {!project.installed &&
            (isPy ? (
              <p className="mt-1 text-xs text-amber-700">
                No virtualenv found (.venv) — the system Python will be used. Create one with{" "}
                <code className="rounded bg-muted px-1">python3 -m venv .venv</code> and{" "}
                <code className="rounded bg-muted px-1">pip install -r requirements.txt</code> if the run can&apos;t find pytest.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                This project&apos;s packages aren&apos;t installed yet — run <code className="rounded bg-muted px-1">npm install</code> in it first.
              </p>
            ))}
        </div>
        <Button size="sm" variant="ghost" onClick={async () => (await pw?.unlink(project.path), onUnlinked())} title="Stop listing this folder here">
          <Unlink className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={() => pw?.stop(project.path)} className="text-rose-600">
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={run}>
            <Play className="h-4 w-4" /> Run on this computer
          </Button>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={headed} onChange={(e) => setHeaded(e.target.checked)} /> Show the browser
        </label>
        <input
          value={grep}
          onChange={(e) => setGrep(e.target.value)}
          placeholder={isPy ? "Only tests matching (pytest -k)… optional" : "Only tests matching… (optional)"}
          className="h-8 min-w-[200px] flex-1 rounded-md border bg-card px-2 text-xs"
        />
        {isPy && (
          <input
            value={marker}
            onChange={(e) => setMarker(e.target.value)}
            placeholder="Marker (pytest -m), e.g. smoke"
            title="Runs only tests with this marker, e.g. smoke, regression, or emergency_housing and not wip"
            className="h-8 min-w-[180px] rounded-md border bg-card px-2 text-xs"
          />
        )}
        {running && <BusyDot />}
      </div>
      {(running || log) && (
        <pre ref={logRef} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {log || "Starting…"}
        </pre>
      )}
    </div>
  )
}
