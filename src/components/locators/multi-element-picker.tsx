"use client"

import { useConfirm } from "@/components/ui/alert-provider"
import { toast } from "sonner"
import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers, Play, Pause, Square, Save, Trash2, Download, Plus, Bug, Loader2, X, ListPlus,
} from "@/components/ui/icons"

interface Credential { id: string; roleName: string; username: string }
interface PickedElement {
  id: string
  suggestedName: string
  actionType: string
  pageUrl: string
  tagName?: string | null
  visibleText?: string | null
  locatorType: string
  locatorValue: string
  recommendedSelector?: string | null
  cssSelector?: string | null
  xpathSelector?: string | null
  reliabilityScore: number
}
interface SessionState {
  sessionId: string
  status: "Active" | "Paused" | "Stopped"
  elements: PickedElement[]
  count: number
  pageHistory: string[]
  pendingCommand: string | null
  currentUrl: string
}
interface CollectionRow {
  id: string
  name: string
  description: string | null
  pageUrls: string[]
  elements: any[]
  createdAt: string
}
interface TestCaseRow { id: string; title: string }

const ACTION_TYPES = ["click", "input", "select", "verify"]

export function MultiElementPicker({
  projectId, credentials, defaultUrl,
}: { projectId: string; credentials: Credential[]; defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl)
  const [credentialId, setCredentialId] = useState("")
  const [starting, setStarting] = useState(false)
  const [session, setSession] = useState<SessionState | null>(null)
  // Local name/actionType overrides keyed by element id (server poll is the base list).
  const [edits, setEdits] = useState<Record<string, { name?: string; actionType?: string }>>({})
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Dialogs
  const [saveOpen, setSaveOpen] = useState(false)
  const [collName, setCollName] = useState("")
  const [collDesc, setCollDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [appendFor, setAppendFor] = useState<string | null>(null)
  const [testCases, setTestCases] = useState<TestCaseRow[]>([])
  const [appendTcId, setAppendTcId] = useState("")
  const [bugFor, setBugFor] = useState<PickedElement | null>(null)
  const [bugTitle, setBugTitle] = useState("")

  const draftKey = `picker-draft-${projectId}`

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/element-collections`)
      if (res.ok) setCollections((await res.json()).collections || [])
    } catch {}
  }, [projectId])

  useEffect(() => { loadCollections() }, [loadCollections])

  // Restore a draft list after a refresh (Lite persistence — display/export/save without a live browser).
  useEffect(() => {
    if (session) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const d = JSON.parse(raw)
        if (Array.isArray(d.elements) && d.elements.length > 0) {
          setSession({ sessionId: "", status: "Stopped", elements: d.elements, count: d.elements.length, pageHistory: d.pageHistory || [], pendingCommand: null, currentUrl: "" })
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the live list to localStorage so a refresh keeps it.
  useEffect(() => {
    if (session && session.elements.length > 0) {
      localStorage.setItem(draftKey, JSON.stringify({ elements: session.elements, pageHistory: session.pageHistory, savedAt: Date.now() }))
    }
  }, [session, draftKey])

  // Poll the live session for new elements + toolbar commands.
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!session?.sessionId || session.status === "Stopped") return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/picker/${session.sessionId}/elements`)
        if (!res.ok) return
        const state: SessionState = await res.json()
        setSession((prev) => (prev ? { ...prev, ...state } : state))
        if (state.pendingCommand) {
          handleToolbarCommand(state.pendingCommand, state)
          fetch(`/api/picker/${session.sessionId}/ack`, { method: "POST", body: "{}" }).catch(() => {})
        }
      } catch {}
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, session?.status])

  function handleToolbarCommand(cmd: string, state: SessionState) {
    if (cmd === "save" || cmd === "addToTest") setSaveOpen(true)
    else if (cmd === "export") exportJson(state.elements)
    else if (cmd === "createBug") {
      const last = state.elements[state.elements.length - 1]
      if (last) { setBugFor(last); setBugTitle(`Element issue: ${last.suggestedName}`) }
    }
  }

  async function startSession() {
    setStarting(true); setError(null)
    try {
      const res = await fetch(`/api/picker/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url, credentialId: credentialId || null }),
      })
      const data = await res.json()
      if (res.ok) { setSession(data); setEdits({}) }
      else setError(data.troubleshooting || data.error || "Failed to start picker session")
    } catch { setError("Network error starting picker session") }
    finally { setStarting(false) }
  }

  async function command(action: string, body: any = {}) {
    if (!session?.sessionId) return
    try {
      const res = await fetch(`/api/picker/${session.sessionId}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (res.ok && action !== "bug") {
        const state = await res.json()
        if (action === "stop") setSession((p) => (p ? { ...p, status: "Stopped" } : p))
        else setSession((p) => (p ? { ...p, ...state } : p))
      }
      return res
    } catch { return undefined }
  }

  const confirm = useConfirm()
  const mergedElements = (session?.elements || []).map((e) => ({
    ...e,
    suggestedName: edits[e.id]?.name ?? e.suggestedName,
    actionType: edits[e.id]?.actionType ?? e.actionType,
  }))

  function exportJson(els: PickedElement[]) {
    const blob = new Blob([JSON.stringify(els, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `elements-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function saveCollection() {
    if (!collName.trim()) { setError("Collection name is required"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/element-collections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: collName, description: collDesc, elements: mergedElements }),
      })
      if (res.ok) {
        setSaveOpen(false); setCollName(""); setCollDesc("")
        localStorage.removeItem(draftKey)
        await loadCollections()
      } else {
        setError((await res.json()).error || "Failed to save collection")
      }
    } catch { setError("Network error saving collection") }
    finally { setSaving(false) }
  }

  async function createTestCase(collectionId: string, mode: "create" | "append", testCaseId?: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/element-collections/${collectionId}/to-test-case`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, testCaseId }),
      })
      const data = await res.json()
      if (res.ok) { setAppendFor(null); toast.success(`Test case ${mode === "append" ? "updated" : "created"}: ${data.testCase?.title || ""}`) }
      else setError(data.error || "Failed to convert collection")
    } catch { setError("Network error converting collection") }
  }

  async function openAppend(collectionId: string) {
    setAppendFor(collectionId); setAppendTcId("")
    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`)
      if (res.ok) {
        const d = await res.json()
        setTestCases((d.testCases || d || []).map((t: any) => ({ id: t.id, title: t.title })))
      }
    } catch {}
  }

  async function submitBug() {
    if (!bugFor || !session?.sessionId) return
    await command("bug", { elementId: bugFor.id, title: bugTitle })
    setBugFor(null); setBugTitle("")
    toast.success("Bug created from element.")
  }

  const isLive = !!session?.sessionId && session.status !== "Stopped"

  return (
    <div className="border rounded-xl bg-card/50 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" /> Multi-Element Session
          <span className="text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 px-2 py-0.5 rounded">New</span>
        </h3>
        {session && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            session.status === "Active" ? "bg-emerald-100 text-emerald-700" :
            session.status === "Paused" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
          }`}>{session.status} · {mergedElements.length} elements</span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg p-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {!isLive && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Target URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Login (optional)</label>
            <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">No login</option>
              {credentials.map((c) => <option key={c.id} value={c.id}>{c.roleName}</option>)}
            </select>
          </div>
          <Button onClick={startSession} disabled={starting} className="bg-primary hover:bg-primary/90 text-white gap-2 h-10">
            {starting ? <BusyDot /> : <Play className="h-4 w-4 fill-current" />}
            Start Session
          </Button>
        </div>
      )}

      {isLive && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {session!.status === "Active"
            ? <Button size="sm" variant="outline" onClick={() => command("pause")} className="gap-1"><Pause className="h-3.5 w-3.5" /> Pause</Button>
            : <Button size="sm" variant="outline" onClick={() => command("resume")} className="gap-1"><Play className="h-3.5 w-3.5" /> Resume</Button>}
          <Button size="sm" variant="outline" onClick={() => command("clear")} className="gap-1"><Trash2 className="h-3.5 w-3.5" /> Clear</Button>
          <Button size="sm" variant="outline" onClick={() => command("stop")} className="gap-1 text-red-600"><Square className="h-3.5 w-3.5" /> Stop</Button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={mergedElements.length === 0} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"><Save className="h-3.5 w-3.5" /> Save Collection</Button>
          <Button size="sm" variant="outline" onClick={() => exportJson(mergedElements)} disabled={mergedElements.length === 0} className="gap-1"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>
      )}

      {isLive && (
        <p className="text-xs text-muted-foreground">
          In the opened browser: <b>click elements</b> to capture them. Hit <b>⏸ Pause</b> in the toolbar (or here) to navigate to another page, then <b>Resume</b> to keep picking. Page history: {session!.pageHistory.length} page(s).
        </p>
      )}

      {/* Live / draft element list */}
      {session && mergedElements.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-accent/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Action</div>
            <div className="col-span-4">Locator</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-1" />
          </div>
          <div className="max-h-72 overflow-auto">
            {mergedElements.map((e) => (
              <div key={e.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-t text-xs">
                <input className="col-span-4 bg-transparent border rounded px-2 py-1" value={e.suggestedName}
                  onChange={(ev) => setEdits((p) => ({ ...p, [e.id]: { ...p[e.id], name: ev.target.value } }))} />
                <select className="col-span-2 bg-background border rounded px-1 py-1" value={e.actionType}
                  onChange={(ev) => setEdits((p) => ({ ...p, [e.id]: { ...p[e.id], actionType: ev.target.value } }))}>
                  {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="col-span-4 font-mono text-xs truncate text-primary" title={`${e.locatorType}=${e.locatorValue}`}>{e.locatorType}={e.locatorValue}</div>
                <div className={`col-span-1 text-center font-semibold ${e.reliabilityScore >= 80 ? "text-emerald-600" : e.reliabilityScore >= 50 ? "text-amber-600" : "text-red-600"}`}>{e.reliabilityScore}</div>
                <div className="col-span-1 flex justify-end gap-1">
                  <button title="Create bug" onClick={() => { setBugFor(e); setBugTitle(`Element issue: ${e.suggestedName}`) }} className="text-red-500"><Bug className="h-3.5 w-3.5" /></button>
                  {isLive && <button title="Remove" onClick={() => command("remove-element", { elementId: e.id })} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Collections */}
      <div className="space-y-2 pt-2 border-t">
        <h4 className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-muted-foreground" /> Saved Collections ({collections.length})</h4>
        {collections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No collections yet. Pick elements and save a collection to reuse them in test cases.</p>
        ) : collections.map((c) => (
          <div key={c.id} className="border rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap text-xs">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.elements.length} elements · {c.pageUrls.length} page(s)</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => createTestCase(c.id, "create")}><Plus className="h-3 w-3" /> Test Case</Button>
              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => openAppend(c.id)}><ListPlus className="h-3 w-3" /> Append</Button>
              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => exportJson(c.elements)}><Download className="h-3 w-3" /></Button>
              <Button size="sm" variant="outline" className="gap-1 h-7 text-red-600" onClick={async () => { if (await confirm({ title: `Delete collection "${c.name}"?`, confirmLabel: "Delete collection", variant: "danger" })) { await fetch(`/api/projects/${projectId}/element-collections/${c.id}`, { method: "DELETE" }); loadCollections() } }}><Trash2 className="h-3 w-3" /></Button>
            </div>
            {appendFor === c.id && (
              <div className="w-full flex items-center gap-2 mt-2 pt-2 border-t">
                <select value={appendTcId} onChange={(e) => setAppendTcId(e.target.value)} className="flex-1 h-8 rounded border bg-background px-2 text-xs">
                  <option value="">Select a test case…</option>
                  {testCases.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <Button size="sm" className="h-8" disabled={!appendTcId} onClick={() => createTestCase(c.id, "append", appendTcId)}>Append</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setAppendFor(null)}>Cancel</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Save dialog */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSaveOpen(false)}>
          <div className="bg-background rounded-xl p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Save as Collection</h3>
            <Input placeholder="Collection name" value={collName} onChange={(e) => setCollName(e.target.value)} />
            <Input placeholder="Description (optional)" value={collDesc} onChange={(e) => setCollDesc(e.target.value)} />
            <p className="text-xs text-muted-foreground">{mergedElements.length} elements will be saved.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button onClick={saveCollection} disabled={saving} className="gap-1">{saving && <BusyDot />} Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bug dialog */}
      {bugFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setBugFor(null)}>
          <div className="bg-background rounded-xl p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold flex items-center gap-2"><Bug className="h-4 w-4 text-red-500" /> Create Bug from Element</h3>
            <p className="text-xs text-muted-foreground font-mono">{bugFor.locatorType}={bugFor.locatorValue}</p>
            <Input placeholder="Bug title" value={bugTitle} onChange={(e) => setBugTitle(e.target.value)} />
            <p className="text-xs text-muted-foreground">{session?.sessionId ? "Screenshot + DOM snapshot will be captured from the live browser." : "Live browser closed — a basic bug will be created without a fresh snapshot."}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setBugFor(null)}>Cancel</Button>
              <Button onClick={submitBug} disabled={!session?.sessionId} className="bg-red-600 hover:bg-red-700 text-white">Create Bug</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
