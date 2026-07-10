"use client"

import { useEffect, useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useCreateTask, useScrumMembers, useScrumSprints, useScrumEpics } from "@/hooks/scrum/use-scrum"
import type { TaskPriority } from "@/types/scrum"
import { PRIORITY_META } from "@/components/scrum/shared"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PRIORITIES: TaskPriority[] = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]

export function CreateTaskModal({ projectId }: { projectId: string }) {
  const { createTaskOpen, createTaskStatus, createTaskSprintId, closeCreateTask } = useScrumUI()
  const create = useCreateTask(projectId)
  const { data: members } = useScrumMembers(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM")
  const [sprintId, setSprintId] = useState("none")
  const [epicId, setEpicId] = useState("none")
  const [dueDate, setDueDate] = useState("")
  const [storyPoints, setStoryPoints] = useState("")
  const [tags, setTags] = useState("")
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])

  // Preselect the sprint when opened from a Backlog sprint section.
  useEffect(() => {
    if (createTaskOpen) setSprintId(createTaskSprintId ?? "none")
  }, [createTaskOpen, createTaskSprintId])

  function reset() {
    setTitle(""); setDescription(""); setPriority("MEDIUM"); setSprintId("none")
    setEpicId("none"); setDueDate(""); setStoryPoints(""); setTags(""); setAssigneeIds([])
  }

  function submit() {
    if (!title.trim()) return
    create.mutate(
      {
        title: title.trim(),
        description: description || null,
        status: createTaskStatus ?? "TODO",
        priority,
        sprintId: sprintId === "none" ? null : sprintId,
        epicId: epicId === "none" ? null : epicId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        storyPoints: storyPoints === "" ? null : Number(storyPoints),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        assigneeIds,
      },
      { onSuccess: () => { reset(); closeCreateTask() } }
    )
  }

  return (
    <Dialog open={createTaskOpen} onOpenChange={(o) => !o && closeCreateTask()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Story points</label>
              <Input type="number" min={0} value={storyPoints} onChange={(e) => setStoryPoints(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Sprint</label>
              <Select value={sprintId} onValueChange={setSprintId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sprint</SelectItem>
                  {sprints?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Epic</label>
              <Select value={epicId} onValueChange={setEpicId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No epic</SelectItem>
                  {epics?.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Tags</label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ui, api" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Assignees</label>
            <div className="flex flex-wrap gap-1.5">
              {members?.map((m) => {
                const on = assigneeIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAssigneeIds(on ? assigneeIds.filter((id) => id !== m.id) : [...assigneeIds, m.id])}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground"}`}
                  >
                    {m.name || m.email}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeCreateTask}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
