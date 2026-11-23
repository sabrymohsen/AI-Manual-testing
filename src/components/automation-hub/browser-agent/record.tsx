"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Copy, Globe, Loader2, Play, RefreshCw, Save, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentBrowser, fillData, parseTestData } from "@/lib/browser-agent/client"
import { actionsFor, listedElements, parseSnapshot, roleLocator, stepSentence, type RecordAction, type SnapElement } from "@/lib/browser-agent/snapshot"
import { toJavaScript, toPython, type RecordedAction } from "@/lib/browser-agent/record-code"
import { LiveView, type AgentSettings } from "./browser-agent"

const ACTION_LABEL: Record<RecordAction, string> = {
  click: "Click",
  fill: "Type",
  select: "Select",
  check: "Check",
  uncheck: "Uncheck",
  hover: "Hover",
  "verify-visible": "Check it's visible",
  "verify-text": "Check page text",
  press: "Press key",
  goto: "Go to",
}

/** Shared by Record and Find locators: an open browser and its current page. */
export function useAgentPage(projectId: string, settings: AgentSettings) {
  const browserRef = useRef<AgentBrowser | null>(null)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState("")
  const [shot, setShot] = useState<string>()
  const [page, setPage] = useState<{ title: string; url: string } | null>(null)

  useEffect(() => () => void browserRef.current?.close(), [])
  // Switching server/computer means another browser.
  useEffect(() => {
    void browserRef.current?.close()
    browserRef.current = null
    setSnapshot("")
    setShot(undefined)
    setPage(null)
  }, [settings.runsOn, settings.headed])

  const refresh = async (b: AgentBrowser) => {
    const [snap, s] = [await b.snapshot(), await b.screenshot()]
    setSnapshot(snap)
    setShot(s)
    setPage(b.page)
    return snap
  }

  const run = async <T,>(fn: (b: AgentBrowser) => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    try {
      if (!browserRef.current) browserRef.current = new AgentBrowser(projectId, settings.runsOn, settings.headed)
      return await fn(browserRef.current)
    } catch (e: any) {
      toast.error(e?.message || String(e))
      if (browserRef.current && !browserRef.current.open) setPage(null)
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const open = (url: string) =>
    run(async (b) => {
      if (!/^https?:\/\//i.test(url.trim())) throw new Error("Enter the page address (https://…)")
      await b.openAt(url.trim())
      await refresh(b)
      return true
    })

  const close = async () => {
    await browserRef.current?.close()
    browserRef.current = null
    setSnapshot("")
    setShot(undefined)
    setPage(null)
  }

  return { browser: () => browserRef.current, busy, snapshot, shot, page, run, refresh, open, close, isOpen: !!page }
}

/** Element list with search; selecting one shows its actions. */
export function ElementList({ elements, selected, onSelect }: { elements: SnapElement[]; selected?: string; onSelect: (e: SnapElement) => void }) {
  const [q, setQ] = useState("")
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return elements.filter((e) => !s || `${e.role} ${e.name} ${e.value || ""}`.toLowerCase().includes(s))
  }, [elements, q])
  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${elements.length} elements`} className="h-8 w-full rounded-md border bg-card pl-7 pr-2 text-[13px] font-normal" />
      </div>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        {shown.map((e) => (
          <button
            key={e.ref}
            onClick={() => onSelect(e)}
            className={`flex w-full items-center gap-2 border-b px-2.5 py-1.5 text-left last:border-b-0 ${selected === e.ref ? "bg-primary/10" : "hover:bg-muted/50"}`}
          >
            <span className="w-20 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-center text-[11px] font-medium text-muted-foreground">{e.role}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-foreground" dir="auto">
              {e.name || e.value || <span className="italic text-muted-foreground">no name</span>}
            </span>
            {e.disabled && <span className="text-[11px] text-muted-foreground">disabled</span>}
          </button>
        ))}
        {!shown.length && <p className="p-3 text-[13px] font-normal text-muted-foreground">Nothing matches.</p>}
      </div>
    </div>
  )
}

export function RecordPanel({ projectId, settings, onOpenTests }: { projectId: string; settings: AgentSettings; onOpenTests: (name: string) => void }) {
  const ap = useAgentPage(projectId, settings)
  const [steps, setSteps] = useState<RecordedAction[]>([])
  const [sel, setSel] = useState<SnapElement | null>(null)
  const [value, setValue] = useState("")
  const [pageText, setPageText] = useState("")
  const [name, setName] = useState("")
  const [code, setCode] = useState<"none" | "js" | "python">("none")
  const [saving, setSaving] = useState(false)
  const elements = useMemo(() => listedElements(parseSnapshot(ap.snapshot)), [ap.snapshot])

  const add = (a: RecordedAction) => setSteps((s) => [...s, a])

  const start = async () => {
    const url = settings.startUrl.trim()
    const ok = await ap.open(url)
    if (ok) {
      setSteps((s) => (s.length ? s : [{ action: "goto", sentence: stepSentence("goto", null, url)!, value: url }]))
      setSel(null)
    }
  }

  const act = (action: RecordAction) =>
    ap.run(async (b) => {
      const { data } = parseTestData(settings.testData)
      const needsValue = action === "fill" || action === "select"
      if (needsValue && !value) throw new Error(action === "fill" ? "Type the text first" : "Type the option to select")
      const el = sel
      if (!el) return
      // The locator first: the ref is only good for the current snapshot.
      const loc = await b.exec("generate-locator", [el.ref])
      const locator = loc.ok ? String(loc.result?.result || "").trim() || undefined : roleLocator(el, "js")?.replace(/^page\./, "")
      if (action !== "verify-visible") {
        const args = needsValue ? [el.ref, fillData(value, data)] : [el.ref]
        await b.must(action, args)
      }
      const sentence = stepSentence(action, el, needsValue ? value : undefined)
      add({ action, sentence: sentence || `${ACTION_LABEL[action]} ${el.role}`, locator, value: needsValue ? value : undefined })
      setValue("")
      setSel(null)
      await ap.refresh(b)
    })

  const pressKey = (key: string) =>
    ap.run(async (b) => {
      await b.must("press", [key])
      add({ action: "press", sentence: stepSentence("press", null, key)!, value: key })
      await ap.refresh(b)
    })

  const checkText = () => {
    const t = pageText.trim()
    if (!t) return
    if (!ap.snapshot.includes(t)) toast.warning("That text isn't on the page right now — added anyway.")
    add({ action: "verify-text", sentence: stepSentence("verify-text", null, t)!, value: t })
    setPageText("")
  }

  const save = async () => {
    if (!name.trim()) return toast.error("Name the test first")
    if (!steps.length) return toast.error("Record at least one step")
    setSaving(true)
    try {
      const res = await fetch("/api/hub/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: name.trim(), type: "Web", mode: "steps", folder: "Recorded", steps: steps.map((s) => ({ text: s.sentence })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Couldn't save the test")
      toast.success("Saved as a no-code test")
      onOpenTests(name.trim())
    } catch (e: any) {
      toast.error(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const codeText = code === "js" ? toJavaScript(name, steps) : code === "python" ? toPython(name, steps) : ""

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_1fr_minmax(0,360px)]">
      {/* Elements */}
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={start} disabled={ap.busy}>
            {ap.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} {ap.isOpen ? "Restart at start page" : "Open start page"}
          </Button>
          {ap.isOpen && (
            <>
              <Button size="sm" variant="ghost" title="Back" onClick={() => ap.run(async (b) => (await b.must("go-back"), ap.refresh(b)))} disabled={ap.busy}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Read the page again" onClick={() => ap.run((b) => ap.refresh(b))} disabled={ap.busy}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Close the browser" onClick={ap.close} disabled={ap.busy}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        {ap.isOpen ? (
          <>
            <ElementList elements={elements} selected={sel?.ref} onSelect={(e) => (setSel(e), setValue(""))} />
            {sel && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                <p className="truncate text-[13px] font-medium text-foreground" dir="auto">
                  {sel.role} “{sel.name || sel.value}”
                </p>
                {actionsFor(sel).some((a) => a === "fill" || a === "select") && (
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Text to type / option to select — or {name} from test data"
                    className="h-8 w-full rounded-md border bg-card px-2 text-[13px] font-normal"
                    dir="auto"
                  />
                )}
                <div className="flex flex-wrap gap-1.5">
                  {actionsFor(sel).map((a) => (
                    <Button key={a} size="sm" variant={a === actionsFor(sel)[0] ? "default" : "outline"} onClick={() => act(a)} disabled={ap.busy}>
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
              <span className="text-xs font-normal text-muted-foreground">Press</span>
              {["Enter", "Tab", "Escape"].map((k) => (
                <Button key={k} size="sm" variant="outline" onClick={() => pressKey(k)} disabled={ap.busy}>
                  {k}
                </Button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={pageText}
                onChange={(e) => setPageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkText()}
                placeholder="Check the page shows this text"
                className="h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-[13px] font-normal"
                dir="auto"
              />
              <Button size="sm" variant="outline" onClick={checkText}>
                Add check
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[13px] font-normal text-muted-foreground">Open the start page, then pick elements to act on. Each action becomes a step.</p>
        )}
      </div>

      {/* Page */}
      <LiveView shot={ap.shot} page={ap.page} busy={ap.busy} />

      {/* Steps */}
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <p className="text-[13px] font-semibold text-foreground">Recorded steps ({steps.length})</p>
        <ol className="max-h-72 space-y-1 overflow-auto">
          {steps.map((s, i) => (
            <li key={i} className="group flex items-start gap-2 text-[13px]">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words font-normal text-foreground" dir="auto">
                {s.sentence}
              </span>
              <button onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100" title="Remove">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-600" />
              </button>
            </li>
          ))}
          {!steps.length && <li className="text-[13px] font-normal text-muted-foreground">No steps yet.</li>}
        </ol>
        <div className="space-y-2 border-t pt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name" className="h-8 w-full rounded-md border bg-card px-2 text-[13px] font-normal" dir="auto" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={save} disabled={saving || !steps.length}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save as no-code test
            </Button>
            <Button size="sm" variant={code === "js" ? "default" : "outline"} onClick={() => setCode(code === "js" ? "none" : "js")} disabled={!steps.length}>
              JavaScript
            </Button>
            <Button size="sm" variant={code === "python" ? "default" : "outline"} onClick={() => setCode(code === "python" ? "none" : "python")} disabled={!steps.length}>
              Python
            </Button>
          </div>
          <p className="text-xs font-normal text-muted-foreground">
            <Play className="mr-1 inline h-3 w-3" />A saved test runs from the Tests tab like any other.
          </p>
        </div>
        {codeText && (
          <div className="relative">
            <button
              onClick={() => navigator.clipboard.writeText(codeText).then(() => toast.success("Copied"))}
              className="absolute right-2 top-2 rounded bg-slate-700 p-1 text-slate-100 hover:bg-slate-600"
              title="Copy"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100" dir="ltr">
              {codeText}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
