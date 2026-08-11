"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  FileText,
  FileType2,
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  History,
  Link2,
  ScrollText,
  Eye,
  Pencil,
  RotateCcw,
  X,
  Plus,
} from "lucide-react"
import { BrdEditor } from "@/components/brd/brd-editor"
import { BrdCommentsPanel } from "@/components/brd/brd-comments"
import { LinkedEntities } from "@/components/entity-links/linked-entities"

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  Final: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Archived: "bg-amber-50 text-amber-700 border-amber-200",
}
const STATUSES = ["Draft", "Reviewed", "Final", "Archived"]

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(d).toLocaleDateString()
}
function fmtBytes(n: number) {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

type Tab = "preview" | "edit" | "versions" | "links" | "audit"

export default function BrdDetailPage() {
  const params = useParams<{ id: string; brdId: string }>()
  const { id: projectId, brdId } = params
  const router = useRouter()

  const [brd, setBrd] = useState<any>(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("preview")
  const [currentUserId, setCurrentUserId] = useState("")

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCurrentUserId(d.user.id))
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/brds/${brdId}`)
    if (res.ok) {
      const data = await res.json()
      setBrd(data.brd)
      setCanManage(data.canManage)
    } else if (res.status === 404) {
      toast.error("BRD not found")
      router.push(`/projects/${projectId}/brds`)
    }
    setLoading(false)
  }, [brdId, projectId, router])

  useEffect(() => {
    load()
  }, [load])

  async function changeStatus(status: string) {
    const res = await fetch(`/api/brds/${brdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setBrd((b: any) => ({ ...b, status }))
      toast.success(`Status: ${status}`)
    } else {
      toast.error((await res.json()).error || "Failed")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${brd.name}"? Recoverable for 30 days.`)) return
    const res = await fetch(`/api/brds/${brdId}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("BRD deleted")
      router.push(`/projects/${projectId}/brds`)
    } else toast.error("Failed to delete")
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      </div>
    )
  }
  if (!brd) return null

  const isWord = brd.fileType === "docx"
  const isFinal = brd.status === "Final"
  const editable = canManage && isWord && !isFinal

  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: "preview", label: "Preview", icon: Eye, show: true },
    { id: "edit", label: "Edit", icon: Pencil, show: editable },
    { id: "versions", label: `Versions (${brd.versionCount})`, icon: History, show: true },
    { id: "links", label: `Links (${brd.linkCount})`, icon: Link2, show: true },
    { id: "audit", label: "Audit Log", icon: ScrollText, show: true },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <button
        onClick={() => router.push(`/projects/${projectId}/brds`)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> BRD Hub
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex items-start gap-3">
          {isWord ? <FileText className="mt-0.5 h-7 w-7 text-blue-500" /> : <FileType2 className="mt-0.5 h-7 w-7 text-rose-500" />}
          <div>
            <h1 className="text-xl font-bold">{brd.name}</h1>
            <p className="text-xs text-muted-foreground">
              {brd.filename} · uploaded by {brd.uploaderName} · v{brd.versionCount}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <select
              value={brd.status}
              onChange={(e) => changeStatus(e.target.value)}
              className={`h-9 cursor-pointer rounded-lg border px-2.5 text-sm font-semibold ${STATUS_STYLES[brd.status]}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[brd.status]}`}>{brd.status}</span>
          )}
          {brd.currentFileUrl && (
            <a
              href={brd.currentFileUrl}
              download={brd.filename}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          )}
          {canManage && (
            <button
              onClick={handleDelete}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isFinal && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          This BRD is <b>Final</b> and locked for editing.{canManage ? " Change status back to Draft to edit." : ""}
        </div>
      )}
      {!canManage && (
        <div className="mt-3 rounded-lg border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          View only — you don&apos;t have permission to edit BRDs.
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b">
        {tabs.filter((t) => t.show).map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="py-5">
        {tab === "preview" && <PreviewTab brd={brd} projectId={projectId} currentUserId={currentUserId} onEdit={editable ? () => setTab("edit") : undefined} />}
        {tab === "edit" && editable && <BrdEditor brdId={brd.id} onSaved={() => { load(); setTab("versions") }} />}
        {tab === "versions" && <VersionsTab brd={brd} canManage={canManage && !isFinal} onChanged={load} />}
        {tab === "links" && <LinksTab brd={brd} projectId={projectId} canManage={canManage} onChanged={load} />}
        {tab === "audit" && <AuditTab brd={brd} />}
      </div>
    </div>
  )
}

/* ─── Preview (document + comments sidebar) ─── */
function PreviewTab({ brd, projectId, currentUserId, onEdit }: { brd: any; projectId: string; currentUserId: string; onEdit?: () => void }) {
  const [wordHtml, setWordHtml] = useState<string | null>(null)
  const [loadingHtml, setLoadingHtml] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const isWord = brd.fileType === "docx"

  useEffect(() => {
    if (!isWord) return
    setLoadingHtml(true)
    fetch(`/api/brds/${brd.id}/preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWordHtml(d?.html ?? "<p><em>Could not render preview.</em></p>"))
      .finally(() => setLoadingHtml(false))
  }, [brd.id, isWord])

  // Read the current text selection inside the rendered document (for quoting
  // a section when commenting). PDF text lives in a cross-origin iframe and
  // can't be read, so PDF comments simply have no quote.
  const getSelectedText = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return ""
    const anchor = sel.anchorNode
    if (docRef.current && anchor && docRef.current.contains(anchor)) return sel.toString()
    return ""
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-600">
            {isWord ? "Word document — select any text, then add a comment." : "PDF document — comment in the panel; open or download to read."}
          </span>
          <div className="flex items-center gap-2">
            {!isWord && (
              <a href={brd.currentFileUrl} download={brd.filename} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            )}
            {onEdit && (
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                <Pencil className="h-3.5 w-3.5" /> Edit document
              </button>
            )}
          </div>
        </div>
        {!isWord ? (
          <iframe src={brd.currentFileUrl} title={brd.name} className="h-[72vh] w-full rounded-lg border" />
        ) : loadingHtml ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
        ) : (
          <div ref={docRef} className="brd-doc max-w-none rounded-lg border bg-white p-8" dangerouslySetInnerHTML={{ __html: wordHtml || "" }} />
        )}
      </div>
      <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-9rem)]">
        <BrdCommentsPanel brdId={brd.id} projectId={projectId} currentUserId={currentUserId} getSelectedText={getSelectedText} />
      </div>
    </div>
  )
}

/* ─── Versions ─── */
function VersionsTab({ brd, canManage, onChanged }: { brd: any; canManage: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(v: any) {
    if (!confirm(`Restore v${v.versionNumber} as the current version? A new version will be created with this content.`)) return
    setBusy(v.id)
    try {
      const res = await fetch(`/api/brds/${brd.id}/versions/${v.id}/restore`, { method: "POST" })
      if (res.ok) {
        toast.success(`Restored v${v.versionNumber}`)
        onChanged()
      } else toast.error((await res.json()).error || "Failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {brd.versions.map((v: any) => {
        const isCurrent = v.id === brd.currentVersionId
        return (
          <li key={v.id} className="relative">
            <span className={`absolute -left-[1.72rem] top-1.5 h-3 w-3 rounded-full border-2 border-background ${isCurrent ? "bg-indigo-600" : "bg-slate-300"}`} />
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">v{v.versionNumber}</span>
                  {isCurrent && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Current</span>}
                </div>
                <span className="text-[11px] text-muted-foreground">{timeAgo(v.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{v.changeSummary || "—"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{v.editorName} · {fmtBytes(v.fileSize)}</p>
              <div className="mt-2 flex gap-2">
                <a href={v.fileUrl} download className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-muted">
                  <Download className="h-3 w-3" /> Download
                </a>
                {canManage && !isCurrent && (
                  <button onClick={() => restore(v)} disabled={busy === v.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-60">
                    {busy === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Restore
                  </button>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ─── Links ─── */
function LinksTab({ brd, projectId, canManage, onChanged }: { brd: any; projectId: string; canManage: boolean; onChanged: () => void }) {
  const [epics, setEpics] = useState<any[]>([])
  const [stories, setStories] = useState<any[]>([])
  const [q, setQ] = useState("")

  useEffect(() => {
    if (!canManage) return
    fetch(`/api/projects/${projectId}/scrum/epics`).then((r) => { if (r.ok) r.json().then((d) => setEpics(d.epics || [])) })
    fetch(`/api/projects/${projectId}/scrum/tasks`).then((r) => { if (r.ok) r.json().then((d) => setStories(d.tasks || [])) })
  }, [projectId, canManage])

  const linkedEpicIds = new Set(brd.links.filter((l: any) => l.epicId).map((l: any) => l.epicId))
  const linkedTaskIds = new Set(brd.links.filter((l: any) => l.taskId).map((l: any) => l.taskId))

  async function addLink(payload: any) {
    const res = await fetch(`/api/brds/${brd.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      toast.success("Linked")
      onChanged()
    } else toast.error((await res.json()).error || "Failed")
  }
  async function removeLink(linkId: string) {
    const res = await fetch(`/api/brds/${brd.id}/links/${linkId}`, { method: "DELETE" })
    if (res.ok) { toast.success("Unlinked"); onChanged() } else toast.error("Failed")
  }

  const ql = q.trim().toLowerCase()
  const epicMatches = ql ? epics.filter((e) => !linkedEpicIds.has(e.id) && e.title.toLowerCase().includes(ql)).slice(0, 5) : []
  const storyMatches = ql ? stories.filter((s) => !linkedTaskIds.has(s.id) && (`${s.key} ${s.title}`.toLowerCase().includes(ql))).slice(0, 5) : []

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Add */}
      {canManage && (
        <div>
          <h3 className="mb-2 text-sm font-bold">Link Epics & Stories</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search epics or stories by name/key…"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {ql && (
            <div className="mt-2 divide-y rounded-lg border">
              {epicMatches.length === 0 && storyMatches.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
              )}
              {epicMatches.map((e) => (
                <button key={e.id} onClick={() => addLink({ linkType: "epic", epicId: e.id })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">EPIC</span>
                  <span className="truncate">{e.title}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
              {storyMatches.map((s) => (
                <button key={s.id} onClick={() => addLink({ linkType: "story", taskId: s.id })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">{s.key}</span>
                  <span className="truncate">{s.title}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Linked */}
      <div className={canManage ? "" : "md:col-span-2"}>
        <h3 className="mb-2 text-sm font-bold">Linked items ({brd.links.length})</h3>
        {brd.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing linked yet.</p>
        ) : (
          <div className="space-y-1.5">
            {brd.links.map((l: any) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${l.linkType === "epic" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                  {l.linkType === "epic" ? "EPIC" : l.task?.key || "STORY"}
                </span>
                <span className={`truncate ${l.deleted ? "italic text-muted-foreground" : ""}`}>
                  {l.deleted ? `Deleted item · ${l.label}` : l.label}
                </span>
                {canManage && (
                  <button onClick={() => removeLink(l.id)} className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Unlink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Generic links to anything else in the project (tasks, bugs, test
            cases…). The epic/story links above stay on their own BrdLink model. */}
        <div className="mt-5 border-t pt-4">
          <LinkedEntities
            projectId={brd.projectId}
            entityId={brd.id}
            entityType="BRD_DOCUMENT"
            readOnly={!canManage}
          />
        </div>
      </div>
    </div>
  )
}

/* ─── Audit ─── */
const AUDIT_LABEL: Record<string, string> = {
  created: "Created",
  version_saved: "Version saved",
  version_restored: "Version restored",
  link_added: "Link added",
  link_removed: "Link removed",
  annotation_added: "Annotation added",
  status_changed: "Status changed",
  renamed: "Renamed",
  deleted: "Deleted",
}
function AuditTab({ brd }: { brd: any }) {
  return (
    <div className="space-y-1.5">
      {brd.auditLogs.map((a: any) => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{AUDIT_LABEL[a.action] || a.action}</span>
          <div className="min-w-0 flex-1">
            <p className="text-slate-700">{a.detail}</p>
            <p className="text-[11px] text-muted-foreground">{a.actorName || "System"} · {new Date(a.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
