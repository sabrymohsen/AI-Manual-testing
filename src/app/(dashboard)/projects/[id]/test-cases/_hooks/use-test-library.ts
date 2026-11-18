"use client"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Data layer for the test library.
 *
 * Every query here is server-filtered and server-paginated. The page this
 * replaces fetched all test cases (with all steps), all test runs and all bug
 * reports for the project on mount, then joined them in the browser on each
 * render. These hooks fetch a page of already-joined summary rows.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CaseStatus = "NotExecuted" | "Passed" | "Failed" | "Blocked" | "Warning" | "Skipped"
export type CasePriority = "Low" | "Medium" | "High" | "Critical"
export type CaseExecutionType = "Manual" | "Automated"
export type TraceFilter = "orphans" | "broken"
export type SortKey = "updatedAt" | "createdAt" | "title" | "priority" | "lastRunAt" | "estimatedMinutes"
export type ReviewState = "Draft" | "Ready" | "Approved" | "Deprecated"

export interface CaseRow {
  id: string
  title: string
  priority: CasePriority
  source: string
  executionType: CaseExecutionType
  tags: string[]
  assignee: string | null
  reviewState: ReviewState
  estimatedMinutes: number | null
  lastStatus: CaseStatus
  lastRunAt: string | null
  lastRunId: string | null
  lastRunSource: CaseExecutionType | null
  openBugCount: number
  createdAt: string
  updatedAt: string
  suite: { id: string; name: string } | null
  requirementCount: number
  stepCount: number
  isOrphan: boolean
  sync: { externalId: string; externalUrl: string | null; lastSyncStatus: string | null } | null
}

export interface SuiteNode {
  id: string
  parentId: string | null
  name: string
  description: string | null
  orderIndex: number
  caseCount: number
}

export interface Facets {
  total: number
  orphans: number
  broken: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byExecutionType: Record<string, number>
  byReview: Record<string, number>
  bySuite: { suiteId: string | null; count: number }[]
  tags: { tag: string; count: number }[]
  assignees: { assignee: string; count: number }[]
}

export interface LibraryFilters {
  q?: string
  suite?: string
  status?: CaseStatus[]
  priority?: CasePriority[]
  executionType?: CaseExecutionType
  tag?: string[]
  review?: ReviewState[]
  /** Team member ids, plus "me" / "unassigned". */
  assignee?: string[]
  plan?: string
  trace?: TraceFilter
  sort?: SortKey
  dir?: "asc" | "desc"
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const libraryKeys = {
  all: (projectId: string) => ["test-library", projectId] as const,
  browse: (projectId: string, f: LibraryFilters) => ["test-library", projectId, "browse", f] as const,
  facets: (projectId: string, f: LibraryFilters) => ["test-library", projectId, "facets", f] as const,
  plans: (projectId: string) => ["test-library", projectId, "plans"] as const,
  runs: (projectId: string, tcId: string) => ["test-library", projectId, "runs", tcId] as const,
  versions: (projectId: string, tcId: string) => ["test-library", projectId, "versions", tcId] as const,
  suites: (projectId: string) => ["test-library", projectId, "suites"] as const,
  detail: (projectId: string, tcId: string | null) =>
    ["test-library", projectId, "detail", tcId] as const,
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

export function toQuery(f: LibraryFilters, cursor?: string | null): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.suite) p.set("suite", f.suite)
  f.status?.forEach((s) => p.append("status", s))
  f.priority?.forEach((s) => p.append("priority", s))
  if (f.executionType) p.set("executionType", f.executionType)
  f.tag?.forEach((t) => p.append("tag", t))
  f.review?.forEach((r) => p.append("review", r))
  f.assignee?.forEach((a) => p.append("assignee", a))
  if (f.plan) p.set("plan", f.plan)
  if (f.trace) p.set("trace", f.trace)
  if (f.sort) p.set("sort", f.sort)
  if (f.dir) p.set("dir", f.dir)
  if (cursor) p.set("cursor", cursor)
  return p.toString()
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Paginated case list. Pages are appended as the table scrolls. */
export function useCaseBrowse(projectId: string, filters: LibraryFilters) {
  return useInfiniteQuery({
    queryKey: libraryKeys.browse(projectId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getJson<{ rows: CaseRow[]; nextCursor: string | null; total?: number }>(
        `/api/projects/${projectId}/test-cases/browse?${toQuery(filters, pageParam)}`
      ),
    getNextPageParam: (last) => last.nextCursor,
  })
}

/**
 * Header counts within the current filters. Status and trace chips are left
 * out of the key (and ignored server-side) so toggling a chip doesn't change
 * the numbers on the chips themselves.
 */
export function useFacets(projectId: string, filters: LibraryFilters = {}) {
  const { status: _s, trace: _t, sort: _so, dir: _d, ...scope } = filters
  return useQuery({
    queryKey: libraryKeys.facets(projectId, scope),
    queryFn: () => getJson<Facets>(`/api/projects/${projectId}/test-cases/facets?${toQuery(scope)}`),
    placeholderData: (prev) => prev,
  })
}

/** Every id matching the filters — for "select all N matching". */
export async function fetchMatchingIds(projectId: string, filters: LibraryFilters) {
  const { sort: _so, dir: _d, ...f } = filters
  return getJson<{ ids: string[]; truncated: boolean }>(`/api/projects/${projectId}/test-cases/ids?${toQuery(f)}`)
}

export function useSuites(projectId: string) {
  return useQuery({
    queryKey: libraryKeys.suites(projectId),
    queryFn: () =>
      getJson<{ suites: SuiteNode[]; unfiledCount: number }>(
        `/api/projects/${projectId}/test-suites`
      ),
  })
}

/** Full detail — steps, links, credential. Only fetched once a case is selected. */
export function useCaseDetail(projectId: string, tcId: string | null) {
  return useQuery({
    queryKey: libraryKeys.detail(projectId, tcId),
    queryFn: () => getJson<{ testCase: any }>(`/api/projects/${projectId}/test-cases/${tcId}`),
    enabled: !!tcId,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

function useInvalidateLibrary(projectId: string) {
  const qc = useQueryClient()
  // Counts, tree tallies and rows all shift together, so anything that changes
  // filing or membership invalidates the whole namespace rather than trying to
  // patch three caches consistently.
  return () => qc.invalidateQueries({ queryKey: libraryKeys.all(projectId) })
}

/** Files cases into a suite, or unfiles them when suiteId is null. */
export function useMoveCases(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (vars: { testCaseIds: string[]; suiteId: string | null }) =>
      sendJson<{ moved: number }>(`/api/projects/${projectId}/test-cases/move`, "POST", vars),
    onSuccess: (data, vars) => {
      invalidate()
      toast.success(
        vars.suiteId
          ? `Moved ${data.moved} ${data.moved === 1 ? "case" : "cases"}`
          : `Unfiled ${data.moved} ${data.moved === 1 ? "case" : "cases"}`
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Deletes one or more test cases permanently with cascade cleanup. */
export function useDeleteCases(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (ids: string[]) =>
      sendJson<{ success: boolean; count: number }>(
        `/api/projects/${projectId}/test-cases`,
        "DELETE",
        { ids }
      ),
    onSuccess: (data) => {
      invalidate()
      toast.success(`Deleted ${data.count} ${data.count === 1 ? "test case" : "test cases"}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSuiteMutations(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)

  const create = useMutation({
    mutationFn: (vars: { name: string; parentId?: string | null }) =>
      sendJson<{ suite: SuiteNode }>(`/api/projects/${projectId}/test-suites`, "POST", vars),
    onSuccess: () => {
      invalidate()
      toast.success("Suite created")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const update = useMutation({
    mutationFn: ({ suiteId, ...body }: { suiteId: string; name?: string; parentId?: string | null }) =>
      sendJson<{ suite: SuiteNode }>(
        `/api/projects/${projectId}/test-suites/${suiteId}`,
        "PATCH",
        body
      ),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (suiteId: string) =>
      sendJson<{ suitesRemoved: number; casesUnfiled: number }>(
        `/api/projects/${projectId}/test-suites/${suiteId}`,
        "DELETE"
      ),
    onSuccess: (data) => {
      invalidate()
      toast.success(
        data.casesUnfiled > 0
          ? `Suite deleted — ${data.casesUnfiled} ${data.casesUnfiled === 1 ? "case" : "cases"} moved to Unfiled`
          : "Suite deleted"
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return { create, update, remove }
}

/** Sets one priority on many cases. */
export function useBulkPriority(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (vars: { testCaseIds: string[]; priority: CasePriority }) =>
      sendJson<{ success: boolean; count: number }>(`/api/test-cases/bulk-update-priority`, "POST", vars),
    onSuccess: (data, vars) => {
      invalidate()
      toast.success(`Set ${data.count} ${data.count === 1 ? "case" : "cases"} to ${vars.priority}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Opens one manual run containing every selected case; resolves to the session id. */
export function useBulkManualRun(projectId: string) {
  return useMutation({
    mutationFn: async ({ testCaseIds, options, name }: { testCaseIds: string[]; options?: RunOptions; name?: string }) => {
      const res = await sendJson<{ sessions?: { id: string; projectId: string }[] }>(`/api/test-cases/bulk-run`, "POST", {
        testCaseIds,
        projectId,
        executionMode: "Manual Session",
        name: name ?? `Manual run — ${testCaseIds.length} ${testCaseIds.length === 1 ? "case" : "cases"}`,
        ...(options ?? {}),
      })
      const id = res.sessions?.find((s) => s.projectId === projectId)?.id ?? res.sessions?.[0]?.id
      if (!id) throw new Error("Could not start the run")
      return id
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

type ExportedCase = {
  title: string
  priority: string
  preconditions: string
  steps: { stepNumber: number; actionDescription: string; expectedResult: string }[]
  requirements: string[]
}

/** Downloads the selected cases as a CSV that opens cleanly in Excel. */
export async function exportCasesCsv(testCaseIds: string[], fileName: string) {
  const data = await sendJson<{ testCases: ExportedCase[] }>(`/api/test-cases/bulk-export`, "POST", { testCaseIds })
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const rows = [["Title", "Priority", "Preconditions", "Step", "Action", "Expected result", "Stories"]]
  for (const tc of data.testCases) {
    const steps = tc.steps.length ? tc.steps : [{ stepNumber: "", actionDescription: "", expectedResult: "" } as never]
    steps.forEach((s: ExportedCase["steps"][number], i: number) =>
      rows.push([
        i === 0 ? tc.title : "",
        i === 0 ? tc.priority : "",
        i === 0 ? tc.preconditions : "",
        String(s.stepNumber ?? ""),
        s.actionDescription,
        s.expectedResult,
        i === 0 ? tc.requirements.join(", ") : "",
      ])
    )
  }
  // BOM so Excel reads UTF-8 (Arabic titles stay readable).
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return data.testCases.length
}

// ── Bulk property edits ──────────────────────────────────────────────────────

export interface BulkPatch {
  priority?: CasePriority
  executionType?: CaseExecutionType
  reviewState?: ReviewState
  assignee?: string | null
  estimatedMinutes?: number | null
  addTags?: string[]
  removeTags?: string[]
}

export function useBulkUpdate(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (vars: { testCaseIds: string[] } & BulkPatch) =>
      sendJson<{ count: number }>(`/api/projects/${projectId}/test-cases/bulk-update`, "POST", vars),
    onSuccess: (data, vars) => {
      invalidate()
      // Single-row inline edits stay quiet; bulk edits confirm.
      if (vars.testCaseIds.length > 1) toast.success(`Updated ${data.count} ${data.count === 1 ? "case" : "cases"}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDuplicateCase(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (tcId: string) =>
      sendJson<{ testCase: { id: string; title: string } }>(
        `/api/projects/${projectId}/test-cases/${tcId}/duplicate`,
        "POST"
      ),
    onSuccess: (data) => {
      invalidate()
      toast.success(`Created "${data.testCase.title}"`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Run history, versions, sync ──────────────────────────────────────────────

export interface CaseRun {
  id: string
  kind: "Automated" | "Manual"
  status: string
  name: string
  environment: string | null
  browser: string
  viewport: string
  at: string
  durationMs: number
  failedStep: { stepNumber: number; action: string; detail: string | null } | null
  bugCount: number | null
  href: string
}

export function useCaseRuns(projectId: string, tcId: string, enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.runs(projectId, tcId),
    queryFn: () => getJson<{ runs: CaseRun[] }>(`/api/projects/${projectId}/test-cases/${tcId}/runs?limit=10`),
    enabled,
  })
}

export interface CaseVersion {
  id: string
  version: number
  summary: string | null
  changedByName: string | null
  createdAt: string
  snapshot: {
    title: string
    priority: string
    preconditions: string | null
    reviewState?: string
    tags?: string[]
    steps: { actionDescription?: string; expectedResult?: string }[]
  }
}

export function useCaseVersions(projectId: string, tcId: string, enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.versions(projectId, tcId),
    queryFn: () => getJson<{ versions: CaseVersion[] }>(`/api/projects/${projectId}/test-cases/${tcId}/versions`),
    enabled,
  })
}

export function useRestoreVersion(projectId: string, tcId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: (versionId: string) =>
      sendJson<{ restored: number; changed: string[] }>(
        `/api/projects/${projectId}/test-cases/${tcId}/versions/${versionId}/restore`,
        "POST"
      ),
    onSuccess: (data) => {
      invalidate()
      toast.success(data.changed.length ? `Restored version ${data.restored}` : "Already matches that version")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSyncCase(projectId: string, tcId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  return useMutation({
    mutationFn: () => sendJson<{ success?: boolean; error?: string }>(`/api/test-cases/${tcId}/sync/openproject`, "POST"),
    onSuccess: () => {
      invalidate()
      toast.success("Synced to tracker")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ── Test plans ───────────────────────────────────────────────────────────────

export interface TestPlanRow {
  id: string
  name: string
  description: string | null
  createdByName: string | null
  updatedAt: string
  caseCount: number
  runnable: number
  byStatus: Record<string, number>
  totalMinutes: number
  unestimated: number
}

export function usePlans(projectId: string) {
  return useQuery({
    queryKey: libraryKeys.plans(projectId),
    queryFn: () => getJson<{ plans: TestPlanRow[] }>(`/api/projects/${projectId}/test-plans`),
  })
}

export function usePlanMutations(projectId: string) {
  const invalidate = useInvalidateLibrary(projectId)
  const base = `/api/projects/${projectId}/test-plans`

  const create = useMutation({
    mutationFn: (vars: { name: string; description?: string; testCaseIds?: string[] }) =>
      sendJson<{ plan: { id: string; name: string }; added: number }>(base, "POST", vars),
    onSuccess: (data) => {
      invalidate()
      toast.success(`Plan "${data.plan.name}" created${data.added ? ` with ${data.added} cases` : ""}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const rename = useMutation({
    mutationFn: ({ planId, ...body }: { planId: string; name?: string; description?: string | null }) =>
      sendJson(`${base}/${planId}`, "PATCH", body),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (planId: string) => sendJson(`${base}/${planId}`, "DELETE"),
    onSuccess: () => {
      invalidate()
      toast.success("Plan deleted — its test cases were not touched")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const editCases = useMutation({
    mutationFn: ({ planId, ...body }: { planId: string; add?: string[]; remove?: string[] }) =>
      sendJson<{ added: number; removed: number }>(`${base}/${planId}/cases`, "POST", body),
    onSuccess: (data) => {
      invalidate()
      if (data.added) toast.success(`Added ${data.added} ${data.added === 1 ? "case" : "cases"} to the plan`)
      else if (data.removed) toast.success(`Removed ${data.removed} from the plan`)
      else toast.info("Those cases are already in the plan")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return { create, rename, remove, editCases }
}

// ── Run options ──────────────────────────────────────────────────────────────

export interface RunOptions {
  environment: "Dev" | "Staging" | "UAT" | "Production"
  browserType: "Chromium" | "Firefox" | "WebKit"
  viewport: "Desktop" | "Tablet" | "Mobile"
}
