"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  FileText,
  FileType2,
  Upload,
  Search,
  Loader2,
  Trash2,
  Link2,
  Clock,
  Layers,
  RotateCcw,
  ListChecks,
  Archive,
} from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Brd {
  id: string
  name: string
  filename: string
  fileType: "pdf" | "docx"
  status: string
  uploaderName: string
  versionCount: number
  linkCount: number
  requirementCount?: number
  snippet?: string | null
  updatedAt: string
  deletedAt?: string
  daysLeft?: number
}

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Reviewed: "bg-blue-50 text-blue-700 border-blue-200",
  Final: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Archived: "bg-amber-50 text-amber-700 border-amber-200",
}

function FileTypeIcon({ type, className }: { type: string; className?: string }) {
  return type === "pdf" ? (
    <FileType2 className={className ?? "h-4 w-4 text-rose-500"} />
  ) : (
    <FileText className={className ?? "h-4 w-4 text-blue-500"} />
  )
}

export default function BrdHubPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()

  const [brds, setBrds] = useState<Brd[]>([])
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sort, setSort] = useState("updated")
  const [view, setView] = useState<"active" | "trash">("active")
  const [archivedCount, setArchivedCount] = useState(0)
  const [trashCount, setTrashCount] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Brd | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/membership`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCanManage(d?.globalRole === "Admin" || d?.permissions?.canManageBrds === true))
      .catch(() => {})
  }, [projectId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (search.trim()) qs.set("search", search.trim())
      if (typeFilter) qs.set("type", typeFilter)
      if (statusFilter) qs.set("status", statusFilter)
      qs.set("sort", sort)
      if (statusFilter === "Archived") qs.set("includeArchived", "true")
      if (view === "trash") qs.set("trash", "true")
      const res = await fetch(`/api/projects/${projectId}/brds?${qs}`)
      if (res.ok) {
        const d = await res.json()
        setBrds(d.brds)
        if (view === "active") {
          setArchivedCount(d.archivedCount ?? 0)
          setTrashCount(d.trashCount ?? 0)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, search, typeFilter, statusFilter, sort, view])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const okType =
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if (!okType) {
      toast.error("Only PDF and Word documents are supported")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Maximum file size is 25MB")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/projects/${projectId}/brds`, { method: "POST", body: fd })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Uploaded ${data.brd.name}`)
        router.push(`/projects/${projectId}/brds/${data.brd.id}`)
      } else {
        toast.error(data.error || "Upload failed")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(brd: Brd) {
    const res = await fetch(`/api/brds/${brd.id}`, { method: "DELETE" })
    if (res.ok) {
      setBrds((prev) => prev.filter((b) => b.id !== brd.id))
      setTrashCount((n) => n + 1)
      toast.success("Moved to trash — restorable for 30 days")
    } else {
      toast.error("Failed to delete")
    }
  }

  async function handleRestore(brd: Brd) {
    const res = await fetch(`/api/brds/${brd.id}/restore`, { method: "POST" })
    if (res.ok) {
      setBrds((prev) => prev.filter((b) => b.id !== brd.id))
      setTrashCount((n) => Math.max(0, n - 1))
      toast.success(`Restored "${brd.name}"`)
    } else {
      toast.error((await res.json().catch(() => ({}))).error || "Couldn't restore")
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">BRD Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business requirement documents for this project — upload, version, link, and review.
          </p>
        </div>
        {canManage && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload BRD
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleUpload}
            />
          </>
        )}
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names and document text…"
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="">All types</option>
          <option value="pdf">PDF</option>
          <option value="docx">Word</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Reviewed">Reviewed</option>
          <option value="Final">Final</option>
          <option value="Archived">Archived</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border bg-background px-2.5 text-sm">
          <option value="updated">Last updated</option>
          <option value="name">Name</option>
          <option value="created">Upload date</option>
        </select>
        <div className="flex rounded-lg border p-0.5 text-xs font-medium">
          <button
            onClick={() => setView("active")}
            aria-pressed={view === "active"}
            className={`rounded-md px-2.5 py-1 ${view === "active" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            Documents
          </button>
          <button
            onClick={() => setView("trash")}
            aria-pressed={view === "trash"}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${view === "trash" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <Trash2 className="h-3 w-3" /> Trash{trashCount ? ` (${trashCount})` : ""}
          </button>
        </div>
      </div>

      {view === "active" && archivedCount > 0 && statusFilter !== "Archived" && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Archive className="h-3.5 w-3.5" /> {archivedCount} archived document{archivedCount === 1 ? " is" : "s are"} hidden.
          <button onClick={() => setStatusFilter("Archived")} className="font-medium text-primary hover:underline">
            Show archived
          </button>
        </p>
      )}
      {view === "trash" && (
        <p className="mb-3 text-xs text-muted-foreground">
          Deleted documents stay here for 30 days, then they are removed permanently.
        </p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[1fr_90px_130px_90px_90px_44px] gap-2 border-b bg-muted/30 px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
          <span>Document</span>
          <span>Type</span>
          <span>Updated</span>
          <span className="text-center">Versions</span>
          <span className="text-center">Status</span>
          <span />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : brds.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Layers className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-medium text-muted-foreground">
              {view === "trash" ? "The trash is empty" : search || typeFilter || statusFilter ? "No documents match" : "No BRDs yet"}
            </p>
            {canManage && view === "active" && !search && !typeFilter && !statusFilter && (
              <p className="text-xs text-muted-foreground/70">Click “Upload BRD” to add your first document.</p>
            )}
          </div>
        ) : (
          brds.map((b) => (
            <div
              key={b.id}
              onClick={() => view === "active" && router.push(`/projects/${projectId}/brds/${b.id}`)}
              className="grid cursor-pointer grid-cols-[1fr_90px_130px_90px_90px_44px] items-center gap-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileTypeIcon type={b.fileType} className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{b.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {b.uploaderName}
                    {b.linkCount > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <Link2 className="h-3 w-3" /> {b.linkCount}
                      </span>
                    )}
                    {!!b.requirementCount && (
                      <span className="ml-2 inline-flex items-center gap-0.5" title="Tracked requirements">
                        <ListChecks className="h-3 w-3" /> {b.requirementCount}
                      </span>
                    )}
                    {view === "trash" && b.daysLeft != null && (
                      <span className="ml-2 text-amber-700 dark:text-amber-400">
                        deleted · {b.daysLeft} day{b.daysLeft === 1 ? "" : "s"} left
                      </span>
                    )}
                  </p>
                  {b.snippet && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground" dir="auto" title={b.snippet}>
                      {b.snippet}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold uppercase text-muted-foreground">{b.fileType}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(b.updatedAt).toLocaleDateString()}
              </span>
              <span className="text-center text-xs font-semibold text-muted-foreground">v{b.versionCount}</span>
              <span className="flex justify-center">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[b.status] || STATUS_STYLES.Draft}`}>
                  {b.status}
                </span>
              </span>
              <span className="flex justify-end">
                {canManage && view === "active" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingDelete(b)
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                    aria-label={`Delete ${b.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {canManage && view === "trash" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(b)
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Restore"
                    aria-label={`Restore ${b.name}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title={`Delete "${pendingDelete?.name}"?`}
        description="It moves to the trash and can be restored for 30 days. After that it is deleted permanently."
        confirmLabel="Move to trash"
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
