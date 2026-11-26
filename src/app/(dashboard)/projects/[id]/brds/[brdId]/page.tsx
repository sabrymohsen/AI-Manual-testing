"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  FileText,
  FileType2,
  Download,
  Trash2,
  Loader2,
  History,
  Link2,
  ScrollText,
  Eye,
  Pencil,
  RotateCcw,
  X,
  Plus,
  Upload,
  ListChecks,
  ShieldQuestion,
  UserCheck,
  Users,
  AlertTriangle,
} from "@/components/ui/icons"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { BrdRequirements } from "@/components/brd/brd-requirements"
import { BrdQuestions } from "@/components/brd/brd-questions"
import { BrdTestUsers } from "@/components/brd/brd-test-users"
import { BrdReviews } from "@/components/brd/brd-reviews"
import { BrdCompare } from "@/components/brd/brd-compare"
import { BrdEditor } from "@/components/brd/brd-editor"
import { BrdCommentsPanel } from "@/components/brd/brd-comments"
import { LinkedEntities } from "@/components/entity-links/linked-entities"

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
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

type Tab = "preview" | "edit" | "coverage" | "questions" | "users" | "versions" | "reviews" | "links" | "audit"
const TABS: Tab[] = ["preview", "edit", "coverage", "questions", "users", "versions", "reviews", "links", "audit"]

export default function BrdDetailPage() {
  const params = useParams<{ id: string; brdId: string }>()
  const { id: projectId, brdId } = params
  const router = useRouter()
  const searchParams = useSearchParams()

  const [brd, setBrd] = useState<any>(null)
  const [canManage, setCanManage] = useState(false)
  const [canTest, setCanTest] = useState(false)
  const [loading, setLoading] = useState(true)
  // ?tab= lets notifications deep-link ("2 tests need review" → coverage).
  const [tab, setTabState] = useState<Tab>(() => {
    const t = searchParams.get("tab") as Tab | null
    return t && TABS.includes(t) ? t : "preview"
  })
  const setTab = (t: Tab) => {
    setTabState(t)
    const p = new URLSearchParams(searchParams.toString())
    t === "preview" ? p.delete("tab") : p.set("tab", t)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  const [pendingDelete, setPendingDelete] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
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
      setCanTest(!!data.canTest)
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
    const res = await fetch(`/api/brds/${brdId}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("BRD deleted")
      router.push(`/projects/${projectId}/brds`)
    } else toast.error("Failed to delete")
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
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
    { id: "coverage", label: "Requirements & coverage", icon: ListChecks, show: true },
    { id: "questions", label: "Questions & readiness", icon: ShieldQuestion, show: true },
    { id: "users", label: "Test users", icon: Users, show: true },
    { id: "versions", label: `Versions (${brd.versionCount})`, icon: History, show: true },
    { id: "reviews", label: "Reviews", icon: UserCheck, show: true },
    { id: "links", label: `Links (${brd.linkCount})`, icon: Link2, show: true },
    { id: "audit", label: "Audit Log", icon: ScrollText, show: true },
  ]
  const currentVersion = brd.versions.find((v: any) => v.id === brd.currentVersionId) ?? brd.versions[0]

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}

      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex items-start gap-3">
          {isWord ? <FileText className="mt-0.5 h-7 w-7 text-blue-500" /> : <FileType2 className="mt-0.5 h-7 w-7 text-rose-500" />}
          <div>
            <h1 className="text-xl font-semibold">{brd.name}</h1>
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
              className={`h-9 cursor-pointer rounded-lg border px-3 text-sm font-semibold ${STATUS_STYLES[brd.status]}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[brd.status]}`}>{brd.status}</span>
          )}
          {canManage && !isFinal && (
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-muted"
              title="Upload a new version (PDF or Word)"
            >
              <Upload className="h-4 w-4" /> New version
            </button>
          )}
          {brd.currentFileUrl && (
            <a
              href={brd.currentFileUrl}
              download={brd.filename}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          )}
          {canManage && (
            <button
              onClick={() => setPendingDelete(true)}
              title="Delete (recoverable from the trash for 30 days)"
              aria-label="Delete BRD"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-card px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
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
        <div className="mt-3 rounded-lg border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
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
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="py-6">
        {tab === "preview" && <PreviewTab brd={brd} projectId={projectId} currentUserId={currentUserId} onEdit={editable ? () => setTab("edit") : undefined} />}
        {tab === "edit" && editable && (
          <>
            <ImageLossWarning brdId={brd.id} onUpload={() => setUploadOpen(true)} />
            <BrdEditor brdId={brd.id} onSaved={() => { load(); setTab("versions") }} />
          </>
        )}
        {tab === "coverage" && (
          <BrdRequirements
            brdId={brd.id}
            projectId={projectId}
            canEdit={canTest}
            canManage={canManage && !isFinal}
            onBrdUpdated={load}
            onOpenQuestions={() => setTab("questions")}
            initialFilter={searchParams.get("tab") === "coverage" && searchParams.get("filter") === "review" ? "review" : undefined}
          />
        )}
        {tab === "questions" && <BrdQuestions brdId={brd.id} canEdit={canTest} />}
        {tab === "users" && <BrdTestUsers brdId={brd.id} />}
        {tab === "versions" && <VersionsTab brd={brd} canManage={canManage && !isFinal} onChanged={load} />}
        {tab === "reviews" && (
          <BrdReviews
            brdId={brd.id}
            currentVersionId={brd.currentVersionId}
            currentVersionNumber={currentVersion?.versionNumber ?? brd.versionCount}
            canRequest={canManage && !isFinal}
            onStatusChanged={load}
          />
        )}
        {tab === "links" && <LinksTab brd={brd} projectId={projectId} canManage={canManage} onChanged={load} />}
        {tab === "audit" && <AuditTab brd={brd} />}
      </div>

      <ConfirmDialog
        open={pendingDelete}
        variant="danger"
        title={`Delete "${brd.name}"?`}
        description="It moves to the trash and can be restored for 30 days. After that it is deleted permanently."
        confirmLabel="Move to trash"
        onConfirm={async () => {
          await handleDelete()
          setPendingDelete(false)
        }}
        onCancel={() => setPendingDelete(false)}
      />

      <UploadVersionDialog
        open={uploadOpen}
        brdId={brd.id}
        nextVersion={brd.versionCount + 1}
        onClose={() => setUploadOpen(false)}
        onUploaded={(flagged) => {
          setUploadOpen(false)
          load()
          if (flagged) setTab("coverage")
          else setTab("versions")
        }}
      />
    </div>
  )
}

/* ─── Upload a new version ─── */
function UploadVersionDialog({
  open,
  brdId,
  nextVersion,
  onClose,
  onUploaded,
}: {
  open: boolean
  brdId: string
  nextVersion: number
  onClose: () => void
  onUploaded: (flagged: number) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setFile(null)
      setSummary("")
    }
  }, [open])

  if (!open) return null

  async function submit() {
    if (!file || !summary.trim()) return
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Maximum file size is 25MB")
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("changeSummary", summary.trim())
      const res = await fetch(`/api/brds/${brdId}/versions/upload`, { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(
        d.flagged
          ? `Uploaded v${d.version.versionNumber} — ${d.changed} requirement(s) changed, ${d.flagged} test case(s) need review`
          : `Uploaded v${d.version.versionNumber}`
      )
      onUploaded(d.flagged ?? 0)
    } catch (e) {
      toast.error((e as Error).message || "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="upload-version-title">
      <div className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 shadow-lg">
        <h2 id="upload-version-title" className="text-base font-semibold">Upload v{nextVersion}</h2>
        <p className="text-xs text-muted-foreground">
          Replaces the current file with a new version. Earlier versions stay in the history, and requirements that changed are flagged for the testers.
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">File (PDF or Word .docx, up to 25MB)</span>
          <input
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">What changed?</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Password rules updated after security review"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 rounded-lg border px-3 text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!file || !summary.trim() || busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
        </div>
      </div>
    </div>
  )
}

/* The in-app editor can't carry images into the saved .docx — say so up front. */
function ImageLossWarning({ brdId, onUpload }: { brdId: string; onUpload: () => void }) {
  const [hasImages, setHasImages] = useState(false)
  useEffect(() => {
    fetch(`/api/brds/${brdId}/preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasImages(!!d && (d.hasImages || /<img\b/i.test(d.html || ""))))
      .catch(() => {})
  }, [brdId])
  if (!hasImages) return null
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        This document contains images. Saving from this editor keeps the text and tables but <b>drops the images</b> from the Word file.
        To keep them, edit the file in Word and{" "}
        <button onClick={onUpload} className="font-semibold underline">
          upload it as a new version
        </button>
        .
      </span>
    </div>
  )
}

/* ─── Preview (document + comments sidebar) ─── */
function PreviewTab({ brd, projectId, currentUserId, onEdit }: { brd: any; projectId: string; currentUserId: string; onEdit?: () => void }) {
  const [wordHtml, setWordHtml] = useState<string | null>(null)
  const [loadingHtml, setLoadingHtml] = useState(false)
  const [docText, setDocText] = useState<string | undefined>(undefined)
  const [pdfPage, setPdfPage] = useState<number | null>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const isWord = brd.fileType === "docx"

  // Plain text of what's on screen, so comments whose quote is gone show "Outdated".
  useEffect(() => {
    if (isWord && wordHtml != null && docRef.current) setDocText(docRef.current.innerText)
  }, [isWord, wordHtml])

  /** Scroll to the first occurrence of a quote and flash a highlight on it. */
  const jumpToQuote = (quote: string) => {
    const root = docRef.current
    if (!root) return
    const needle = quote.replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? ""
      const i = text.replace(/\s+/g, " ").toLowerCase().indexOf(needle.slice(0, Math.min(needle.length, 40)))
      if (i < 0) continue
      const range = document.createRange()
      range.setStart(node, Math.min(i, text.length))
      range.setEnd(node, Math.min(i + needle.length, text.length))
      const mark = document.createElement("mark")
      mark.className = "rounded bg-amber-200/80 dark:bg-amber-500/40"
      try {
        range.surroundContents(mark)
      } catch {
        ;(node.parentElement ?? root).scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }
      mark.scrollIntoView({ behavior: "smooth", block: "center" })
      setTimeout(() => {
        const parent = mark.parentNode
        if (!parent) return
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
        parent.removeChild(mark)
      }, 2500)
      return
    }
    toast.message("That text isn't in this version any more")
  }

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium text-muted-foreground">
            {isWord
              ? "Word document — select any text, then add a comment. Click a comment's quote to find it."
              : "PDF document — comments can point at a page; click the page chip to jump there."}
          </span>
          <div className="flex items-center gap-2">
            {!isWord && (
              <a href={brd.currentFileUrl} download={brd.filename} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            )}
            {onEdit && (
              <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90">
                <Pencil className="h-3.5 w-3.5" /> Edit document
              </button>
            )}
          </div>
        </div>
        {!isWord ? (
          <iframe
            key={pdfPage ?? 0}
            src={pdfPage ? `${brd.currentFileUrl}#page=${pdfPage}` : brd.currentFileUrl}
            title={brd.name}
            className="h-[72vh] w-full rounded-lg border"
          />
        ) : loadingHtml ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div ref={docRef} className="brd-doc max-w-none rounded-lg border bg-card p-8" dangerouslySetInnerHTML={{ __html: wordHtml || "" }} />
        )}
      </div>
      <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-9rem)]">
        <BrdCommentsPanel
          brdId={brd.id}
          projectId={projectId}
          currentUserId={currentUserId}
          getSelectedText={getSelectedText}
          docText={docText}
          onJumpToQuote={jumpToQuote}
          isPdf={!isWord}
          onJumpToPage={(n) => setPdfPage(n)}
        />
      </div>
    </div>
  )
}

/* ─── Versions ─── */
function VersionsTab({ brd, canManage, onChanged }: { brd: any; canManage: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<any>(null)

  async function restore(v: any) {
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
    <div className="space-y-6">
    <section>
      <h3 className="mb-2 text-sm font-semibold">Compare versions</h3>
      <BrdCompare brdId={brd.id} versions={brd.versions.map((v: any) => ({ id: v.id, versionNumber: v.versionNumber }))} />
    </section>
    <section>
    <h3 className="mb-2 text-sm font-semibold">History</h3>
    <ol className="relative space-y-4 border-l pl-6">
      {brd.versions.map((v: any) => {
        const isCurrent = v.id === brd.currentVersionId
        return (
          <li key={v.id} className="relative">
            <span className={`absolute -left-[1.72rem] top-1.5 h-3 w-3 rounded-full border-2 border-background ${isCurrent ? "bg-primary" : "bg-slate-300"}`} />
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{v.versionNumber}</span>
                  {isCurrent && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Current</span>}
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(v.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{v.changeSummary || "—"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{v.editorName} · {fmtBytes(v.fileSize)}</p>
              <div className="mt-2 flex gap-2">
                <a href={v.fileUrl} download className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted">
                  <Download className="h-3 w-3" /> Download
                </a>
                {canManage && !isCurrent && (
                  <button onClick={() => setPendingRestore(v)} disabled={busy === v.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                    {busy === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Restore
                  </button>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
    </section>
    <ConfirmDialog
      open={pendingRestore !== null}
      title={`Restore v${pendingRestore?.versionNumber}?`}
      description="Its content is copied forward as a new current version. Nothing is lost — the current version stays in the history."
      confirmLabel="Restore"
      onConfirm={async () => {
        if (pendingRestore) await restore(pendingRestore)
        setPendingRestore(null)
      }}
      onCancel={() => setPendingRestore(null)}
    />
    </div>
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
          <h3 className="mb-2 text-sm font-semibold">Link Epics & Stories</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search epics or stories by name/key…"
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          {ql && (
            <div className="mt-2 divide-y rounded-lg border">
              {epicMatches.length === 0 && storyMatches.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
              )}
              {epicMatches.map((e) => (
                <button key={e.id} onClick={() => addLink({ linkType: "epic", epicId: e.id })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">EPIC</span>
                  <span className="truncate">{e.title}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
              {storyMatches.map((s) => (
                <button key={s.id} onClick={() => addLink({ linkType: "story", taskId: s.id })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{s.key}</span>
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
        <h3 className="mb-2 text-sm font-semibold">Linked items ({brd.links.length})</h3>
        {brd.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing linked yet.</p>
        ) : (
          <div className="space-y-2">
            {brd.links.map((l: any) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${l.linkType === "epic" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                  {l.linkType === "epic" ? "EPIC" : l.task?.key || "STORY"}
                </span>
                <span className={`truncate ${l.deleted ? " text-muted-foreground" : ""}`}>
                  {l.deleted ? `Deleted item · ${l.label}` : l.label}
                </span>
                {canManage && (
                  <button onClick={() => removeLink(l.id)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Unlink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Generic links to anything else in the project (tasks, bugs, test
            cases…). The epic/story links above stay on their own BrdLink model. */}
        <div className="mt-6 border-t pt-4">
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
  restored: "Restored from trash",
  requirements_changed: "Requirements changed",
  requirements_extracted: "Requirements found",
  requirement_added: "Requirement added",
  requirement_status: "Requirement updated",
  requirement_deleted: "Requirement deleted",
  tests_generated: "Tests generated",
  review_requested: "Review requested",
  review_approved: "Approved",
  review_changes_requested: "Changes requested",
  comment_replied: "Reply",
}
function AuditTab({ brd }: { brd: any }) {
  return (
    <div className="space-y-2">
      {brd.auditLogs.map((a: any) => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="mt-0.5 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{AUDIT_LABEL[a.action] || a.action}</span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground">{a.detail}</p>
            <p className="text-xs text-muted-foreground">{a.actorName || "System"} · {new Date(a.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
