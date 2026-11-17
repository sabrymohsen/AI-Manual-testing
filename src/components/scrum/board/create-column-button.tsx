"use client"

import { useState } from "react"
import { useColumnMutations } from "@/hooks/scrum/use-scrum"
import type { TaskStatus } from "@/types/scrum"
import { STATUS_META } from "@/components/scrum/shared"
import { Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_OPTIONS: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DEPLOYED", "DONE"]

export function CreateColumnButton({ projectId }: { projectId: string }) {
  const { create } = useColumnMutations(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [status, setStatus] = useState<TaskStatus>("TESTING")

  function submit() {
    if (!name.trim()) return
    create.mutate({ name: name.trim(), status }, { onSuccess: () => { setName(""); setOpen(false) } })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-9 w-[200px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> Add column
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Column name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. QA Review" autoFocus />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Maps to status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="w-full" onClick={submit} disabled={create.isPending}>
          Add column
        </Button>
      </PopoverContent>
    </Popover>
  )
}
