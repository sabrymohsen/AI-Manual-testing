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
        <button className="flex h-10 w-72 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-[#DFE1E6] text-sm font-medium text-[#6B778C] hover:border-[#0052CC]/40 hover:text-[#0052CC] transition-colors">
          <Plus className="h-4 w-4" /> Add column
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#6B778C]">Column name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. QA Review" autoFocus />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#6B778C]">Maps to status</label>
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
        <Button size="sm" className="w-full bg-[#0052CC] hover:bg-[#0747A6]" onClick={submit} disabled={create.isPending}>
          Add column
        </Button>
      </PopoverContent>
    </Popover>
  )
}
