"use client"

import { useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useSprintMutations } from "@/hooks/scrum/use-scrum"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export function CreateSprintModal({ projectId }: { projectId: string }) {
  const { createSprintOpen, setCreateSprintOpen } = useScrumUI()
  const { create } = useSprintMutations(projectId)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [makeActive, setMakeActive] = useState(false)

  function submit() {
    if (!name.trim()) return
    create.mutate(
      {
        name: name.trim(),
        goal: goal || null,
        status: makeActive ? "ACTIVE" : "PLANNED",
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
      },
      {
        onSuccess: () => {
          setName(""); setGoal(""); setStartDate(""); setEndDate(""); setMakeActive(false)
          setCreateSprintOpen(false)
        },
      }
    )
  }

  return (
    <Dialog open={createSprintOpen} onOpenChange={setCreateSprintOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create sprint</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sprint 25" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Goal</label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">End date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} className="h-4 w-4 accent-primary" />
            Start this sprint immediately (only one sprint can be active)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateSprintOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>Create sprint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
