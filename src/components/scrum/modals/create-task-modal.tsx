"use client"

import { useEffect, useMemo, useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useCreateTask, useScrumMembers, useScrumSprints, useScrumEpics } from "@/hooks/scrum/use-scrum"
import type { TaskPriority, TaskType } from "@/types/scrum"
import { PRIORITY_META, initials } from "@/components/scrum/shared"
import { TYPE_META, STORY_POINT_OPTIONS } from "@/components/scrum/task/task-detail-config"
import {
  ISSUE_TYPE_CONFIG,
  SECTION_META,
  STRUCTURED_SECTIONS,
  composeDescription,
  parseList,
  type SectionKey,
} from "./issue-type-config"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AlertCircle, Check, Loader2, Search, Zap } from "lucide-react"

const PRIORITIES: TaskPriority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"]
type FormType = keyof typeof ISSUE_TYPE_CONFIG
const ISSUE_TYPES: FormType[] = ["STORY", "TASK", "BUG", "TEST_CASE"]

const EMPTY_SECTIONS: Record<SectionKey, string> = {
  description: "",
  acceptanceCriteria: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  preconditions: "",
  testSteps: "",
  environment: "",
}

export function CreateTaskModal({ projectId }: { projectId: string }) {
  const { createTaskOpen, createTaskStatus, createTaskSprintId, createTaskType, closeCreateTask } = useScrumUI()
  const create = useCreateTask(projectId)
  const { data: members } = useScrumMembers(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)

  const [title, setTitle] = useState("")
  const [sections, setSections] = useState<Record<SectionKey, string>>(EMPTY_SECTIONS)
  const [type, setType] = useState<FormType>("STORY")
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM")
  const [sprintId, setSprintId] = useState("none")
  const [epicId, setEpicId] = useState("none")
  const [dueDate, setDueDate] = useState("")
  const [storyPoints, setStoryPoints] = useState<number | null>(null)
  const [labels, setLabels] = useState("")
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [memberQuery, setMemberQuery] = useState("")
  const [error, setError] = useState<string | null>(null)

  const config = ISSUE_TYPE_CONFIG[type]
  const preselectedSprint = sprints?.find((s) => s.id === createTaskSprintId)

  function reset() {
    setTitle("")
    setSections(EMPTY_SECTIONS)
    setPriority("MEDIUM")
    setEpicId("none")
    setDueDate("")
    setStoryPoints(null)
    setLabels("")
    setAssigneeIds([])
    setMemberQuery("")
    setError(null)
  }

  // Reset every time the dialog opens. Previously state was only cleared on a
  // successful create, so cancelling left the next open pre-filled with the
  // abandoned draft.
  useEffect(() => {
    if (!createTaskOpen) return
    reset()
    setSprintId(createTaskSprintId ?? "none")
    setType(((createTaskType as FormType) && ISSUE_TYPES.includes(createTaskType as FormType)
      ? (createTaskType as FormType)
      : "STORY"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTaskOpen, createTaskSprintId, createTaskType])

  // Estimation is meaningless on a Bug or Test Case — drop any carried value
  // when switching to a type that doesn't show the field.
  useEffect(() => {
    if (!config.showStoryPoints) setStoryPoints(null)
  }, [config.showStoryPoints])

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return members ?? []
    return (members ?? []).filter(
      (m) => (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
  }, [members, memberQuery])

  function setSection(key: SectionKey, value: string) {
    setSections((prev) => ({ ...prev, [key]: value }))
  }

  function close() {
    setError(null)
    closeCreateTask()
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || create.isPending) return
    setError(null)

    create.mutate(
      {
        title: title.trim(),
        description: composeDescription(type, sections),
        type,
        status: createTaskStatus ?? "TODO",
        priority,
        sprintId: sprintId === "none" ? null : sprintId,
        epicId: epicId === "none" ? null : epicId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        storyPoints: config.showStoryPoints ? storyPoints : null,
        environment: sections.environment.trim() || null,
        labels: parseList(labels),
        tags: parseList(labels),
        assigneeIds,
      },
      {
        onSuccess: () => {
          reset()
          closeCreateTask()
        },
        // The hook already toasts, but a dialog that stays open with no visible
        // reason is a dead end — surface the server's actual message inline.
        onError: (err: any) => {
          setError(
            err?.response?.data?.error ??
              err?.message ??
              "Could not create the issue. Please try again."
          )
        },
      }
    )
  }

  const TypeIcon = TYPE_META[type as TaskType].icon
  const freeTextSections = config.sections.filter((s) => !STRUCTURED_SECTIONS.includes(s))
  const showEnvironment = config.sections.includes("environment")

  return (
    <Dialog open={createTaskOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <TypeIcon className={cn("h-4 w-4", TYPE_META[type as TaskType].color)} />
              Create {TYPE_META[type as TaskType].label}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {preselectedSprint ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <Zap className="h-3 w-3" />
                  Will be added to sprint “{preselectedSprint.name}”
                </span>
              ) : (
                "Fields adapt to the issue type you pick."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {/* Issue type selector */}
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">Issue type</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ISSUE_TYPES.map((t) => {
                  const meta = TYPE_META[t as TaskType]
                  const Icon = meta.icon
                  const on = type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setType(t)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors",
                        on
                          ? ISSUE_TYPE_CONFIG[t].accent
                          : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", on ? "" : meta.color)} />
                      {t === "STORY" ? "User Story" : meta.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {/* Title */}
            <div className="mb-4 space-y-1">
              <label htmlFor="issue-title" className="text-xs font-semibold text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                id="issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={config.titlePlaceholder}
                autoFocus
                required
              />
              {config.titleHint && <p className="text-[11px] text-muted-foreground">{config.titleHint}</p>}
            </div>

            {/* Type-specific free-text sections */}
            <div className="mb-4 space-y-3">
              {freeTextSections.map((key) => {
                const meta = SECTION_META[key]
                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`section-${key}`} className="text-xs font-semibold text-muted-foreground">
                      {meta.label}
                    </label>
                    <Textarea
                      id={`section-${key}`}
                      value={sections[key]}
                      onChange={(e) => setSection(key, e.target.value)}
                      rows={meta.rows}
                      placeholder={meta.placeholder}
                      className="resize-y"
                    />
                    {meta.hint && <p className="text-[11px] text-muted-foreground">{meta.hint}</p>}
                  </div>
                )
              })}
            </div>

            {/* Structured fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              {showEnvironment && (
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="environment" className="text-xs font-semibold text-muted-foreground">
                    {SECTION_META.environment.label}
                  </label>
                  <Input
                    id="environment"
                    value={sections.environment}
                    onChange={(e) => setSection("environment", e.target.value)}
                    placeholder={SECTION_META.environment.placeholder}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Priority</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Due date</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Sprint</label>
                <Select value={sprintId} onValueChange={setSprintId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No sprint (backlog)</SelectItem>
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
                    {epics?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
                          {e.title}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="labels" className="text-xs font-semibold text-muted-foreground">Labels</label>
                <Input
                  id="labels"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  placeholder="ui, api, regression"
                />
              </div>
            </div>

            {/* Story points — only where estimation is meaningful */}
            {config.showStoryPoints && (
              <div className="mt-4 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Story points</label>
                <div className="flex flex-wrap gap-1.5">
                  {STORY_POINT_OPTIONS.map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      aria-pressed={storyPoints === pts}
                      onClick={() => setStoryPoints(storyPoints === pts ? null : pts)}
                      className={cn(
                        "h-8 min-w-8 rounded-md border px-2 text-xs font-semibold transition-colors",
                        storyPoints === pts
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {pts}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assignees */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Assignees{assigneeIds.length > 0 && ` (${assigneeIds.length})`}
              </label>
              {(members?.length ?? 0) > 6 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Filter members"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              )}
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
                {filteredMembers.length === 0 && (
                  <p className="px-1 py-0.5 text-[11px] text-muted-foreground">No members match “{memberQuery}”.</p>
                )}
                {filteredMembers.map((m) => {
                  const on = assigneeIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setAssigneeIds(on ? assigneeIds.filter((id) => id !== m.id) : [...assigneeIds, m.id])
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                        {on ? <Check className="h-3 w-3" /> : initials(m.name, m.email)}
                      </span>
                      {m.name || m.email}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create {TYPE_META[type as TaskType].label.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
