"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { FileText, FileType2, Plus, X, ExternalLink } from "@/components/ui/icons"

interface LinkedBrd {
  linkId: string
  id: string
  name: string
  fileType: string
  status: string
  updatedAt: string
}

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Reviewed: "bg-blue-50 text-blue-700",
  Final: "bg-emerald-50 text-emerald-700",
  Archived: "bg-amber-50 text-amber-700",
}

/** "Linked BRD Documents" section shown in the story (Task) detail drawer. */
export function TaskLinkedBrds({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [brds, setBrds] = useState<LinkedBrd[]>([])
  const [allBrds, setAllBrds] = useState<any[]>([])
  const [canManage, setCanManage] = useState(false)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")

  const load = useCallback(() => {
    fetch(`/api/scrum/tasks/${taskId}/brds`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBrds(d.brds))
  }, [taskId])

  useEffect(() => {
    load()
    fetch(`/api/projects/${projectId}/membership`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCanManage(d?.globalRole === "Admin" || d?.permissions?.canManageBrds === true))
  }, [load, projectId])

  useEffect(() => {
    if (adding && allBrds.length === 0) {
      fetch(`/api/projects/${projectId}/brds`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setAllBrds(d.brds))
    }
  }, [adding, allBrds.length, projectId])

  async function linkBrd(brdId: string) {
    const res = await fetch(`/api/brds/${brdId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkType: "story", taskId }),
    })
    if (res.ok) {
      toast.success("BRD linked")
      setQ("")
      setAdding(false)
      load()
    } else toast.error((await res.json()).error || "Failed to link")
  }

  async function unlink(linkId: string, brdId: string) {
    const res = await fetch(`/api/brds/${brdId}/links/${linkId}`, { method: "DELETE" })
    if (res.ok) {
      setBrds((prev) => prev.filter((b) => b.linkId !== linkId))
      toast.success("Unlinked")
    } else toast.error("Failed")
  }

  const linkedIds = new Set(brds.map((b) => b.id))
  const ql = q.trim().toLowerCase()
  const matches = ql ? allBrds.filter((b) => !linkedIds.has(b.id) && b.name.toLowerCase().includes(ql)).slice(0, 6) : []

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="title-4 flex items-center gap-2 text-foreground">
          <FileText className="h-3.5 w-3.5" /> Linked BRD Documents
        </h4>
        {canManage && (
          <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted">
            <Plus className="h-3 w-3" /> Link BRD
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="Search BRDs in this project…"
            className="h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {ql && (
            <div className="mt-1 divide-y rounded-lg border">
              {matches.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
              ) : (
                matches.map((b) => (
                  <button key={b.id} onClick={() => linkBrd(b.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                    {b.fileType === "pdf" ? <FileType2 className="h-4 w-4 text-rose-500" /> : <FileText className="h-4 w-4 text-blue-500" />}
                    <span className="truncate">{b.name}</span>
                    <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {brds.length === 0 ? (
        <p className="text-xs text-muted-foreground">No BRDs linked to this story.</p>
      ) : (
        <div className="space-y-2">
          {brds.map((b) => (
            <div key={b.linkId} className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              {b.fileType === "pdf" ? <FileType2 className="h-4 w-4 shrink-0 text-rose-500" /> : <FileText className="h-4 w-4 shrink-0 text-blue-500" />}
              <Link href={`/projects/${projectId}/brds/${b.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-indigo-600 hover:underline">
                {b.name}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[b.status] || STATUS_STYLES.Draft}`}>{b.status}</span>
              <Link href={`/projects/${projectId}/brds/${b.id}`} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Open">
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              {canManage && (
                <button onClick={() => unlink(b.linkId, b.id)} className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" title="Unlink">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
