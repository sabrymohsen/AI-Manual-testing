"use client"

/**
 * Saved views for the Scrum Board: name the current filters ("My open bugs")
 * and get them back in one click, privately or shared with the project.
 */
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bookmark, BookmarkPlus, Check, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SavedView {
  id: string
  name: string
  query: string
  shared: boolean
  mine: boolean
  owner?: string
}

/** The parts of the board URL a view stores (everything but an open task). */
export function viewQuery(search: string): string {
  const p = new URLSearchParams(search)
  p.delete("task")
  p.sort()
  return p.toString()
}

export function SavedViews({ projectId, currentQuery, onApply }: { projectId: string; currentQuery: string; onApply: (query: string) => void }) {
  const qc = useQueryClient()
  const key = ["scrum", projectId, "saved-views"]
  const { data: views = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/scrum/views`)
      return ((await res.json()).views || []) as SavedView[]
    },
  })
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [shared, setShared] = useState(false)

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/scrum/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query: currentQuery, shared }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Couldn't save the view")
      return body
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      toast.success(`Saved view “${name}”`)
      setSaving(false)
      setName("")
      setShared(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/scrum/views/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't delete the view")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  })

  const current = viewQuery(currentQuery)
  const active = views.find((v) => viewQuery(v.query) === current)
  const mine = views.filter((v) => v.mine)
  const team = views.filter((v) => !v.mine)

  const row = (v: SavedView) => (
    <DropdownMenuItem key={v.id} onClick={() => onApply(v.query)} className="group flex items-center gap-2 text-sm">
      {active?.id === v.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />}
      <span className="flex-1 truncate">{v.name}</span>
      {v.shared && <Users className="h-3 w-3 text-muted-foreground" aria-label="Shared with the project" />}
      {v.mine && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            remove.mutate(v.id)
          }}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete view ${v.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </DropdownMenuItem>
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Saved views" title="Saved views" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden max-w-[140px] truncate xl:inline">{active ? active.name : "Views"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {mine.length > 0 && <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">My views</DropdownMenuLabel>}
          {mine.map(row)}
          {team.length > 0 && <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">Shared with the team</DropdownMenuLabel>}
          {team.map(row)}
          {views.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No saved views yet. Set some filters, then save them here.</p>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaving(true)} className="gap-2 text-sm">
            <BookmarkPlus className="h-4 w-4" /> Save current filters…
          </DropdownMenuItem>
          {active && (
            <DropdownMenuItem onClick={() => onApply("")} className="gap-2 text-sm text-muted-foreground">
              Clear filters
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My open bugs" maxLength={80}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              Share with everyone in this project
            </label>
            <p className="text-xs text-muted-foreground">Saves the current filters, search and view (Board, Backlog, List or Timeline).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaving(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
