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
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import HubRunResults, { isActive, type HubExecutionView } from "@/components/automation-hub/hub-run-results"
import ExecutionTargetsModal from "@/components/automation-hub/execution-targets-modal"
import AccessibilityPanel from "@/components/automation-hub/accessibility-panel"
import { PLAYWRIGHT_EDITOR_TYPES } from "@/components/automation-hub/playwright-editor-types"
import { PLAYWRIGHT_SNIPPETS, lintPlaywrightJs } from "@/lib/hub-editor-help"
import { buildTemplateCode } from "@/lib/hub-templates"

interface HubTest {
  id: string
  name: string
  type: string
  code: string
  tags: string[]
  folder: string
  shared: boolean
  accessibilityEnabled: boolean
  lastExecution: null | { id: string; status: string; createdAt: string; passed: number; failed: number; total: number }
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
    if (dirty && selected && !confirm(`Discard unsaved changes to “${selected.name}”?`)) return
    setSelectedId(t.id)
    setCode(t.code)
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
        body: JSON.stringify({ code, name: name.trim(), folder }),
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

  const run = async (scope: { kind: "test" } | { kind: "folder"; folder: string } | { kind: "all" }) => {
    if (scope.kind === "test" && dirty && !(await save())) return
    if (scope.kind === "test" && issues.some((i) => i.severity === "error") && !confirm("The editor shows errors. Run anyway?")) return
    try {
      localStorage.setItem("hub.browser", browser)
    } catch {}
    setStarting(true)
    try {
      if (scope.kind === "test" && selected) {
        const d = await api<{ executionId: string }>(`/api/hub/scripts/${selected.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browser, targetId }),
        })
        await loadExecution(d.executionId)
      } else {
        const body: any = { projectId, browser, targetId }
        if (scope.kind === "folder") body.folder = scope.folder
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

  const create = async (form: { name: string; type: "Web" | "API"; folder: string }) => {
    try {
      const d = await api<{ script: HubTest }>("/api/hub/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: form.name.trim(), type: form.type, folder: form.folder, code: buildTemplateCode(form.type, form.name.trim()) }),
      })
      setCreating(false)
      const list = await load()
      const t = list.find((x) => x.id === d.script.id)
      if (t) {
        setDirty(false)
        setSelectedId(t.id)
        setCode(t.code)
        setName(t.name)
        setFolder(t.folder)
        setExecution(null)
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
        body: JSON.stringify({ projectId, name: copyName, type: selected.type, folder, code, tags: selected.tags }),
      })
      const list = await load()
      const t = list.find((x) => x.id === d.script.id)
      if (t) select(t)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const remove = async () => {
    if (!selected || !confirm(`Delete “${selected.name}” and its run history? This can't be undone.`)) return
    try {
      await api(`/api/hub/scripts/${selected.id}`, { method: "DELETE" })
      setDirty(false)
      const list = await load()
      if (list[0]) {
        setSelectedId(list[0].id)
        setCode(list[0].code)
        setName(list[0].name)
        setFolder(list[0].folder)
        setExecution(null)
        if (list[0].lastExecution) loadExecution(list[0].lastExecution.id)
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
      (t) => !q || t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))
    )
    const map = new Map<string, HubTest[]>()
    for (const t of list) map.set(t.folder || UNFILED, [...(map.get(t.folder || UNFILED) || []), t])
    return [...map.entries()].sort(([a], [b]) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)))
  }, [tests, search])
  const folderNames = useMemo(() => [...new Set((tests || []).map((t) => t.folder).filter(Boolean))].sort(), [tests])
  const errors = issues.filter((i) => i.severity === "error").length
  const warnings = issues.filter((i) => i.severity === "warning").length
  const running = !!execution && isActive(execution.status)

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
                        {t.type === "API" && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">API</span>}
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
                <Button size="sm" variant="ghost" onClick={remove} title="Delete" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
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
              </div>

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
            </div>

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

      {creating && <NewTestDialog folders={folderNames} onCancel={() => setCreating(false)} onCreate={create} />}
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
  onCancel,
  onCreate,
}: {
  folders: string[]
  onCancel: () => void
  onCreate: (form: { name: string; type: "Web" | "API"; folder: string }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"Web" | "API">("Web")
  const [folder, setFolder] = useState("")
  const [busy, setBusy] = useState(false)
  const valid = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(name.trim())

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    await onCreate({ name, type, folder })
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
          {name && !valid && <span className="text-xs text-rose-600">Letters, numbers, spaces, - or _ (up to 80).</span>}
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
        <p className="text-xs text-muted-foreground">It starts with a working example you can run straight away and then change.</p>
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
