"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  useCaseDetail,
  useCaseRuns,
  useCaseVersions,
  useDeleteCases,
  useDuplicateCase,
  useMoveCases,
  useRestoreVersion,
  useSyncCase,
  useBulkUpdate,
  type BulkPatch,
  type CaseVersion,
  type ReviewState,
} from "../_hooks/use-test-library"
import { useProjectModules } from "@/components/bug-reports/module-select"
import { useProjectTeam } from "@/hooks/use-project-team"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { LinkedEntities } from "@/components/entity-links/linked-entities"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { PRIORITY_META, REVIEW_META, REVIEW_ORDER, STATUS_META, formatMinutes, relativeTime } from "./config"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  FileText,
  Bug,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CloudUpload,
  Copy,
  Edit2,
  ExternalLink,
  Folder,
  History,
  Link2,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react"

type Tab = "details" | "runs" | "bugs" | "history" | "sync"

/**
 * Right-hand inspector. Fetches per case, and each tab fetches only when it
 * is opened.
 */
export function DetailPanel({
  projectId,
  testCaseId,
  onClose,
  onRun,
}: {
  projectId: string
  testCaseId: string | null
  onClose: () => void
  onRun: (tc: { id: string; title: string; executionType: string }) => void
}) {
  const [tab, setTab] = useState<Tab>("details")
  const [pendingDelete, setPendingDelete] = useState(false)
  const { name: trackerName, provider } = useProjectIntegration(projectId)
  const { data, isLoading, isError, error } = useCaseDetail(projectId, testCaseId)
  const deleteCases = useDeleteCases(projectId)
  const moveCases = useMoveCases(projectId)
  const duplicate = useDuplicateCase(projectId)
  const bulkUpdate = useBulkUpdate(projectId)
  const { modules: projectModules } = useProjectModules(projectId)
  const { members } = useProjectTeam(projectId)
  const tc = data?.testCase

  if (!testCaseId) return null

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (isError || !tc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-semibold text-destructive">Couldn&apos;t load this test case</p>
        <p className="text-xs text-muted-foreground">{(error as Error)?.message}</p>
        <button onClick={onClose} className="mt-2 text-xs text-primary hover:underline">
          Close
        </button>
      </div>
    )
  }

  const assignee = members.find((m) => m.id === tc.assignee)
  const review = (tc.reviewState ?? "Ready") as ReviewState
  const patch = (p: BulkPatch) => bulkUpdate.mutate({ testCaseIds: [tc.id], ...p })

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "details", label: "Details" },
    { id: "runs", label: "Runs" },
    { id: "bugs", label: "Bugs", count: tc.bugReports?.length || undefined },
    { id: "history", label: "History", count: tc._count?.versions || undefined },
    { id: "sync", label: "Sync" },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-2.5 border-b bg-muted/30 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-primary">Test case</span>
          <div className="flex items-center gap-0.5">
            <Link
              href={`/projects/${projectId}/test-cases/${tc.id}/edit`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Edit (E)"
              aria-label="Edit test case"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => duplicate.mutate(tc.id)}
              disabled={duplicate.isPending}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Duplicate"
              aria-label="Duplicate test case"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPendingDelete(true)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete test case"
              aria-label="Delete test case"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close panel"
              title="Close (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h3 className={cn("text-sm font-semibold leading-snug", review === "Deprecated" && "line-through opacity-70")}>
          {tc.title}
        </h3>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              PRIORITY_META[tc.priority as keyof typeof PRIORITY_META]?.chip ?? "bg-muted"
            )}
          >
            {tc.priority}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              title={REVIEW_META[review].hint}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                REVIEW_META[review].chip
              )}
            >
              {REVIEW_META[review].label}
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Review state</DropdownMenuLabel>
              {REVIEW_ORDER.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => r !== review && patch({ reviewState: r })}
                  className={cn("flex-col items-start gap-0 text-xs", r === review && "font-semibold")}
                >
                  {REVIEW_META[r].label}
                  <span className="text-[10px] font-normal text-muted-foreground">{REVIEW_META[r].hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {tc.executionType === "Automated" ? (
              <Zap className="h-2.5 w-2.5 text-violet-500" />
            ) : (
              <ClipboardList className="h-2.5 w-2.5" />
            )}
            {tc.executionType}
          </span>

          {/* Suite badge doubles as the move control. */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex max-w-[150px] items-center gap-1 truncate rounded-full border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Folder className="h-2.5 w-2.5 shrink-0 text-primary/70" />
              <span className="truncate">{tc.suite?.name ?? "Unfiled"}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Move to suite</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => moveCases.mutate({ testCaseIds: [tc.id], suiteId: null })}
                className="gap-1.5 text-xs font-medium"
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground" /> — Unfiled —
              </DropdownMenuItem>
              {projectModules.length > 0 && <DropdownMenuSeparator />}
              {projectModules.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => moveCases.mutate({ testCaseIds: [tc.id], suiteId: m.id })}
                  className="gap-1.5 text-xs"
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="truncate" title={m.path}>
                    {m.path}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            onClick={() => onRun(tc)}
            title="Run (R)"
            className="ml-auto h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
          >
            <Play className="h-3 w-3 fill-current" /> Run
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3 w-3" /> {assignee?.name ?? tc.assignee ?? "Unassigned"}
          </span>
          <span className="inline-flex items-center gap-1" title="Estimated time for one manual execution">
            <Clock className="h-3 w-3" /> {tc.estimatedMinutes != null ? formatMinutes(tc.estimatedMinutes) : "No estimate"}
          </span>
          {tc.tags?.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {tc.tags.map((t: string) => (
                <span key={t} className="rounded border bg-background px-1.5 py-px text-[10px]">
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b text-xs font-medium text-muted-foreground" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex-1 border-b-2 py-2.5 text-center transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent hover:text-foreground"
            )}
          >
            {t.label}
            {t.count ? <span className="ml-1 tabular-nums opacity-70">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {tab === "details" && (
          <>
            {tc.preconditions && (
              <Section title="Preconditions">
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-2.5 text-xs leading-relaxed">
                  {tc.preconditions}
                </p>
              </Section>
            )}

            <Section title="Covers">
              {tc.requirements?.length > 0 ? (
                <div className="space-y-1.5">
                  {tc.requirements.map((l: any) => (
                    <div key={l.requirementId} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="shrink-0 font-medium text-primary">{l.requirement?.requirementKey}</span>
                      <span className="truncate" title={l.requirement?.title}>
                        {l.requirement?.title}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Not linked to a user story yet, so coverage reports don’t count it.
                </p>
              )}
            </Section>

            {tc.brdRequirementLinks?.length > 0 && (
              <BrdRequirementLinks projectId={projectId} testCaseId={tc.id} links={tc.brdRequirementLinks} />
            )}

            {tc.planLinks?.length > 0 && (
              <Section title="In test plans">
                <div className="flex flex-wrap gap-1.5">
                  {tc.planLinks.map((l: { plan: { id: string; name: string } }) => (
                    <Link
                      key={l.plan.id}
                      href={`/projects/${projectId}/test-cases?plan=${l.plan.id}`}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                    >
                      <ClipboardCheck className="h-3 w-3 text-primary/70" /> {l.plan.name}
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            <Section title={`Steps (${tc.steps?.length ?? 0})`}>
              <div className="space-y-1.5">
                {(tc.steps ?? []).map((step: any) => (
                  <div key={step.id ?? step.stepNumber} className="flex gap-2.5 rounded-lg border p-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                      {step.stepNumber}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="whitespace-pre-wrap text-xs leading-snug">{step.actionDescription}</p>
                        {tc.executionType === "Automated" && step.actionType && step.actionType !== "custom_instruction" && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {String(step.actionType).replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase())}
                          </span>
                        )}
                      </div>
                      {step.expectedResult && (
                        <p className="text-[11px] leading-snug text-emerald-600 dark:text-emerald-400">
                          Expected: {step.expectedResult}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {(tc.steps?.length ?? 0) === 0 && (
                  <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No steps defined yet.
                  </p>
                )}
              </div>
            </Section>

            <div className="border-t pt-4">
              <LinkedEntities projectId={projectId} entityId={tc.id} entityType="TEST_CASE" />
            </div>
          </>
        )}

        {tab === "runs" && <RunsTab projectId={projectId} testCaseId={tc.id} />}

        {tab === "bugs" && (
          <Section title="Bugs filed against this case">
            {tc.bugReports?.length > 0 ? (
              <div className="space-y-1.5">
                {tc.bugReports.map((b: any) => (
                  <Link
                    key={b.id}
                    href={`/projects/${projectId}/bug-reports?bugId=${b.id}`}
                    className="flex items-center gap-2 rounded-lg border p-2.5 text-xs hover:bg-accent/40"
                  >
                    <Bug className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    {b.bugKey && <span className="shrink-0 font-medium text-primary">{b.bugKey}</span>}
                    <span className="min-w-0 flex-1 truncate" title={b.title}>
                      {b.title}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {b.status}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                No bugs filed against this case.
              </p>
            )}
            <Link
              href={`/projects/${projectId}/bug-reports?testCaseId=${tc.id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open in Bug Reports <ExternalLink className="h-3 w-3" />
            </Link>
          </Section>
        )}

        {tab === "history" && <HistoryTab projectId={projectId} testCaseId={tc.id} />}

        {tab === "sync" && (
          <SyncTab
            projectId={projectId}
            testCaseId={tc.id}
            trackerName={trackerName}
            canSyncHere={provider === "OpenProject"}
            sync={tc.sync}
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete}
        variant="danger"
        title={`Delete "${tc.title}"?`}
        description="The test case and its steps are deleted. Bugs filed against it and its automated run history are kept. To retire a case without losing anything, set it to Deprecated instead."
        confirmLabel="Delete test case"
        isLoading={deleteCases.isPending}
        onConfirm={async () => {
          await deleteCases.mutateAsync([tc.id])
          setPendingDelete(false)
          onClose()
        }}
        onCancel={() => setPendingDelete(false)}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

const RUN_STATUS_CHIP: Record<string, string> = {
  Passed: STATUS_META.Passed.chip,
  SelfHealed: STATUS_META.Passed.chip,
  Failed: STATUS_META.Failed.chip,
  Blocked: STATUS_META.Blocked.chip,
  Warning: STATUS_META.Warning.chip,
  Skipped: STATUS_META.Skipped.chip,
}

function formatDuration(ms: number) {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function RunsTab({ projectId, testCaseId }: { projectId: string; testCaseId: string }) {
  const { data, isLoading, isError, error } = useCaseRuns(projectId, testCaseId, true)
  const runs = data?.runs ?? []

  return (
    <Section title="Last 10 runs">
      {isLoading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
      {isError && <p className="text-xs text-destructive">{(error as Error).message}</p>}
      {!isLoading && runs.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          This case hasn&apos;t been run yet.
        </p>
      )}
      <div className="space-y-1.5">
        {runs.map((r) => (
          <Link key={`${r.kind}-${r.id}`} href={r.href} className="block rounded-lg border p-2.5 text-xs hover:bg-accent/40">
            <div className="flex items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", RUN_STATUS_CHIP[r.status] ?? "bg-muted text-muted-foreground")}>
                {r.status === "SelfHealed" ? "Passed (healed)" : r.status}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium" title={r.name}>
                {r.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground" title={new Date(r.at).toLocaleString()}>
                {relativeTime(r.at)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {r.kind === "Automated" ? <Zap className="mr-1 inline h-3 w-3 text-violet-500" /> : <ClipboardList className="mr-1 inline h-3 w-3" />}
              {[r.environment, r.browser, r.viewport, formatDuration(r.durationMs)].filter(Boolean).join(" · ")}
              {r.bugCount ? ` · ${r.bugCount} bug${r.bugCount === 1 ? "" : "s"}` : ""}
            </p>
            {r.failedStep && (
              <p className="mt-1.5 rounded bg-red-500/5 px-2 py-1 text-[11px] leading-snug text-red-700 dark:text-red-400">
                Failed at step {r.failedStep.stepNumber}: {r.failedStep.action}
                {r.failedStep.detail && <span className="block opacity-80">{r.failedStep.detail}</span>}
              </p>
            )}
          </Link>
        ))}
      </div>
    </Section>
  )
}

function HistoryTab({ projectId, testCaseId }: { projectId: string; testCaseId: string }) {
  const { data, isLoading } = useCaseVersions(projectId, testCaseId, true)
  const restore = useRestoreVersion(projectId, testCaseId)
  const [open, setOpen] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<CaseVersion | null>(null)
  const versions = data?.versions ?? []

  return (
    <Section title="Earlier versions">
      {isLoading && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
      {!isLoading && versions.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No edits yet. Each time this case is saved, the previous version is kept here.
        </p>
      )}
      <div className="space-y-1.5">
        {versions.map((v) => (
          <div key={v.id} className="rounded-lg border text-xs">
            <button
              onClick={() => setOpen(open === v.id ? null : v.id)}
              className="flex w-full items-start gap-2 p-2.5 text-left hover:bg-accent/40"
              aria-expanded={open === v.id}
            >
              <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Version {v.version}</span>
                <span className="block text-[11px] text-muted-foreground">
                  Replaced by {v.changedByName ?? "someone"} {relativeTime(v.createdAt)}
                  {v.summary ? ` — changed ${v.summary}` : ""}
                </span>
              </span>
              <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform", open === v.id && "rotate-180")} />
            </button>
            {open === v.id && (
              <div className="space-y-2 border-t p-2.5">
                <p className="font-medium">{v.snapshot.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {v.snapshot.priority}
                  {v.snapshot.reviewState ? ` · ${v.snapshot.reviewState}` : ""}
                  {v.snapshot.tags?.length ? ` · ${v.snapshot.tags.join(", ")}` : ""}
                </p>
                {v.snapshot.preconditions && (
                  <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{v.snapshot.preconditions}</p>
                )}
                <ol className="list-decimal space-y-1 pl-4">
                  {v.snapshot.steps.map((s, i) => (
                    <li key={i}>
                      {s.actionDescription}
                      {s.expectedResult && (
                        <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">→ {s.expectedResult}</span>
                      )}
                    </li>
                  ))}
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => setPendingRestore(v)}
                >
                  <RotateCcw className="h-3 w-3" /> Restore this version
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title={`Restore version ${pendingRestore?.version}?`}
        description="The case is put back exactly as it was. What it looks like now is saved as a new version first, so this can be undone."
        confirmLabel="Restore"
        isLoading={restore.isPending}
        onConfirm={async () => {
          if (!pendingRestore) return
          await restore.mutateAsync(pendingRestore.id).catch(() => null)
          setPendingRestore(null)
          setOpen(null)
        }}
        onCancel={() => setPendingRestore(null)}
      />
    </Section>
  )
}

function SyncTab({
  projectId,
  testCaseId,
  trackerName,
  canSyncHere,
  sync,
}: {
  projectId: string
  testCaseId: string
  trackerName: string
  canSyncHere: boolean
  sync: { externalId: string; externalUrl: string | null; lastSyncStatus: string | null; lastSyncedAt: string | null; lastSyncError: string | null } | null
}) {
  const syncNow = useSyncCase(projectId, testCaseId)

  return (
    <Section title={trackerName}>
      <div className="space-y-2 rounded-lg border p-3 text-xs">
        {sync ? (
          <>
            <p className="flex items-center gap-1.5">
              <CloudUpload className={cn("h-3.5 w-3.5", sync.lastSyncStatus === "failed" ? "text-red-500" : "text-emerald-500")} />
              <span className="font-medium">
                {sync.lastSyncStatus === "failed" ? "Last sync failed" : "Synced"} as #{sync.externalId}
              </span>
              {sync.lastSyncedAt && <span className="text-muted-foreground">· {relativeTime(sync.lastSyncedAt)}</span>}
            </p>
            {sync.lastSyncError && <p className="text-[11px] text-red-600 dark:text-red-400">{sync.lastSyncError}</p>}
            {sync.externalUrl && (
              <a
                href={sync.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Open in {trackerName} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Not synced to {trackerName} yet.</p>
        )}

        {canSyncHere ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[11px]"
            disabled={syncNow.isPending}
            onClick={() => syncNow.mutate()}
          >
            {syncNow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
            {sync ? "Sync again" : "Sync now"}
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Syncing a single case is available for OpenProject projects.
          </p>
        )}
      </div>
      <Link
        href={`/projects/${projectId}/openproject-sync`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        Open sync console <ExternalLink className="h-3 w-3" />
      </Link>
    </Section>
  )
}

type BrdReqLink = {
  needsReview: boolean
  reviewReason: string | null
  requirement: { id: string; key: string; title: string; status: string; brd: { id: string; name: string } }
}

/** BRD requirements this case verifies; a changed BRD flags them for re-checking. */
function BrdRequirementLinks({ projectId, testCaseId, links }: { projectId: string; testCaseId: string; links: BrdReqLink[] }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  async function markReviewed(l: BrdReqLink) {
    setBusy(l.requirement.id)
    try {
      const res = await fetch(`/api/brds/${l.requirement.brd.id}/requirements/${l.requirement.id}/test-cases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId, needsReview: false }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't update")
      qc.invalidateQueries({ queryKey: ["test-library", projectId, "detail", testCaseId] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Verifies BRD requirements">
      <div className="space-y-1.5">
        {links.map((l) => (
          <div
            key={l.requirement.id}
            className={cn("rounded-lg border p-2.5 text-xs", l.needsReview && "border-amber-500/40 bg-amber-500/5")}
          >
            <Link
              href={`/projects/${projectId}/brds/${l.requirement.brd.id}?tab=coverage`}
              className="flex items-center gap-2 hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="shrink-0 font-medium text-primary">{l.requirement.key}</span>
              <span className="truncate" title={l.requirement.title}>
                {l.requirement.title}
              </span>
            </Link>
            <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{l.requirement.brd.name}</p>
            {l.needsReview && (
              <div className="mt-1.5 flex items-center gap-2 pl-5">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> {l.reviewReason ?? "Requirement changed"} — re-check this test
                </span>
                <button
                  onClick={() => markReviewed(l)}
                  disabled={busy === l.requirement.id}
                  className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent disabled:opacity-60"
                >
                  Reviewed
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}
