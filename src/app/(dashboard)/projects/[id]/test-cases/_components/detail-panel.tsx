"use client"

import { useState } from "react"
import Link from "next/link"
import { useCaseDetail } from "../_hooks/use-test-library"
import { PRIORITY_META } from "./config"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ClipboardList,
  Edit2,
  ExternalLink,
  Link2,
  Loader2,
  Play,
  X,
  Zap,
} from "lucide-react"

type Tab = "details" | "runs" | "bugs" | "sync"

/**
 * Right-hand inspector.
 *
 * Only mounts a query once a case is selected — steps, links and credential
 * are fetched per case. The old page loaded every step of every case up front
 * to render a list that showed none of them.
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
  const { data, isLoading, isError, error } = useCaseDetail(projectId, testCaseId)
  const tc = data?.testCase

  if (!testCaseId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">No test case selected</p>
          <p className="mx-auto mt-1.5 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
            Pick one from the list to see its steps, run history, bugs and sync state.
          </p>
        </div>
      </div>
    )
  }

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
      </div>
    )
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "details", label: "Details" },
    { id: "runs", label: "Runs" },
    { id: "bugs", label: "Bugs" },
    { id: "sync", label: "Sync" },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-2.5 border-b bg-muted/30 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Test case
          </span>
          <div className="flex items-center gap-0.5">
            <Link
              href={`/projects/${projectId}/test-cases/${tc.id}/edit`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h3 className="text-sm font-semibold leading-snug">{tc.title}</h3>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              PRIORITY_META[tc.priority as keyof typeof PRIORITY_META]?.chip ?? "bg-muted"
            )}
          >
            {tc.priority}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {tc.executionType === "Automated" ? (
              <Zap className="h-2.5 w-2.5 text-violet-500" />
            ) : (
              <ClipboardList className="h-2.5 w-2.5" />
            )}
            {tc.executionType}
          </span>
          {tc.suite && (
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {tc.suite.name}
            </span>
          )}
          <Button
            size="sm"
            onClick={() => onRun(tc)}
            className="ml-auto h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
          >
            <Play className="h-3 w-3 fill-current" /> Run
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b text-xs font-medium text-muted-foreground">
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
                    <div
                      key={l.requirementId}
                      className="flex items-center gap-2 rounded-lg border p-2.5 text-xs"
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="shrink-0 font-medium text-primary">
                        {l.requirement?.requirementKey}
                      </span>
                      <span className="truncate" title={l.requirement?.title}>
                        {l.requirement?.title}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No user stories linked — this case counts as an orphan.
                </p>
              )}
            </Section>

            <Section title={`Steps (${tc.steps?.length ?? 0})`}>
              <div className="space-y-1.5">
                {(tc.steps ?? []).map((step: any) => (
                  <div key={step.id ?? step.stepNumber} className="flex gap-2.5 rounded-lg border p-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                      {step.stepNumber}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs leading-snug">{step.actionDescription}</p>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {step.actionType}
                        </span>
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
          </>
        )}

        {tab === "runs" && (
          <Section title="Execution history">
            <p className="rounded-lg border border-dashed p-4 text-center text-xs leading-relaxed text-muted-foreground">
              Run history moves to its own paginated endpoint in the next pass — it was previously
              filtered from every run in the project.
            </p>
            <Link
              href={`/projects/${projectId}/test-runs?testCaseId=${tc.id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all runs for this case <ExternalLink className="h-3 w-3" />
            </Link>
          </Section>
        )}

        {tab === "bugs" && (
          <Section title="Linked bugs">
            <Link
              href={`/projects/${projectId}/bug-reports?testCaseId=${tc.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open in Bug Reports <ExternalLink className="h-3 w-3" />
            </Link>
          </Section>
        )}

        {tab === "sync" && (
          <Section title="OpenProject">
            <Link
              href={`/projects/${projectId}/openproject-sync`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open sync console <ExternalLink className="h-3 w-3" />
            </Link>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  )
}
