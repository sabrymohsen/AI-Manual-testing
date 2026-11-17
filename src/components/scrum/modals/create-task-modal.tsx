"use client"

import { useEffect, useMemo, useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useCreateTask, useScrumMembers, useScrumSprints, useScrumEpics, useScrumProject } from "@/hooks/scrum/use-scrum"
import type { TaskPriority, TaskType } from "@/types/scrum"
import { PRIORITY_META, PriorityIcon, AvatarStack, TYPE_DOT } from "@/components/scrum/shared"
import { TYPE_META, STORY_POINT_OPTIONS } from "@/components/scrum/task/task-detail-config"
import {
  ISSUE_TYPE_CONFIG,
  SECTION_META,
  STRUCTURED_SECTIONS,
  composeDescription,
  parseList,
  type SectionKey,
} from "./issue-type-config"
import { ComposerDialog, ComposerTitle, ComposerText, ChipRow, ChipButton, CreateMoreToggle } from "@/components/ui/issue-composer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CalendarDays, Check, ChevronDown, Hash, Layers, Monitor, Search, Tag, UserRound, Zap } from "lucide-react"

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
  const [createMore, setCreateMore] = useState(false)
  const { data: project } = useScrumProject(projectId)
  const boardKey = project?.boardKey

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
          if (!createMore) closeCreateTask()
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

  const freeTextSections = config.sections.filter((s) => !STRUCTURED_SECTIONS.includes(s))
  const showEnvironment = config.sections.includes("environment")
  const typeLabel = type === "STORY" ? "User Story" : TYPE_META[type as TaskType].label
  const chosenSprint = sprints?.find((s) => s.id === sprintId)
  const chosenEpic = epics?.find((e) => e.id === epicId)
  const chosenMembers = (members ?? []).filter((m) => assigneeIds.includes(m.id))

  return (
    <ComposerDialog
      open={createTaskOpen}
      onOpenChange={(o) => !o && close()}
      title={`Create ${typeLabel}`}
      description="Fields adapt to the issue type you pick."
      crumbs={[
        <span key="key" className="rounded border border-border px-1 font-mono text-[10px]">{boardKey || "ISSUE"}</span>,
        <DropdownMenu key="type">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Issue type"
              className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 font-medium text-foreground transition-colors hover:bg-accent"
            >
              <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[type as TaskType])} />
              New {typeLabel.toLowerCase()}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {ISSUE_TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setType(t)} className="gap-2 text-xs">
                <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[t as TaskType])} />
                {t === "STORY" ? "User Story" : TYPE_META[t as TaskType].label}
                {type === t && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>,
      ]}
      onSubmit={() => submit()}
      canSubmit={!!title.trim()}
      submitting={create.isPending}
      submitLabel={`Create ${typeLabel.toLowerCase()}`}
      error={error}
      footerLeft={
        <>
          <CreateMoreToggle checked={createMore} onChange={setCreateMore} />
          {preselectedSprint && (
            <span className="hidden items-center gap-1 truncate sm:inline-flex">
              <Zap className="h-3 w-3 text-primary" /> Goes into {preselectedSprint.name}
            </span>
          )}
        </>
      }
    >
      <ComposerTitle
        id="issue-title"
        aria-label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={config.titlePlaceholder}
        autoFocus
        required
      />

      {freeTextSections.map((key, i) => {
        const meta = SECTION_META[key]
        return (
          <ComposerText
            key={key}
            id={`section-${key}`}
            label={i === 0 && key === "description" ? undefined : meta.label}
            hint={meta.hint}
            value={sections[key]}
            onChange={(v) => setSection(key, v)}
            placeholder={key === "description" ? "Add description…" : meta.placeholder}
            minRows={key === "description" ? 3 : 2}
          />
        )
      })}

      <ChipRow>
        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton active aria-label={`Priority: ${PRIORITY_META[priority].label}`}>
              <PriorityIcon priority={priority} />
              {PRIORITY_META[priority].label}
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => setPriority(p)} className="gap-2 text-xs">
                <PriorityIcon priority={p} />
                {PRIORITY_META[p].label}
                {priority === p && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assignees */}
        <Popover>
          <PopoverTrigger asChild>
            <ChipButton active={chosenMembers.length > 0} aria-label="Assignees">
              {chosenMembers.length > 0 ? (
                <>
                  <AvatarStack members={chosenMembers} max={3} size="sm" />
                  <span className="truncate">
                    {chosenMembers.length === 1 ? chosenMembers[0].name || chosenMembers[0].email : `${chosenMembers.length} people`}
                  </span>
                </>
              ) : (
                <>
                  <UserRound className="h-3.5 w-3.5" /> Assignee
                </>
              )}
            </ChipButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <div className="relative p-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Assign to…"
                aria-label="Filter members"
                className="h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-56 overflow-y-auto border-t border-border pt-1">
              {filteredMembers.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">No members match “{memberQuery}”.</p>
              )}
              {filteredMembers.map((m) => {
                const on = assigneeIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAssigneeIds(on ? assigneeIds.filter((id) => id !== m.id) : [...assigneeIds, m.id])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <AvatarStack members={[m]} max={1} size="sm" />
                    <span className="truncate">{m.name || m.email}</span>
                    {on && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sprint */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton active={!!chosenSprint} aria-label="Sprint">
              <Zap className={cn("h-3.5 w-3.5", chosenSprint && "text-amber-500")} />
              <span className="truncate">{chosenSprint ? chosenSprint.name : "Backlog"}</span>
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setSprintId("none")} className="gap-2 text-xs">
              No sprint (backlog)
              {sprintId === "none" && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            {sprints?.map((sp) => (
              <DropdownMenuItem key={sp.id} onSelect={() => setSprintId(sp.id)} className="gap-2 text-xs">
                <span className="truncate">{sp.name}</span>
                {sp.status === "ACTIVE" && <span className="rounded-full bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">Active</span>}
                {sprintId === sp.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Epic */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton active={!!chosenEpic} aria-label="Epic">
              {chosenEpic ? (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chosenEpic.color }} />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              <span className="truncate">{chosenEpic ? chosenEpic.title : "Epic"}</span>
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setEpicId("none")} className="text-xs">
              No epic
              {epicId === "none" && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            {epics?.map((ep) => (
              <DropdownMenuItem key={ep.id} onSelect={() => setEpicId(ep.id)} className="gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ep.color }} />
                <span className="truncate">{ep.title}</span>
                {epicId === ep.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Story points */}
        {config.showStoryPoints && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ChipButton active={storyPoints != null} aria-label="Story points">
                <Hash className="h-3.5 w-3.5" />
                {storyPoints != null ? `${storyPoints} pts` : "Estimate"}
              </ChipButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onSelect={() => setStoryPoints(null)} className="text-xs">
                No estimate
                {storyPoints == null && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              {STORY_POINT_OPTIONS.map((pts) => (
                <DropdownMenuItem key={pts} onSelect={() => setStoryPoints(pts)} className="text-xs tabular-nums">
                  {pts} {pts === 1 ? "point" : "points"}
                  {storyPoints === pts && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Due date */}
        <label
          className={cn(
            "relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
            dueDate
              ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-accent"
              : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {dueDate ? new Date(dueDate + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Due date"}
          <input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        {/* Labels */}
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring",
            labels.trim() ? "border-border bg-card text-foreground" : "border-dashed border-border text-muted-foreground"
          )}
        >
          <Tag className="h-3.5 w-3.5 shrink-0" />
          <input
            id="labels"
            aria-label="Labels"
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            placeholder="Labels"
            className="w-24 bg-transparent outline-none placeholder:text-muted-foreground focus:w-40"
          />
        </span>
      </ChipRow>

      {showEnvironment && (
        <ChipRow className="mt-2">
          <span className="inline-flex h-7 w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground focus-within:border-solid focus-within:ring-2 focus-within:ring-ring">
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            <input
              id="environment"
              aria-label={SECTION_META.environment.label}
              value={sections.environment}
              onChange={(e) => setSection("environment", e.target.value)}
              placeholder={SECTION_META.environment.placeholder}
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </span>
        </ChipRow>
      )}
    </ComposerDialog>
  )
}
