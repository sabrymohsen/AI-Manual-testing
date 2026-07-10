"use client"

import { useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useEpicMutations } from "@/hooks/scrum/use-scrum"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

const SWATCHES = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777"]

export function CreateEpicModal({ projectId }: { projectId: string }) {
  const { createEpicOpen, setCreateEpicOpen } = useScrumUI()
  const { create } = useEpicMutations(projectId)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(SWATCHES[0])

  function submit() {
    if (!title.trim()) return
    create.mutate(
      { title: title.trim(), description: description || null, color },
      {
        onSuccess: () => {
          setTitle(""); setDescription(""); setColor(SWATCHES[0]); setCreateEpicOpen(false)
        },
      }
    )
  }

  return (
    <Dialog open={createEpicOpen} onOpenChange={setCreateEpicOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Epic</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Billing Refactor" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground">Epic color</label>
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {color.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition-all hover:scale-110 ${
                    color === c ? "ring-2 ring-foreground" : "ring-1 ring-border"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                title="Custom color"
              >
                <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                Custom
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="sr-only" />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateEpicOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>Create epic</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
