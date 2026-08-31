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
export type SortKey = "updatedAt" | "createdAt" | "title" | "priority" | "lastRunAt"

export interface CaseRow {
  id: string
  title: string
  priority: CasePriority
  source: string
  executionType: CaseExecutionType
  tags: string[]
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
  bySuite: { suiteId: string | null; count: number }[]
}

export interface LibraryFilters {
  q?: string
  suite?: string
  status?: CaseStatus[]
  priority?: CasePriority[]
  executionType?: CaseExecutionType
  tag?: string[]
  trace?: TraceFilter
  sort?: SortKey
  dir?: "asc" | "desc"
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const libraryKeys = {
  all: (projectId: string) => ["test-library", projectId] as const,
  browse: (projectId: string, f: LibraryFilters) => ["test-library", projectId, "browse", f] as const,
  facets: (projectId: string) => ["test-library", projectId, "facets"] as const,
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

function toQuery(f: LibraryFilters, cursor?: string | null): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.suite) p.set("suite", f.suite)
  f.status?.forEach((s) => p.append("status", s))
  f.priority?.forEach((s) => p.append("priority", s))
  if (f.executionType) p.set("executionType", f.executionType)
  f.tag?.forEach((t) => p.append("tag", t))
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
      getJson<{ rows: CaseRow[]; nextCursor: string | null }>(
        `/api/projects/${projectId}/test-cases/browse?${toQuery(filters, pageParam)}`
      ),
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function useFacets(projectId: string) {
  return useQuery({
    queryKey: libraryKeys.facets(projectId),
    queryFn: () => getJson<Facets>(`/api/projects/${projectId}/test-cases/facets`),
  })
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
