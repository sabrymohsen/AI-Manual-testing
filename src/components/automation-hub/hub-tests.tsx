"use client"

/**
 * Automation Hub → Tests: write, organise and run Playwright JavaScript tests.
 *
 * Left: the project's tests in folders, each with its last result. Middle: a
 * JavaScript editor that knows Playwright (autocomplete for page / locator /
 * expect, snippets, checks for the usual mistakes). Below: the run's results
 * per test, with the error, screenshot, trace and video.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  FilePlus2,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  PlayCircle,
  Save,
  Search,
  Server,
  Trash2,
  Wand2,
  XCircle,
  Ban,
  Tag,
  Link2,
  X,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import HubRunResults, { isActive, type HubExecutionView } from "@/components/automation-hub/hub-run-results"
import ExecutionTargetsModal from "@/components/automation-hub/execution-targets-modal"
import AccessibilityPanel from "@/components/automation-hub/accessibility-panel"
import { PLAYWRIGHT_EDITOR_TYPES } from "@/components/automation-hub/playwright-editor-types"
import { PLAYWRIGHT_SNIPPETS, lintPlaywrightJs } from "@/lib/hub-editor-help"
import { buildTemplateCode } from "@/lib/hub-templates"
import { PlainEnglishEditor, newPlainStep, type EditorStep } from "@/components/plain-english/plain-english-editor"
import { stepsToPlaywright } from "@/lib/plain-english/to-playwright"

interface HubTest {
  id: string
  name: string
  type: string
  code: string
  tags: string[]
  folder: string
  shared: boolean
  accessibilityEnabled: boolean
  /** "steps" = no-code plain-English test (code is generated); "code" = JavaScript. */
  mode?: "steps" | "code"
  steps?: { text: string; expected?: string }[] | null
  lastExecution: null | { id: string; status: string; createdAt: string; passed: number; failed: number; total: number }
  /** Manual test cases this script verifies; their status follows its runs. */
  linkedTestCases?: { id: string; title: string; lastStatus: string }[]
  /** Last finished runs, newest first. */
  history?: string[]
  passRate?: number | null
  flaky?: boolean
  flips?: number
}

const BROWSERS = [
  { value: "Headless", label: "Headless Chrome (fast)" },
  { value: "Chrome", label: "Chrome (watch it run)" },
  { value: "Firefox", label: "Firefox" },
  { value: "Safari", label: "Safari (WebKit)" },
]

const UNFILED = ""

// Monaco is global per page; register the language extras once.
let monacoReady = false

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export default function HubTestsSection({
  projectId,
  onOpenTrace,
  focusTestName,
}: {
  projectId: string
  onOpenTrace: (traceId: string) => void
  /** Select this test once the list loads (e.g. right after recording it). */
  focusTestName?: string | null
}) {
  const [tests, setTests] = useState<HubTest[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [folder, setFolder] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [closedFolders, setClosedFolders] = useState<Record<string, boolean>>({})
  const [browser, setBrowser] = useState("Headless")
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([])
  const [targetId, setTargetId] = useState("local")
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [execution, setExecution] = useState<HubExecutionView | null>(null)
  const [starting, setStarting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [snippetsOpen, setSnippetsOpen] = useState(false)
  const [issues, setIssues] = useState<ReturnType<typeof lintPlaywrightJs>>([])
  const [a11yOpen, setA11yOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagsText, setTagsText] = useState("")
  const [pendingSwitch, setPendingSwitch] = useState<HubTest | null>(null)
  const [pendingRunAnyway, setPendingRunAnyway] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [runSettings, setRunSettings] = useState<{ retries: number; workers: number } | null>(null)
  // No-code tests: plain-English steps are the source; "code" shows what they become.
  const [mode, setMode] = useState<"steps" | "code">("code")
  const [steps, setSteps] = useState<EditorStep[]>([])
  const [view, setView] = useState<"steps" | "code">("steps")
  const [pendingConvert, setPendingConvert] = useState(false)
  const [pendingRunUnclear, setPendingRunUnclear] = useState(false)
  const [projectUrl, setProjectUrl] = useState("")
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)

  const selected = useMemo(() => tests?.find((t) => t.id === selectedId) || null, [tests, selectedId])

  // ── data ──
  const load = useCallback(async () => {
    try {
      const d = await api<{ scripts: HubTest[] }>(`/api/hub/scripts?projectId=${projectId}`)
      setTests(d.scripts)
      return d.scripts
    } catch (e: any) {
      toast.error(e.message)
      setTests([])
      return []
    }
  }, [projectId])

  useEffect(() => {
    load().then((list) => {
      const wanted = (focusTestName && list.find((t) => t.name === focusTestName)) || list[0]
      if (wanted) select(wanted)
    })
    // Retries hide flaky failures — show the current setting next to Run.
    api<{ properties: { name: string; value: string }[] }>("/api/hub/config/properties")
      .then((d) => {
        const v = (k: string, f: number) => Number(d.properties.find((p) => p.name === k)?.value ?? f) || f
        setRunSettings({ retries: v("retries", 0), workers: v("workers", 1) })
      })
      .catch(() => {})
    // The project's website, to start new no-code tests on it.
    api<{ project?: { webAppUrl?: string } }>(`/api/projects/${projectId}`)
      .then((d) => setProjectUrl(d.project?.webAppUrl || ""))
      .catch(() => {})
    api<{ targets: { id: string; name: string }[] }>("/api/hub/targets")
      .then((d) => setTargets(d.targets || []))
      .catch(() => {})
    try {
      const b = localStorage.getItem("hub.browser")
      if (b && BROWSERS.some((x) => x.value === b)) setBrowser(b)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, focusTestName])

  const select = (t: HubTest) => {
    if (dirty && selected && t.id !== selected.id) {
      setPendingSwitch(t)
      return
    }
    openTest(t)
  }

  const openTest = (t: HubTest) => {
    setSelectedId(t.id)
    setTagsText(t.tags.join(", "))
    setCode(t.code)
    const isSteps = t.mode === "steps"
    setMode(isSteps ? "steps" : "code")
    setView(isSteps ? "steps" : "code")
    setSteps(isSteps ? (t.steps || []).map((x) => ({ ...newPlainStep(x.text), expectedResult: x.expected || "" })) : [])
    setName(t.name)
    setFolder(t.folder)
    setDirty(false)
    setExecution(null)
    if (t.lastExecution) loadExecution(t.lastExecution.id)
  }

  const loadExecution = async (id: string) => {
    try {
      const d = await api<{ execution: HubExecutionView }>(`/api/hub/executions/${id}`)
      setExecution(d.execution)
    } catch {}
  }

  // Poll the current run until it finishes.
  useEffect(() => {
    if (!execution || !isActive(execution.status)) return
    const timer = setInterval(async () => {
      try {
        const d = await api<{ execution: HubExecutionView }>(`/api/hub/executions/${execution.id}`)
        setExecution(d.execution)
        if (!isActive(d.execution.status)) {
          load()
          if (d.execution.status === "Passed") toast.success(`${d.execution.script?.name || "Test"} passed`)
          else toast.error(`${d.execution.script?.name || "Test"} failed`)
        }
      } catch {}
    }, 1200)
    return () => clearInterval(timer)
  }, [execution, load])

  // ── editor ──
  const runLint = useCallback((value: string) => {
    const found = lintPlaywrightJs(value)
    setIssues(found)
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    const sev = { error: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning, info: monaco.MarkerSeverity.Info }
    monaco.editor.setModelMarkers(
      model,
      "hub-playwright",
      found.map((f) => ({
        severity: sev[f.severity],
        message: f.message,
        startLineNumber: f.line,
        endLineNumber: f.line,
        startColumn: f.startColumn,
        endColumn: f.endColumn,
      }))
    )
  }, [])

  const onMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    if (!monacoReady) {
      monacoReady = true
      const js = monaco.languages.typescript.javascriptDefaults
      js.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        allowJs: true,
        checkJs: false,
      })
      js.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
      js.addExtraLib(PLAYWRIGHT_EDITOR_TYPES, "file:///node_modules/@playwright/test/index.d.ts")
      monaco.languages.registerCompletionItemProvider("javascript", {
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position)
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
          // Snippets only at the start of a statement, not after "page."
          const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
          if (/[.\w]$/.test(before)) return { suggestions: [] }
          return {
            suggestions: PLAYWRIGHT_SNIPPETS.map((s) => ({
              label: s.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: s.detail,
              documentation: s.insertText.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d/g, ""),
              insertText: s.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
            })),
          }
        },
      })
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById("hub-save")?.click())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById("hub-run")?.click())
    runLint(editor.getValue())
  }

  const insertSnippet = (insertText: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    editor.getContribution("snippetController2")?.insert(insertText)
    setSnippetsOpen(false)
  }

  // ── actions ──
  const save = async (): Promise<boolean> => {
    if (!selected) return false
    setSaving(true)
    try {
      await api(`/api/hub/scripts/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "steps"
            ? { steps: stepRows(steps), name: name.trim(), folder, tags: parseTags(tagsText) }
            : { code, name: name.trim(), folder, tags: parseTags(tagsText) }
        ),
      })
      setDirty(false)
      await load()
      return true
    } catch (e: any) {
      toast.error(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const run = async (
    scope: { kind: "test" } | { kind: "folder"; folder: string } | { kind: "tag"; tag: string } | { kind: "all" },
    force = false
  ) => {
    if (scope.kind === "test" && dirty && !(await save())) return
    if (scope.kind === "test" && !force && mode === "code" && issues.some((i) => i.severity === "error")) {
      setPendingRunAnyway(true)
      return
    }
    if (scope.kind === "test" && !force && mode === "steps" && unclearSteps > 0) {
      setPendingRunUnclear(true)
      return
    }
    try {
      localStorage.setItem("hub.browser", browser)
    } catch {}
    setStarting(true)
    try {
      if (scope.kind === "test" && selected) {
        const d = await api<{ executionId: string }>(`/api/hub/scripts/${selected.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A shared example runs inside this project.
          body: JSON.stringify({ browser, targetId, projectId }),
        })
        await loadExecution(d.executionId)
      } else {
        const body: any = { projectId, browser, targetId }
        if (scope.kind === "folder") body.folder = scope.folder
        if (scope.kind === "tag") body.tag = scope.tag
        const d = await api<{ executionIds: string[] }>("/api/hub/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        toast.success(`${d.executionIds.length} test file(s) queued. Follow them in the Runs tab.`)
        // Show the selected test's own run when it is part of the batch.
        await load()
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setStarting(false)
    }
  }

  const create = async (form: { name: string; type: "Web" | "API"; folder: string; how: "steps" | "code"; url: string }) => {
    try {
      const body =
        form.how === "steps"
          ? {
              projectId,
              name: form.name.trim(),
              type: form.type,
              folder: form.folder,
              mode: "steps",
              steps: form.url.trim() ? [{ text: `Go to "${form.url.trim()}"` }] : [],
            }
          : { projectId, name: form.name.trim(), type: form.type, folder: form.folder, code: buildTemplateCode(form.type, form.name.trim()) }
      const d = await api<{ script: HubTest }>("/api/hub/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setCreating(false)
      const list = await load()
      const t = list.find((x) => x.id === d.script.id)
      if (t) {
        setDirty(false)
        openTest(t)
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const duplicate = async () => {
    if (!selected) return
    let n = 2
    const names = new Set((tests || []).map((t) => t.name.toLowerCase()))
    while (names.has(`${selected.name} copy${n > 2 ? ` ${n - 1}` : ""}`.toLowerCase())) n++
    const copyName = `${selected.name} copy${n > 2 ? ` ${n - 1}` : ""}`.slice(0, 80)
    try {
      const d = await api<{ script: HubTest }>("/api/hub/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "steps"
            ? { projectId, name: copyName, type: selected.type, folder, mode: "steps", steps: stepRows(steps), tags: selected.tags }
            : { projectId, name: copyName, type: selected.type, folder, code, tags: selected.tags }
        ),
      })
      const list = await load()
      const t = list.find((x) => x.id === d.script.id)
      if (t) select(t)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const cancelRun = async () => {
    if (!execution) return
    try {
      await api(`/api/hub/executions/${execution.id}/cancel`, { method: "POST" })
      toast.success("Run cancelled")
      loadExecution(execution.id)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const saveLinks = async (ids: string[]) => {
    if (!selected) return
    try {
      await api(`/api/hub/scripts/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: ids }),
      })
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /** One way: the generated code becomes the test, and the steps are dropped. */
  const convertToCode = async () => {
    if (!selected) return
    if (dirty && !(await save())) return
    try {
      await api(`/api/hub/scripts/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "code" }),
      })
      const list = await load()
      const t = list.find((x) => x.id === selected.id)
      if (t) openTest(t)
      toast.success("Converted to JavaScript. You can now edit the code directly.")
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const remove = async () => {
    if (!selected) return
    try {
      await api(`/api/hub/scripts/${selected.id}`, { method: "DELETE" })
      setDirty(false)
      const list = await load()
      if (list[0]) {
        openTest(list[0])
      } else {
        setSelectedId(null)
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // ── derived ──
  const folders = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (tests || []).filter(
      (t) =>
        (!tagFilter || t.tags.includes(tagFilter)) &&
        (!q || t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q)))
    )
    const map = new Map<string, HubTest[]>()
    for (const t of list) map.set(t.folder || UNFILED, [...(map.get(t.folder || UNFILED) || []), t])
    return [...map.entries()].sort(([a], [b]) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)))
  }, [tests, search, tagFilter])
  const allTags = useMemo(() => [...new Set((tests || []).flatMap((t) => t.tags))].sort(), [tests])
  const flakyCount = (tests || []).filter((t) => t.flaky).length
  const folderNames = useMemo(() => [...new Set((tests || []).map((t) => t.folder).filter(Boolean))].sort(), [tests])
  const errors = issues.filter((i) => i.severity === "error").length
  const warnings = issues.filter((i) => i.severity === "warning").length
  const running = !!execution && isActive(execution.status)
  const generated = useMemo(
    () => (mode === "steps" ? stepsToPlaywright({ name: name || "Untitled test", steps: steps.map((x) => x.actionDescription) }) : null),
    [mode, steps, name]
  )
  const unclearSteps = generated?.errors.length ?? 0

  if (tests === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tests…
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* ── library ── */}
      <aside className="flex min-h-[560px] flex-col rounded-xl border bg-card">
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> New test
            </Button>
            <Button size="sm" variant="outline" onClick={() => run({ kind: "all" })} disabled={starting || !tests.length} title="Run every test in this project">
              <PlayCircle className="h-4 w-4" /> Run all
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests, folders, tags"
              className="h-9 w-full rounded-md border bg-muted/50 pl-8 pr-2 text-sm outline-none focus:border-primary focus:bg-card"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {allTags.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === g ? null : g)}
                  aria-pressed={tagFilter === g}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${tagFilter === g ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          {tagFilter && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => run({ kind: "tag", tag: tagFilter })} disabled={starting}>
              <PlayCircle className="h-4 w-4" /> Run tests tagged “{tagFilter}”
            </Button>
          )}
          {flakyCount > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3" /> {flakyCount} flaky test{flakyCount === 1 ? "" : "s"} — results flip between runs
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {folders.length === 0 && <p className="p-3 text-sm text-muted-foreground">No tests match “{search}”.</p>}
          {folders.map(([f, list]) => {
            const closed = closedFolders[f]
            return (
              <div key={f || "_unfiled"} className="mb-1">
                <div className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted/50">
                  <button type="button" onClick={() => setClosedFolders((c) => ({ ...c, [f]: !c[f] }))} className="flex flex-1 items-center gap-1.5 text-left text-xs font-medium text-muted-foreground">
                    {closed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {closed ? <Folder className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
                    {f || "No folder"} <span className="font-normal text-muted-foreground">{list.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => run({ kind: "folder", folder: f })}
                    disabled={starting}
                    title={`Run every test in ${f || "No folder"}`}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-primary group-hover:opacity-100 focus:opacity-100"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!closed &&
                  list.map((t) => {
                    const last = t.lastExecution
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => t.id !== selectedId && select(t)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-7 text-left text-sm ${
                          t.id === selectedId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {!last ? (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        ) : isActive(last.status) ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        ) : last.status === "Passed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                        )}
                        <span className="flex-1 truncate">{t.name}</span>
                        {t.flaky && (
                          <span
                            className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700"
                            title={`Flaky: ${t.flips ?? 0} pass/fail flips in the last ${t.history?.length ?? 0} runs, or it passed only on retry`}
                          >
                            Flaky
                          </span>
                        )}
                        {t.type === "API" && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">API</span>}
                        {t.mode === "steps" && <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary" title="Written as plain-English steps">No-code</span>}
                        {t.shared && <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700" title="Shared example, visible in every project">Example</span>}
                      </button>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── editor + results ── */}
      <section className="min-w-0 space-y-4">
        {!selected ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium text-foreground">No test selected</p>
            <p className="text-sm text-muted-foreground">Create one, or record a flow in the Recorder tab.</p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> New test
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-card">
              {/* header: name, folder, actions */}
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setDirty(true)
                  }}
                  aria-label="Test name"
                  className="h-9 min-w-[180px] flex-1 rounded-md border border-transparent px-2 text-base font-semibold text-foreground outline-none hover:border-border focus:border-primary"
                />
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Folder className="h-4 w-4" />
                  <input
                    list="hub-folders"
                    value={folder}
                    onChange={(e) => {
                      setFolder(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="No folder"
                    aria-label="Folder"
                    className="h-9 w-36 rounded-md border px-2 text-sm outline-none focus:border-primary"
                  />
                  <datalist id="hub-folders">
                    {folderNames.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>
                <Button id="hub-save" size="sm" variant="outline" onClick={save} disabled={saving || !dirty} title="Save (Ctrl/⌘ + S)">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {dirty ? "Save" : "Saved"}
                </Button>
                <Button size="sm" variant="ghost" onClick={duplicate} title="Duplicate">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingDelete(true)} title="Delete" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* tags + history */}
              <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
                <label className="flex min-w-[220px] flex-1 items-center gap-1.5 text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  <input
                    value={tagsText}
                    onChange={(e) => {
                      setTagsText(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="Tags, e.g. smoke, regression"
                    aria-label="Tags"
                    className="h-7 flex-1 rounded-md border px-2 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
                {selected.history && selected.history.length > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground" title="Last runs, newest on the left">
                    {selected.history.map((h, i) => (
                      <span key={i} className={`h-2.5 w-2.5 rounded-full ${h === "Passed" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    ))}
                    <span className="ml-1">{selected.passRate}% pass</span>
                    {selected.flaky && <span className="ml-1 font-medium text-amber-700">· flaky</span>}
                  </span>
                )}
              </div>

              {/* run bar */}
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/70 px-3 py-2">
                <Button id="hub-run" size="sm" onClick={() => run({ kind: "test" })} disabled={starting || running} title="Run (Ctrl/⌘ + Enter)">
                  {starting || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? (execution?.status === "Queued" ? "Queued…" : "Running…") : "Run test"}
                </Button>
                <select value={browser} onChange={(e) => setBrowser(e.target.value)} aria-label="Browser" className="h-8 rounded-md border bg-card px-2 text-sm">
                  {BROWSERS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Where to run" className="h-8 rounded-md border bg-card px-2 text-sm">
                  <option value="local">This machine</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setTargetsOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" title="Grid, Docker and BrowserStack targets">
                  <Server className="h-3.5 w-3.5" /> Targets
                </button>
                {running && (
                  <Button size="sm" variant="ghost" onClick={cancelRun} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                    <Ban className="h-4 w-4" /> Cancel
                  </Button>
                )}
                {runSettings && (
                  <span
                    className="text-xs text-muted-foreground"
                    title="Change in More tools → Data & Config. Retries can hide flaky failures: a test that passes on retry is reported as flaky."
                  >
                    Retries {runSettings.retries} · Workers {runSettings.workers}
                  </span>
                )}

                {mode === "steps" ? (
                  <div className="ml-auto inline-flex rounded-md border bg-card p-0.5 text-xs" role="tablist" aria-label="View">
                    {(["steps", "code"] as const).map((v) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => setView(v)}
                        className={`rounded px-2.5 py-1 font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {v === "steps" ? "Steps" : "Code"}
                      </button>
                    ))}
                  </div>
                ) : (
                <div className="relative ml-auto">
                  <Button size="sm" variant="outline" onClick={() => setSnippetsOpen((v) => !v)}>
                    <Wand2 className="h-4 w-4" /> Insert step <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  {snippetsOpen && (
                    <div className="absolute right-0 z-20 mt-1 max-h-96 w-80 overflow-y-auto rounded-lg border bg-card p-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
                      {(["Test", "Find & act", "Check", "API", "Advanced"] as const).map((g) => (
                        <div key={g}>
                          <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{g}</p>
                          {PLAYWRIGHT_SNIPPETS.filter((s) => s.group === g).map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => insertSnippet(s.insertText)}
                              className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-primary/10"
                            >
                              <span className="text-foreground">{s.detail}</span>
                              <code className="shrink-0 text-[11px] text-muted-foreground">{s.label}</code>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>

              {mode === "steps" && view === "steps" ? (
                <div className="space-y-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    Write each step as a sentence — e.g. <i>Click &quot;Sign in&quot;</i>, <i>Type &quot;demo&quot; in the &quot;Email&quot; field</i>,{" "}
                    <i>Verify that the page contains &quot;Welcome&quot;</i>. Suggestions appear as you type, or let AI write them.
                  </p>
                  <PlainEnglishEditor
                    steps={steps}
                    projectId={projectId}
                    onChange={(next) => {
                      setSteps(next)
                      setDirty(true)
                    }}
                  />
                </div>
              ) : mode === "steps" ? (
                <div>
                  <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span>This is the Playwright code your steps become — it&apos;s what runs. Edit the steps to change it.</span>
                    <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setPendingConvert(true)}>
                      Convert to code
                    </Button>
                  </div>
                  <div className="h-[420px] overflow-hidden">
                    <Editor
                      key={`${selected.id}-generated`}
                      language="javascript"
                      path={`file:///generated/${selected.id}.spec.js`}
                      value={generated?.code || ""}
                      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "on", automaticLayout: true }}
                    />
                  </div>
                </div>
              ) : (
              <div className="h-[420px]">
                <Editor
                  key={selected.id}
                  language="javascript"
                  path={`file:///tests/${selected.id}.spec.js`}
                  value={code}
                  onMount={onMount}
                  onChange={(v) => {
                    const value = v || ""
                    setCode(value)
                    setDirty(true)
                    runLint(value)
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    tabSize: 2,
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    quickSuggestions: { other: true, strings: false, comments: false },
                    suggest: { showWords: false },
                    fixedOverflowWidgets: true,
                  }}
                />
              </div>
              )}
              {mode === "steps" ? (
                <div className="flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
                  <span>No-code test · {steps.length} step{steps.length === 1 ? "" : "s"}</span>
                  {unclearSteps === 0 ? (
                    <span className="text-emerald-600">Every step is understood</span>
                  ) : (
                    <span className="text-rose-600">
                      {unclearSteps} step{unclearSteps === 1 ? " isn't" : "s aren't"} understood yet — see the red note under {unclearSteps === 1 ? "it" : "them"}
                    </span>
                  )}
                  <span className="ml-auto hidden sm:inline">⌘/Ctrl+S saves · Runs as a real Playwright test</span>
                </div>
              ) : (
              <div className="flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
                <span>Playwright · JavaScript</span>
                {errors === 0 && warnings === 0 ? (
                  <span className="text-emerald-600">No problems found</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const first = issues.find((i) => i.severity !== "info") || issues[0]
                      if (first && editorRef.current) {
                        editorRef.current.revealLineInCenter(first.line)
                        editorRef.current.setPosition({ lineNumber: first.line, column: first.startColumn })
                        editorRef.current.focus()
                      }
                    }}
                    className="hover:underline"
                  >
                    {errors > 0 && <span className="text-rose-600">{errors} error{errors > 1 ? "s" : ""}</span>}
                    {errors > 0 && warnings > 0 && ", "}
                    {warnings > 0 && <span className="text-amber-600">{warnings} warning{warnings > 1 ? "s" : ""}</span>}
                    {" "}— show
                  </button>
                )}
                <span className="ml-auto hidden sm:inline">Type <kbd className="rounded border px-1">page.</kbd> for suggestions · ⌘/Ctrl+Enter runs</span>
              </div>
              )}
            </div>

            <LinkedCases projectId={projectId} test={selected} onSave={saveLinks} />

            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Last run</h3>
              {execution ? (
                <HubRunResults execution={execution} onOpenTrace={onOpenTrace} />
              ) : (
                <p className="text-sm text-muted-foreground">Not run yet. Press <b>Run test</b> to see each check pass or fail here.</p>
              )}
            </div>

            <div className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setA11yOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground"
              >
                {a11yOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Accessibility check
                <span className="font-normal text-muted-foreground">{selected.accessibilityEnabled ? "· on for this test" : "· off"}</span>
              </button>
              {a11yOpen && (
                <div className="border-t p-4">
                  <AccessibilityPanel
                    script={{ id: selected.id, name: selected.name, accessibilityEnabled: selected.accessibilityEnabled }}
                    executionId={execution?.id}
                    onToggle={async (enabled) => {
                      try {
                        await api(`/api/hub/scripts/${selected.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ accessibilityEnabled: enabled }),
                        })
                        await load()
                      } catch (e: any) {
                        toast.error(e.message)
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingSwitch !== null}
        title={`Discard unsaved changes to “${selected?.name}”?`}
        description="Your edits to this test haven't been saved."
        confirmLabel="Discard changes"
        variant="danger"
        onConfirm={() => {
          if (pendingSwitch) {
            setDirty(false)
            openTest(pendingSwitch)
          }
          setPendingSwitch(null)
        }}
        onCancel={() => setPendingSwitch(null)}
      />
      <ConfirmDialog
        open={pendingRunAnyway}
        title="Run with errors?"
        description="The editor shows errors in this test, so the run will probably fail before any check runs."
        confirmLabel="Run anyway"
        onConfirm={() => {
          setPendingRunAnyway(false)
          run({ kind: "test" }, true)
        }}
        onCancel={() => setPendingRunAnyway(false)}
      />
      <ConfirmDialog
        open={pendingConvert}
        title="Convert this test to JavaScript code?"
        description="The generated Playwright code becomes the test and you edit it directly. The plain-English steps are removed — this can't be switched back."
        confirmLabel="Convert to code"
        onConfirm={async () => {
          setPendingConvert(false)
          await convertToCode()
        }}
        onCancel={() => setPendingConvert(false)}
      />
      <ConfirmDialog
        open={pendingRunUnclear}
        title="Some steps aren't understood yet"
        description="Steps with a red note can't run yet; the test will stop with a clear message at the first one. Fix them first, or run anyway."
        confirmLabel="Run anyway"
        onConfirm={() => {
          setPendingRunUnclear(false)
          run({ kind: "test" }, true)
        }}
        onCancel={() => setPendingRunUnclear(false)}
      />
      <ConfirmDialog
        open={pendingDelete}
        variant="danger"
        title={`Delete “${selected?.name}”?`}
        description="The test and its run history are deleted. Linked test cases are unlinked. This can't be undone."
        confirmLabel="Delete test"
        onConfirm={async () => {
          setPendingDelete(false)
          await remove()
        }}
        onCancel={() => setPendingDelete(false)}
      />

      {creating && <NewTestDialog folders={folderNames} projectUrl={projectUrl} onCancel={() => setCreating(false)} onCreate={create} />}
      <ExecutionTargetsModal
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        onChange={(list: any[]) => setTargets(list.map((t) => ({ id: t.id, name: t.name })))}
      />
    </div>
  )
}

function NewTestDialog({
  folders,
  projectUrl,
  onCancel,
  onCreate,
}: {
  folders: string[]
  projectUrl: string
  onCancel: () => void
  onCreate: (form: { name: string; type: "Web" | "API"; folder: string; how: "steps" | "code"; url: string }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"Web" | "API">("Web")
  const [folder, setFolder] = useState("")
  const [how, setHow] = useState<"steps" | "code">("steps")
  const [url, setUrl] = useState(projectUrl)
  const [busy, setBusy] = useState(false)
  const valid = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _-]{0,79}$/u.test(name.trim())

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    await onCreate({ name, type, folder, how, url: type === "Web" ? url : "" })
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md space-y-4 rounded-xl bg-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">New test</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Checkout with a saved card"
            className="h-10 w-full rounded-md border px-3 outline-none focus:border-primary"
          />
          {name && !valid && <span className="text-xs text-rose-600">Letters (any language), numbers, spaces, - or _ (up to 80).</span>}
        </label>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-foreground">What does it test?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Web", "A web page", "Opens a browser and clicks through the UI"],
                ["API", "An API", "Sends HTTP requests, no browser"],
              ] as const
            ).map(([value, title, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`rounded-lg border p-3 text-left ${type === value ? "border-primary bg-primary/10" : "hover:border-border"}`}
              >
                <span className="block font-medium text-foreground">{title}</span>
                <span className="text-xs text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-foreground">How do you want to build it?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["steps", "Plain-English steps", "No code: write sentences, or let AI write them"],
                ["code", "JavaScript code", "Playwright code, for developers"],
              ] as const
            ).map(([value, title, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setHow(value)}
                className={`rounded-lg border p-3 text-left ${how === value ? "border-primary bg-primary/10" : "hover:border-border"}`}
              >
                <span className="block font-medium text-foreground">{title}</span>
                <span className="text-xs text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </div>
        {how === "steps" && type === "Web" && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">Start page <span className="font-normal text-muted-foreground">(optional)</span></span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.example.com/login"
              className="h-10 w-full rounded-md border px-3 outline-none focus:border-primary"
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-foreground">Folder <span className="font-normal text-muted-foreground">(optional)</span></span>
          <input
            list="hub-new-folders"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Smoke, Regression, Checkout…"
            className="h-10 w-full rounded-md border px-3 outline-none focus:border-primary"
          />
          <datalist id="hub-new-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <p className="text-xs text-muted-foreground">
          {how === "steps"
            ? "You'll add steps like Click \"Sign in\" next — or describe the test and let AI write them."
            : "It starts with a working example you can run straight away and then change."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Editor rows → what the API stores. */
const stepRows = (rows: EditorStep[]) =>
  rows.filter((r) => r.actionDescription.trim()).map((r) => ({ text: r.actionDescription.trim(), ...(r.expectedResult?.trim() ? { expected: r.expectedResult.trim() } : {}) }))

const parseTags = (text: string) =>
  Array.from(new Set(text.split(",").map((t) => t.trim()).filter((t) => t && t.length <= 40))).slice(0, 20)

/**
 * The manual test cases this script verifies. Linked cases take the script's
 * latest result as their own, so automation shows in the test library and in
 * BRD coverage.
 */
function LinkedCases({
  projectId,
  test,
  onSave,
}: {
  projectId: string
  test: HubTest
  onSave: (ids: string[]) => Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<{ id: string; title: string }[]>([])
  const linked = test.linkedTestCases ?? []

  useEffect(() => {
    if (!picking) return
    const t = setTimeout(async () => {
      try {
        const d = await api<{ rows: { id: string; title: string }[] }>(
          `/api/projects/${projectId}/test-cases/browse?limit=20${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`
        )
        setRows(d.rows)
      } catch {}
    }, 250)
    return () => clearTimeout(t)
  }, [picking, q, projectId])

  if (test.shared) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
        Shared examples can&apos;t be linked to test cases — duplicate it into this project first.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Verifies test cases</h3>
        <span className="text-xs text-muted-foreground">Their last status follows this test&apos;s runs.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPicking((v) => !v)}>
          {picking ? "Done" : "Link test case"}
        </Button>
      </div>
      {linked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {linked.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <a href={`/projects/${projectId}/test-cases?case=${c.id}`} className="max-w-[260px] truncate hover:text-primary hover:underline" title={c.title}>
                {c.title}
              </a>
              <span className="text-muted-foreground">{c.lastStatus === "NotExecuted" ? "not run" : c.lastStatus.toLowerCase()}</span>
              <button
                type="button"
                onClick={() => onSave(linked.filter((x) => x.id !== c.id).map((x) => x.id))}
                className="text-muted-foreground hover:text-rose-600"
                aria-label={`Unlink ${c.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {picking && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search test cases…"
            className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-primary"
          />
          <div className="mt-1 max-h-48 overflow-y-auto">
            {rows
              .filter((r) => !linked.some((l) => l.id === r.id))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSave([...linked.map((l) => l.id), r.id])}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-primary/10"
                >
                  {r.title}
                </button>
              ))}
            {rows.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No test cases found.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
