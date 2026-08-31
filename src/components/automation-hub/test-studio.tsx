"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import Editor from "@monaco-editor/react"
import { buildTemplateCode, HubScriptType } from "@/lib/hub-templates"
import TestDataManager from "@/components/automation-hub/test-data-manager"
import AccessibilityPanel from "@/components/automation-hub/accessibility-panel"
import ExecutionTargetsModal, { ExecutionTarget } from "@/components/automation-hub/execution-targets-modal"
import {
  Play,
  Bug,
  Save,
  Trash2,
  Plus,
  Search,
  Globe,
  Server,
  Database,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Clock,
  Terminal,
  FileText,
  Camera,
  Crosshair,
  Copy,
  X,
  Folder,
  FolderOpen,
  Shield,
  Code2,
  Accessibility,
  Settings,
  Monitor,
  Film
} from "lucide-react"

// ---------- Types ----------

interface HubScript {
  id: string
  name: string
  type: string
  code: string
  tags: string[]
  accessibilityEnabled: boolean
  createdAt: string
  updatedAt: string
  lastExecution: {
    id: string
    status: string
    duration: number | null
    createdAt: string
  } | null
}

interface HubExecution {
  id: string
  status: string
  duration: number | null
  allureLink: string | null
  screenshotPath: string | null
  browser: string | null
  executionTarget?: string | null
  logOutput?: string
  createdAt: string
}

interface LocatorElement {
  tag: string
  text: string
  locatorJava: string
  box: { x: number; y: number; width: number; height: number }
}

interface TestStudioSectionProps {
  selectedTestName: string
  onSelectTest: (name: string) => void
}

// ---------- Constants ----------

const FOLDERS: { type: HubScriptType; label: string; icon: any }[] = [
  { type: "Web", label: "Web Tests", icon: Globe },
  { type: "API", label: "API Tests", icon: Server },
  { type: "Database", label: "Database Tests", icon: Database }
]

const BROWSERS = ["Chrome", "Firefox", "Edge", "Headless"]

// Editor autocomplete for the Playwright API the runner actually executes.
// These were SHAFT/Selenium Java snippets — offering them in a studio whose
// runner is Playwright would hand people code that cannot run.
const PW_SNIPPETS: { label: string; insertText: string; detail: string }[] = [
  { label: "test", insertText: 'test("${1:scenario}", async ({ page }) => {\n  $0\n});', detail: "New test block" },
  { label: "page.goto", insertText: 'await page.goto("${1:https://example.com}");', detail: "Navigate the page" },
  { label: "getByRole", insertText: 'page.getByRole("${1:button}", { name: "${2:Submit}" })', detail: "Locator by ARIA role (preferred)" },
  { label: "getByLabel", insertText: 'page.getByLabel("${1:Username}")', detail: "Locator by form label" },
  { label: "getByText", insertText: 'page.getByText("${1:Welcome}")', detail: "Locator by visible text" },
  { label: "getByTestId", insertText: 'page.getByTestId("${1:submit-btn}")', detail: "Locator by test id" },
  { label: "page.locator", insertText: 'page.locator("${1:.selector}")', detail: "Locator by CSS or XPath" },
  { label: ".click", insertText: 'await ${1:locator}.click();', detail: "Click an element" },
  { label: ".fill", insertText: 'await ${1:locator}.fill("${2:text}");', detail: "Fill an input" },
  { label: ".selectOption", insertText: 'await ${1:locator}.selectOption("${2:value}");', detail: "Choose a dropdown option" },
  { label: ".press", insertText: 'await ${1:locator}.press("${2:Enter}");', detail: "Press a key" },
  { label: ".hover", insertText: 'await ${1:locator}.hover();', detail: "Hover over an element" },
  { label: "expect toBeVisible", insertText: 'await expect(${1:locator}).toBeVisible();', detail: "Assert element is visible" },
  { label: "expect toHaveText", insertText: 'await expect(${1:locator}).toHaveText("${2:expected}");', detail: "Assert element text" },
  { label: "expect toHaveURL", insertText: 'await expect(page).toHaveURL("${1:https://example.com}");', detail: "Assert the current URL" },
  { label: "expect toHaveValue", insertText: 'await expect(${1:locator}).toHaveValue("${2:expected}");', detail: "Assert an input value" },
  { label: "request.get", insertText: 'const res = await request.get("${1:/endpoint}");', detail: "API GET request" },
  { label: "request.post", insertText: 'const res = await request.post("${1:/endpoint}", { data: ${2:{}} });', detail: "API POST request" },
  { label: "expect status", insertText: 'expect(res.status()).toBe(${1:200});', detail: "Assert a response status" },
  { label: "page.screenshot", insertText: 'await page.screenshot({ path: "${1:shot.png}" });', detail: "Capture a screenshot" },
  { label: "waitForSelector", insertText: 'await page.waitForSelector("${1:.selector}");', detail: "Wait for an element" },
]

let pwCompletionsRegistered = false

// ---------- Component ----------

export default function TestStudioSection({ selectedTestName, onSelectTest }: TestStudioSectionProps) {
  // Library state
  const [scripts, setScripts] = useState<HubScript[]>([])
  const [loadingScripts, setLoadingScripts] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ Web: true, API: true, Database: true })

  // Editor state
  const [selectedScript, setSelectedScript] = useState<HubScript | null>(null)
  const [editorCode, setEditorCode] = useState("")
  const [scriptName, setScriptName] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)

  // Sub-tab state: Editor | Test Data | Accessibility
  const [studioTab, setStudioTab] = useState<"Editor" | "Data" | "Accessibility">("Editor")

  // Execution targets (Section 1c)
  const [targets, setTargets] = useState<ExecutionTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<string>("local")
  const [targetsModalOpen, setTargetsModalOpen] = useState(false)
  const [runMenuOpen, setRunMenuOpen] = useState(false)

  // Run state
  const [selectedBrowser, setSelectedBrowser] = useState("Chrome")
  const [running, setRunning] = useState(false)

  // Animated-GIF recording (SHAFT createAnimatedGif) — global custom.properties setting
  const [gifRecording, setGifRecording] = useState(false)
  const [gifFrameDelay, setGifFrameDelay] = useState(500)
  const [gifSaving, setGifSaving] = useState(false)
  const [gifMenuOpen, setGifMenuOpen] = useState(false)
  const [liveLogs, setLiveLogs] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const [lastExecution, setLastExecution] = useState<HubExecution | null>(null)
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [screenshotEnlarged, setScreenshotEnlarged] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const consoleContainerRef = useRef<HTMLPreElement | null>(null)

  // Custom Toast State
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Custom Confirm Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null)
  const [confirmTitle, setConfirmTitle] = useState("")
  const triggerConfirm = (title: string, callback: () => void) => {
    setConfirmTitle(title)
    setConfirmCallback(() => callback)
    setConfirmOpen(true)
  }

  // Custom Create Test Script Dialog State
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createScriptType, setCreateScriptType] = useState<HubScriptType>("Web")
  const [newScriptName, setNewScriptName] = useState("")

  // Smart Locator state
  const [locatorOpen, setLocatorOpen] = useState(false)
  const [locatorUrl, setLocatorUrl] = useState("https://example.com")
  const [locatorLoading, setLocatorLoading] = useState(false)
  const [locatorSnapshot, setLocatorSnapshot] = useState<{ screenshot: string; viewport: { width: number; height: number }; elements: LocatorElement[] } | null>(null)
  const [pickedElement, setPickedElement] = useState<LocatorElement | null>(null)
  const [locatorError, setLocatorError] = useState("")

  // ---------- Data loading ----------

  const loadScripts = useCallback(async (): Promise<HubScript[]> => {
    try {
      const res = await fetch("/api/hub/scripts")
      if (!res.ok) return []
      const d = await res.json()
      setScripts(d.scripts || [])
      return d.scripts || []
    } catch (err) {
      console.error(err)
      return []
    } finally {
      setLoadingScripts(false)
    }
  }, [])

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/targets")
      if (!res.ok) return
      const d = await res.json()
      const list: ExecutionTarget[] = d.targets || []
      setTargets(list)
      // Pre-select the default target if one is configured
      const def = list.find((t) => t.isDefault)
      if (def) setSelectedTargetId(def.id)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    loadScripts().then((list) => {
      if (list.length > 0) {
        const match = list.find((s) => s.name === selectedTestName) || list[0]
        selectScript(match, false)
      }
    })
    loadTargets()
    return () => eventSourceRef.current?.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep in sync with the hub-wide persistent test context
  useEffect(() => {
    if (selectedScript?.name === selectedTestName) return
    const match = scripts.find((s) => s.name === selectedTestName)
    if (match) selectScript(match, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTestName])

  // Elapsed timer while a run is in-flight
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - started), 250)
    return () => clearInterval(t)
  }, [running])

  // Auto-scroll the console
  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight
    }
  }, [liveLogs])

  // Tail a (possibly in-flight) execution over SSE until it completes
  const attachLiveStream = (executionId: string) => {
    eventSourceRef.current?.close()
    setLiveLogs("")

    const es = new EventSource(`/api/hub/executions/${executionId}/live`)
    eventSourceRef.current = es

    es.addEventListener("log", (e: MessageEvent) => {
      const payload = JSON.parse(e.data)
      setLiveLogs((prev) => prev + payload.chunk)
    })

    es.addEventListener("done", (e: MessageEvent) => {
      const payload = JSON.parse(e.data)
      setLastExecution(payload.execution)
      setRunning(false)
      es.close()
      loadScripts()
    })

    es.addEventListener("error", () => {
      // stream dropped — fall back to fetching the final record
      es.close()
      fetch(`/api/hub/executions/${executionId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.execution) {
            setLastExecution(data.execution)
            setLiveLogs(data.execution.logOutput || "")
            if (data.execution.status !== "Running") setRunning(false)
          } else {
            setRunning(false)
          }
        })
        .catch(() => setRunning(false))
    })
  }

  const selectScript = (script: HubScript, propagate = true) => {
    eventSourceRef.current?.close()
    setRunning(false)
    setSelectedScript(script)
    setEditorCode(script.code)
    setScriptName(script.name)
    setDirty(false)
    setLastExecution(script.lastExecution ? ({ ...script.lastExecution, allureLink: null, screenshotPath: null, browser: null } as HubExecution) : null)
    if (script.lastExecution) {
      // hydrate the full execution record (allure link, screenshot, logs)
      fetch(`/api/hub/executions/${script.lastExecution.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.execution) return
          if (d.execution.status === "Running") {
            // execution still in flight (e.g. page reloaded mid-run) — resume tailing it
            setRunning(true)
            attachLiveStream(d.execution.id)
          } else {
            setLastExecution(d.execution)
            setLiveLogs(d.execution.logOutput || "")
          }
        })
        .catch(() => {})
    } else {
      setLiveLogs("")
    }
    if (propagate) onSelectTest(script.name)
  }

  // ---------- Monaco: SHAFT auto-complete + validation ----------

  const validateCode = useCallback((code: string, editor: any, monaco: any, name: string) => {
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    const markers: any[] = []
    const lines = code.split("\n")

    const openBraces = (code.match(/{/g) || []).length
    const closeBraces = (code.match(/}/g) || []).length
    if (openBraces !== closeBraces) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Unbalanced braces: ${openBraces} "{" vs ${closeBraces} "}"`,
        startLineNumber: lines.length,
        startColumn: 1,
        endLineNumber: lines.length,
        endColumn: (lines[lines.length - 1]?.length || 0) + 1
      })
    }

    if (!/^\s*package\s+[\w.]+\s*;/m.test(code)) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: "Missing package declaration (expected: package com.ourcompany.tests;)",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: (lines[0]?.length || 0) + 1
      })
    }

    if (!code.includes("@Test")) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: "No @Test annotation found — TestNG will not pick up any test method",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: (lines[0]?.length || 0) + 1
      })
    }

    // A spec with no test() block runs green while asserting nothing, which is
    // the most misleading outcome available — flag it where the Java class-name
    // check used to be.
    if (code.trim() && !/\btest\s*\(/.test(code)) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `No test() block found — the runner will report "No tests found" for ${name || "this script"}.`,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: (lines[0]?.length || 0) + 1
      })
    }

    monaco.editor.setModelMarkers(model, "shaft-studio", markers)
  }, [])

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    if (!pwCompletionsRegistered) {
      pwCompletionsRegistered = true
      monaco.languages.registerCompletionItemProvider("typescript", {
        triggerCharacters: [".", "@"],
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }
          return {
            suggestions: PW_SNIPPETS.map((s) => ({
              label: s.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: s.detail,
              insertText: s.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range
            }))
          }
        }
      })
    }

    validateCode(editor.getValue(), editor, monaco, scriptName)
  }

  const handleCodeChange = (val: string | undefined) => {
    const code = val || ""
    setEditorCode(code)
    setDirty(true)
    validateCode(code, editorRef.current, monacoRef.current, scriptName)
  }

  // ---------- Toolbar actions ----------

  const handleCreateTest = (type: HubScriptType) => {
    setNewMenuOpen(false)
    setCreateScriptType(type)
    setNewScriptName(`New${type === "Database" ? "Db" : type}Test`)
    setCreateModalOpen(true)
  }

  const submitCreateTest = async () => {
    const name = newScriptName.trim()
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      showToast("Invalid name — use a valid Java class name (letters, digits, _, no spaces).", "error")
      return
    }

    try {
      const res = await fetch("/api/hub/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: createScriptType, code: buildTemplateCode(createScriptType, name), tags: [createScriptType, "New"] })
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d.error || "Failed to create the test script", "error")
        return
      }
      setCreateModalOpen(false)
      showToast("Script created successfully!")
      const list = await loadScripts()
      const created = list.find((s) => s.id === d.script.id)
      if (created) selectScript(created)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!selectedScript) return
    setSaving(true)
    try {
      const res = await fetch(`/api/hub/scripts/${selectedScript.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: scriptName, code: editorCode })
      })
      if (res.ok) {
        setDirty(false)
        showToast("Script saved successfully!")
        await loadScripts()
      } else {
        const d = await res.json()
        showToast(d.error || "Failed to save the script", "error")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!selectedScript) return
    triggerConfirm(`Delete "${selectedScript.name}" and all of its execution history?`, async () => {
      try {
        const res = await fetch(`/api/hub/scripts/${selectedScript.id}`, { method: "DELETE" })
        if (res.ok) {
          showToast("Script deleted successfully!")
          const list = await loadScripts()
          if (list.length > 0) {
            selectScript(list[0])
          } else {
            setSelectedScript(null)
            setEditorCode("")
            setScriptName("")
            setLastExecution(null)
            setLiveLogs("")
          }
        }
      } catch (err) {
        console.error(err)
      }
    })
  }

  const handleRun = async (debug = false, targetIdOverride?: string) => {
    if (!selectedScript || running) return
    setRunMenuOpen(false)

    // Persist unsaved edits first so the runner executes what is on screen
    if (dirty) await handleSave()

    setRunning(true)
    setElapsed(0)
    setConsoleOpen(true)
    setLastExecution(null)
    setLiveLogs("")

    try {
      const res = await fetch(`/api/hub/scripts/${selectedScript.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser: selectedBrowser, debug, targetId: targetIdOverride ?? selectedTargetId })
      })
      const d = await res.json()
      if (!res.ok) {
        setLiveLogs(`Failed to start execution: ${d.error || res.statusText}`)
        setRunning(false)
        return
      }

      attachLiveStream(d.executionId)
    } catch (err) {
      console.error(err)
      setRunning(false)
    }
  }

  // ---------- Animated GIF recording ----------

  // Load the current createAnimatedGif setting from custom.properties on mount
  useEffect(() => {
    fetch("/api/hub/settings/gif")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setGifRecording(Boolean(d.enabled))
        if (d.frameDelay) setGifFrameDelay(d.frameDelay)
      })
      .catch(() => {})
  }, [])

  const persistGifSettings = async (enabled: boolean, frameDelay: number) => {
    setGifSaving(true)
    // optimistic
    setGifRecording(enabled)
    setGifFrameDelay(frameDelay)
    try {
      const res = await fetch("/api/hub/settings/gif", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, frameDelay })
      })
      if (res.ok) {
        const d = await res.json()
        setGifRecording(Boolean(d.enabled))
        if (d.frameDelay) setGifFrameDelay(d.frameDelay)
      }
    } catch {
      // revert on failure
      setGifRecording(!enabled)
    } finally {
      setGifSaving(false)
    }
  }

  // ---------- Smart Locator ----------

  const handleLocatorScan = async () => {
    setLocatorLoading(true)
    setLocatorError("")
    setLocatorSnapshot(null)
    setPickedElement(null)
    try {
      const res = await fetch("/api/hub/locator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: locatorUrl })
      })
      const d = await res.json()
      if (!res.ok) {
        setLocatorError(d.error || "Failed to load the page")
        return
      }
      setLocatorSnapshot(d)
    } catch (err: any) {
      setLocatorError(err.message)
    } finally {
      setLocatorLoading(false)
    }
  }

  const insertCodeAtCursor = (line: string) => {
    const editor = editorRef.current
    if (!editor) return
    const position = editor.getPosition()
    editor.executeEdits("smart-locator", [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: line
      }
    ])
    editor.focus()
    setLocatorOpen(false)
  }

  // ---------- Derived ----------

  const filteredScripts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) => s.name.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [scripts, searchQuery])

  const formatDuration = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return "—"
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const StatusDot = ({ status }: { status?: string }) => {
    if (status === "Passed") return <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
    if (status === "Failed") return <XCircle size={12} className="text-rose-500 shrink-0" />
    if (status === "Running") return <Loader2 size={12} className="text-indigo-500 animate-spin shrink-0" />
    return <Circle size={10} className="text-slate-300 shrink-0" />
  }

  // Keep the selected script (and library) in sync when the accessibility audit is toggled
  const handleAccessibilityToggle = (enabled: boolean) => {
    if (!selectedScript) return
    setSelectedScript({ ...selectedScript, accessibilityEnabled: enabled })
    setScripts((cur) => cur.map((s) => (s.id === selectedScript.id ? { ...s, accessibilityEnabled: enabled } : s)))
  }

  const selectedTarget = targets.find((t) => t.id === selectedTargetId)
  const targetLabel = selectedTarget && selectedTarget.type !== "local" ? selectedTarget.name : "Local"

  const STUDIO_TABS = [
    { id: "Editor" as const, label: "Editor", icon: Code2 },
    { id: "Data" as const, label: "Test Data", icon: Database },
    { id: "Accessibility" as const, label: "Accessibility", icon: Accessibility }
  ]

  // ---------- Render ----------

  return (
    <div className="space-y-4">
      {/* SUB-TAB BAR: Editor · Test Data · Accessibility */}
      <div className="flex items-center gap-1 bg-white border rounded-2xl p-1 shadow-2xs w-fit">
        {STUDIO_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStudioTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black transition-all ${
              studioTab === t.id ? "bg-indigo-600 text-white shadow-xs" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <t.icon size={12} /> {t.label}
            {t.id === "Accessibility" && selectedScript?.accessibilityEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        ))}
      </div>

      {studioTab === "Editor" && (
      <>
      {/* STUDIO TOOLBAR */}
      <div className="bg-white border rounded-2xl p-3 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* New Test dropdown */}
          <div className="relative">
            <Button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-9 px-3.5 text-xs font-black shadow-xs flex items-center gap-1.5"
            >
              <Plus size={13} /> New Test
              <ChevronDown size={12} />
            </Button>
            {newMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setNewMenuOpen(false)} />
                <div className="absolute left-0 top-10 z-40 bg-white border rounded-2xl shadow-xl p-1.5 w-56 space-y-0.5">
                  {FOLDERS.map((f) => (
                    <button
                      key={f.type}
                      onClick={() => handleCreateTest(f.type)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-50 flex items-center gap-2.5 text-[10.5px] font-bold text-slate-700"
                    >
                      <f.icon size={13} className="text-indigo-600" />
                      {f.type === "Database" ? "DB" : f.type} Test Template
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Split Run button with execution-target dropdown (Section 1c) */}
          <div className="relative flex">
            <Button
              onClick={() => handleRun(false)}
              disabled={running || !selectedScript}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-l-xl rounded-r-none h-9 pl-4 pr-3 text-xs font-black shadow-xs flex items-center gap-1.5 border-r border-emerald-500"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />} Run
              <span className="text-[9px] font-bold opacity-80 normal-case flex items-center gap-1">
                {selectedTarget && selectedTarget.type !== "local" ? <Server size={10} /> : <Monitor size={10} />}
                {targetLabel}
              </span>
            </Button>
            <Button
              onClick={() => setRunMenuOpen((o) => !o)}
              disabled={running || !selectedScript}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-r-xl rounded-l-none h-9 px-2 shadow-xs"
            >
              <ChevronDown size={13} />
            </Button>
            {runMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setRunMenuOpen(false)} />
                <div className="absolute left-0 top-11 z-40 bg-white border rounded-2xl shadow-xl p-1.5 w-60 space-y-0.5">
                  <button
                    onClick={() => { setSelectedTargetId("local"); handleRun(false, "local") }}
                    className={`w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 flex items-center gap-2 text-[10.5px] font-bold ${selectedTargetId === "local" ? "text-indigo-700 bg-indigo-50/50" : "text-slate-700"}`}
                  >
                    <Monitor size={13} className="text-indigo-600" /> Run Locally
                    {selectedTargetId === "local" && <CheckCircle2 size={12} className="ml-auto text-indigo-600" />}
                  </button>
                  {targets.filter((t) => t.type !== "local").map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTargetId(t.id); handleRun(false, t.id) }}
                      className={`w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 flex items-center gap-2 text-[10.5px] font-bold ${selectedTargetId === t.id ? "text-indigo-700 bg-indigo-50/50" : "text-slate-700"}`}
                    >
                      <Server size={13} className="text-indigo-600" />
                      <span className="truncate">Run on {t.name}</span>
                      {selectedTargetId === t.id && <CheckCircle2 size={12} className="ml-auto text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    onClick={() => { setRunMenuOpen(false); setTargetsModalOpen(true) }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-2 text-[10.5px] font-bold text-slate-600"
                  >
                    <Settings size={13} className="text-slate-500" /> Manage Targets…
                  </button>
                </div>
              </>
            )}
          </div>
          <Button
            onClick={() => handleRun(true)}
            disabled={running || !selectedScript}
            variant="outline"
            className="rounded-xl h-9 px-3.5 text-xs font-black border-slate-200 text-slate-600 bg-white flex items-center gap-1.5"
          >
            <Bug size={12} /> Debug
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedScript || saving || !dirty}
            variant="outline"
            className="rounded-xl h-9 px-3.5 text-xs font-black border-slate-200 text-slate-600 bg-white flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save{dirty ? " *" : ""}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={!selectedScript || running}
            variant="outline"
            className="rounded-xl h-9 px-3 text-xs font-black border-rose-100 text-rose-500 bg-white hover:bg-rose-50 flex items-center gap-1.5"
          >
            <Trash2 size={12} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocatorOpen(true)}
            variant="outline"
            className="rounded-xl h-9 px-3.5 text-xs font-black border-indigo-100 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 flex items-center gap-1.5"
          >
            <Crosshair size={12} /> Smart Locator
          </Button>
          <select
            value={selectedBrowser}
            onChange={(e) => setSelectedBrowser(e.target.value)}
            className="flex h-9 rounded-xl border px-2.5 py-1 text-[10px] bg-slate-50 font-bold cursor-pointer"
          >
            {BROWSERS.map((b) => (
              <option key={b} value={b}>
                {b === "Headless" ? "Headless Chrome" : `${b} Browser`}
              </option>
            ))}
          </select>

          {/* Animated-GIF recording toggle (SHAFT createAnimatedGif) */}
          <div className="relative">
            <button
              onClick={() => setGifMenuOpen((v) => !v)}
              disabled={gifSaving}
              title="Animated GIF recording"
              className={`h-9 rounded-xl border px-2.5 text-[10px] font-black flex items-center gap-1.5 ${
                gifRecording
                  ? "border-indigo-200 text-indigo-700 bg-indigo-50"
                  : "border-slate-200 text-slate-500 bg-white"
              }`}
            >
              {gifSaving ? <Loader2 size={12} className="animate-spin" /> : <Film size={12} />} GIF
              <span
                className={`ml-0.5 h-3.5 w-6 rounded-full relative transition-colors ${
                  gifRecording ? "bg-indigo-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
                    gifRecording ? "left-3" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {gifMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setGifMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-20 w-64 bg-white border rounded-2xl shadow-2xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-700 flex items-center gap-1.5">
                      <Film size={13} className="text-indigo-600" /> GIF Recording
                    </span>
                    <button
                      onClick={() => persistGifSettings(!gifRecording, gifFrameDelay)}
                      disabled={gifSaving}
                      className={`h-5 w-9 rounded-full relative transition-colors ${
                        gifRecording ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          gifRecording ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                    Writes <span className="font-mono text-slate-600">createAnimatedGif</span> to SHAFT
                    custom.properties. The next run stitches step screenshots into an animated GIF in the Evidence Vault.
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase font-black text-slate-400">Frame delay</span>
                      <span className="text-[9px] font-mono font-black text-indigo-700">{gifFrameDelay}ms</span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={2000}
                      step={100}
                      value={gifFrameDelay}
                      onChange={(e) => setGifFrameDelay(Number(e.target.value))}
                      onMouseUp={() => persistGifSettings(gifRecording, gifFrameDelay)}
                      disabled={!gifRecording || gifSaving}
                      className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 font-bold">
                      <span>Faster</span>
                      <span>Slower</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* THREE-PANEL LAYOUT: library | editor | results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT: TEST LIBRARY */}
        <div className="lg:col-span-3 bg-white border rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-3 border-b space-y-2.5">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Test Library</span>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tests or tags..."
                className="w-full h-8 rounded-xl border pl-8 pr-2 text-[10px] bg-slate-50 font-semibold"
              />
            </div>
          </div>

          <div className="p-2 space-y-1 max-h-[560px] overflow-y-auto">
            {loadingScripts ? (
              <div className="py-10 text-center">
                <Loader2 size={18} className="animate-spin text-indigo-600 mx-auto" />
              </div>
            ) : (
              FOLDERS.map((folder) => {
                const items = filteredScripts.filter((s) => s.type === folder.type)
                const isOpen = openFolders[folder.type]
                return (
                  <div key={folder.type}>
                    <button
                      onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.type]: !prev[folder.type] }))}
                      className="w-full flex items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-slate-50 text-slate-600"
                    >
                      {isOpen ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />}
                      {isOpen ? <FolderOpen size={13} className="text-indigo-400" /> : <Folder size={13} className="text-slate-300" />}
                      <span className="text-[10px] font-black uppercase tracking-wide">{folder.label}</span>
                      <span className="ml-auto text-[8.5px] font-bold bg-slate-100 text-slate-400 rounded-full px-1.5 py-0.5">{items.length}</span>
                    </button>

                    {isOpen && (
                      <div className="ml-4 border-l pl-2 space-y-1 py-1">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => selectScript(s)}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                              selectedScript?.id === s.id
                                ? "bg-indigo-50/60 border-indigo-200 text-indigo-900"
                                : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-100 text-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <StatusDot status={s.lastExecution?.status} />
                              <span className="font-extrabold text-[10px] text-slate-900 truncate">{s.name}</span>
                            </div>
                            {s.tags.length > 0 && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {s.tags.slice(0, 3).map((t) => (
                                  <span key={t} className="text-[7.5px] uppercase font-black bg-slate-100 text-slate-400 border rounded-full px-1.5 py-px">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        ))}
                        {items.length === 0 && (
                          <p className="text-slate-300 italic text-[9px] px-2 py-2">No {folder.label.toLowerCase()} found.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* CENTER: MONACO CODE EDITOR */}
        <div className="lg:col-span-6 bg-white border rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Terminal size={13} className="text-indigo-600 shrink-0" />
              <input
                value={scriptName}
                onChange={(e) => {
                  setScriptName(e.target.value)
                  setDirty(true)
                  validateCode(editorCode, editorRef.current, monacoRef.current, e.target.value)
                }}
                disabled={!selectedScript}
                className="font-black text-[11px] text-slate-900 bg-transparent border-0 focus:outline-hidden focus:ring-0 min-w-0 flex-1"
                placeholder="Select a test from the library"
              />
            </div>
            <span className="text-[8.5px] uppercase font-black text-slate-300 tracking-widest shrink-0">
              {selectedScript ? `${selectedScript.type} · Java · SHAFT` : "Studio Editor"}
            </span>
          </div>
          <div className="bg-slate-900 min-h-[520px]">
            <Editor
              height="520px"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={editorCode}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 11.5,
                lineHeight: 19,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 4,
                suggestOnTriggerCharacters: true,
                quickSuggestions: true
              }}
            />
          </div>
        </div>

        {/* RIGHT: RUN RESULTS */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border rounded-2xl p-3.5 shadow-2xs space-y-3.5">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block border-b pb-2">Run Results</span>

            {/* Status + duration */}
            {running ? (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Loader2 size={11} className="animate-spin" /> Running on {selectedBrowser}
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500">
                  {selectedTarget && selectedTarget.type !== "local" ? <Server size={10} /> : <Monitor size={10} />} Target: {targetLabel}
                </span>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px] font-bold">
                  <Clock size={11} /> {formatDuration(elapsed)} elapsed
                </div>
              </div>
            ) : lastExecution ? (
              <div className="space-y-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${
                    lastExecution.status === "Passed"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : lastExecution.status === "Running"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                        : "bg-rose-50 text-rose-700 border-rose-100"
                  }`}
                >
                  {lastExecution.status === "Passed" ? (
                    <CheckCircle2 size={11} />
                  ) : lastExecution.status === "Running" ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <XCircle size={11} />
                  )}
                  {lastExecution.status}
                </span>
                <div className="grid grid-cols-2 gap-2 text-[9.5px] font-bold text-slate-500">
                  <div className="bg-slate-50 border rounded-xl p-2">
                    <span className="text-slate-300 uppercase text-[8px] block">Duration</span>
                    <span className="font-mono text-slate-800">{formatDuration(lastExecution.duration)}</span>
                  </div>
                  <div className="bg-slate-50 border rounded-xl p-2">
                    <span className="text-slate-300 uppercase text-[8px] block">Browser</span>
                    <span className="font-mono text-slate-800">{lastExecution.browser || "—"}</span>
                  </div>
                  <div className="bg-slate-50 border rounded-xl p-2 col-span-2">
                    <span className="text-slate-300 uppercase text-[8px] block">Target</span>
                    <span className="font-mono text-slate-800 flex items-center gap-1">
                      {lastExecution.executionTarget ? <Server size={10} /> : <Monitor size={10} />} {lastExecution.executionTarget || "Local"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 italic text-[10px] py-3 text-center">
                No execution yet. Press <span className="font-black not-italic">Run</span> to execute this script.
              </p>
            )}

            {/* Screenshot thumbnail */}
            {lastExecution?.screenshotPath && (
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Camera size={10} /> Last Screenshot
                </span>
                <button
                  onClick={() => setScreenshotEnlarged(true)}
                  className="block w-full border rounded-xl overflow-hidden hover:ring-2 hover:ring-indigo-200 transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/hub/executions/${lastExecution.id}/screenshot`}
                    alt="Execution screenshot"
                    className="w-full aspect-video object-cover object-top"
                  />
                </button>
              </div>
            )}

            {/* Allure */}
            <Button
              onClick={() => lastExecution?.allureLink && window.open(lastExecution.allureLink, "_blank")}
              disabled={!lastExecution?.allureLink}
              variant="outline"
              className="w-full rounded-xl h-9 text-[10px] font-black border-slate-200 text-slate-600 bg-white flex items-center gap-1.5 justify-center"
            >
              <FileText size={12} /> View Allure Report
            </Button>
          </div>

          {/* Console output */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-md overflow-hidden">
            <button
              onClick={() => setConsoleOpen(!consoleOpen)}
              className="w-full flex justify-between items-center p-3 text-slate-300 hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-[9.5px] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Terminal size={12} /> Console Output
              </span>
              {consoleOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {consoleOpen && (
              <pre ref={consoleContainerRef} className="font-mono text-[9.5px] leading-relaxed text-slate-200 overflow-auto bg-slate-950 p-3 max-h-[280px] whitespace-pre-wrap select-text border-t border-slate-800">
                {liveLogs || "Console is idle. Run a script to stream live Maven output here."}
              </pre>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* TAB: TEST DATA MANAGER (Section 1a) */}
      {studioTab === "Data" && (
        <TestDataManager scripts={scripts.map((s) => ({ id: s.id, name: s.name, type: s.type }))} />
      )}

      {/* TAB: ACCESSIBILITY AUDIT (Section 1b) */}
      {studioTab === "Accessibility" && (
        <AccessibilityPanel
          script={selectedScript ? { id: selectedScript.id, name: selectedScript.name, accessibilityEnabled: selectedScript.accessibilityEnabled } : null}
          onToggle={handleAccessibilityToggle}
          executionId={lastExecution?.id}
        />
      )}

      {/* SCREENSHOT LIGHTBOX */}
      {screenshotEnlarged && lastExecution && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-6"
          onClick={() => setScreenshotEnlarged(false)}
        >
          <div className="max-w-4xl w-full space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center text-white">
              <span className="text-xs font-black">Execution Screenshot — {scriptName}</span>
              <button onClick={() => setScreenshotEnlarged(false)} className="p-1 hover:bg-white/10 rounded-lg">
                <X size={16} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/hub/executions/${lastExecution.id}/screenshot`}
              alt="Execution screenshot enlarged"
              className="w-full rounded-2xl border-4 border-white/10"
            />
          </div>
        </div>
      )}

      {/* SMART LOCATOR MODAL */}
      {locatorOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 space-y-4 text-left">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Crosshair size={15} className="text-indigo-600" /> Smart Locator Helper
              </h3>
              <button onClick={() => setLocatorOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={locatorUrl}
                onChange={(e) => setLocatorUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLocatorScan()}
                placeholder="https://example.com/login"
                className="flex-1 h-9 rounded-xl border px-3 text-xs bg-slate-50 font-semibold"
              />
              <Button
                onClick={handleLocatorScan}
                disabled={locatorLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-9 px-4 text-xs font-black flex items-center gap-1.5"
              >
                {locatorLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Scan Page
              </Button>
            </div>

            {locatorError && (
              <p className="text-rose-600 text-[10px] font-bold bg-rose-50 border border-rose-100 rounded-xl p-3">{locatorError}</p>
            )}

            {locatorLoading && (
              <div className="py-16 text-center space-y-2">
                <Loader2 size={22} className="animate-spin text-indigo-600 mx-auto" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loading page in headless browser...</p>
              </div>
            )}

            {locatorSnapshot && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Clickable page snapshot */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Click any highlighted element</span>
                  <div className="relative border rounded-xl overflow-hidden bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={locatorSnapshot.screenshot} alt="Page snapshot" className="w-full block" />
                    {locatorSnapshot.elements.map((el, i) => (
                      <button
                        key={i}
                        onClick={() => setPickedElement(el)}
                        title={el.text}
                        style={{
                          left: `${(el.box.x / locatorSnapshot.viewport.width) * 100}%`,
                          top: `${(el.box.y / locatorSnapshot.viewport.height) * 100}%`,
                          width: `${(el.box.width / locatorSnapshot.viewport.width) * 100}%`,
                          height: `${(el.box.height / locatorSnapshot.viewport.height) * 100}%`
                        }}
                        className={`absolute border-2 rounded transition-colors ${
                          pickedElement === el
                            ? "border-indigo-500 bg-indigo-400/25"
                            : "border-transparent hover:border-indigo-400 hover:bg-indigo-300/20"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Picked element details */}
                <div className="space-y-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Generated locator code</span>
                  {pickedElement ? (
                    <div className="space-y-3">
                      <div className="bg-slate-50 border rounded-xl p-3 space-y-1">
                        <span className="text-[8.5px] uppercase font-black text-slate-400 block">
                          &lt;{pickedElement.tag}&gt; {pickedElement.text}
                        </span>
                        <code className="font-mono text-[10px] text-indigo-800 block select-all break-all">{pickedElement.locatorJava}</code>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        <Button
                          onClick={() => insertCodeAtCursor(`driver.element().click(${pickedElement.locatorJava});`)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-9 text-[10px] font-black justify-start px-3"
                        >
                          Insert click() into editor
                        </Button>
                        <Button
                          onClick={() => insertCodeAtCursor(`driver.element().type(${pickedElement.locatorJava}, "value");`)}
                          className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl h-9 text-[10px] font-black justify-start px-3"
                        >
                          Insert type() into editor
                        </Button>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(pickedElement.locatorJava)
                          }}
                          variant="outline"
                          className="rounded-xl h-9 text-[10px] font-black border-slate-200 text-slate-600 bg-white justify-start px-3 flex items-center gap-1.5"
                        >
                          <Copy size={11} /> Copy locator only
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic text-[10px] bg-slate-50 border rounded-xl p-4 text-center">
                      {locatorSnapshot.elements.length} interactive elements detected. Click one on the snapshot to generate its SHAFT locator.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM TOAST NOTIFICATION CONTAINER */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-lg animate-slide-up text-xs font-black uppercase ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
            : toast.type === "error"
            ? "bg-rose-50 border-rose-250 text-rose-800"
            : "bg-indigo-50 border-indigo-250 text-indigo-800"
        }`}>
          <span>{toast.text}</span>
        </div>
      )}

      {/* CUSTOM CONFIRM DIALOG CONTAINER */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4 text-slate-800 animate-in zoom-in duration-150">
            <div className="flex items-center gap-2 text-rose-600">
              <Shield size={18} />
              <h3 className="text-sm font-black uppercase tracking-wider">Confirm Delete Request</h3>
            </div>
            <p className="text-xs text-slate-500 font-bold leading-relaxed">{confirmTitle}</p>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-xl bg-white border-slate-200 text-slate-650">Cancel Action</Button>
              <Button onClick={() => { confirmCallback?.(); setConfirmOpen(false) }} className="bg-rose-600 hover:bg-rose-700 text-white flex-1 rounded-xl font-black">Confirm Execution</Button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CREATE TEST SCRIPT DIALOG CONTAINER */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-sm space-y-4 text-slate-800 animate-in zoom-in duration-150">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Create new {createScriptType} test</h3>
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-450 block uppercase">Java Class Name</label>
              <input
                value={newScriptName}
                onChange={(e) => setNewScriptName(e.target.value)}
                className="flex h-9.5 w-full rounded-xl border px-3 text-xs bg-slate-50"
                placeholder={`e.g. New${createScriptType === "Database" ? "Db" : createScriptType}Test`}
              />
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setCreateModalOpen(false)} className="flex-1 rounded-xl bg-white border-slate-200 text-slate-650">Cancel</Button>
              <Button onClick={submitCreateTest} className="bg-indigo-650 text-white hover:bg-indigo-700 flex-1 rounded-xl font-black">Create Script</Button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE EXECUTION TARGETS MODAL (Section 1c) */}
      <ExecutionTargetsModal
        open={targetsModalOpen}
        onClose={() => setTargetsModalOpen(false)}
        onChange={(list) => {
          setTargets(list)
          // if the selected target was removed, fall back to Local
          if (selectedTargetId !== "local" && !list.some((t) => t.id === selectedTargetId)) {
            setSelectedTargetId("local")
          }
        }}
      />

    </div>
  )
}
