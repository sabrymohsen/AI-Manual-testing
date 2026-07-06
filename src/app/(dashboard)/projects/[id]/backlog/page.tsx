"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import { getPriorityBadge, getStatusBadge } from "@/components/ui/qa-badges"
import {
  GripVertical,
  Search,
  Layers,
  AlertTriangle,
  CloudUpload,
  ExternalLink,
  Loader2,
  CheckCircle,
  RefreshCw,
  FolderKanban,
  ListTree,
  Rows3,
  ChevronRight,
} from "lucide-react"

interface BacklogStory {
  id: string
  requirementKey: string
  title: string
  priority: string
  status: string
  source: string
  backlogRank: number | null
  epicId: string | null
  epic: { id: string; epicKey: string; title: string } | null
  testCases: Array<{ testCaseId: string }>
  openBugsCount: number
  computedCoverage: string
  openProjectSyncStatus: "Synced" | "Failed" | "NotSynced"
  openProjectWorkPackageUrl: string | null
}

interface Epic {
  id: string
  epicKey: string
  title: string
  status: string
  priority: string
  orderIndex: number
}

const OPEN_BUG_STATUSES = new Set(["Open", "InProgress", "Reopened", "ReadyForRetest"])

export default function BacklogPage() {
  const params = useParams()
  const projectId = params.id as string

  const [stories, setStories] = useState<BacklogStory[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [testCaseCount, setTestCaseCount] = useState<number | null>(null)
  const [openBugCount, setOpenBugCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [epicFilter, setEpicFilter] = useState("all") // all | none | <epicId>
  const [grouped, setGrouped] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)

  const showToast = (text: string, error = false) => {
    setToast({ text, error })
    setTimeout(() => setToast(null), 4000)
  }

  // Global backlog order: ranked first (ascending), unranked last by key.
  const sortGlobally = (list: BacklogStory[]) =>
    [...list].sort((a, b) => {
      if (a.backlogRank !== null && b.backlogRank !== null) return a.backlogRank - b.backlogRank
      if (a.backlogRank !== null) return -1
      if (b.backlogRank !== null) return 1
      return a.requirementKey.localeCompare(b.requirementKey)
    })

  const loadAll = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Stories + epics are the page's core — a failure here is surfaced,
      // never swallowed into a fake "no stories" empty state.
      const [reqRes, epicRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/requirements`),
        fetch(`/api/projects/${projectId}/epics`),
      ])
      if (!reqRes.ok || !epicRes.ok) {
        const bad = !reqRes.ok ? reqRes : epicRes
        const data = await bad.json().catch(() => null)
        throw new Error(data?.error || `Failed to load backlog (HTTP ${bad.status})`)
      }
      setStories(sortGlobally((await reqRes.json()).requirements || []))
      setEpics((await epicRes.json()).epics || [])

      // Reference counts for the stat strip — non-fatal if they fail
      fetch(`/api/projects/${projectId}/test-cases`)
        .then(async (r) => { if (r.ok) setTestCaseCount(((await r.json()).testCases || []).length) })
        .catch(() => {})
      fetch(`/api/projects/${projectId}/bug-reports`)
        .then(async (r) => {
          if (r.ok) {
            const bugs = (await r.json()).bugReports || []
            setOpenBugCount(bugs.filter((b: any) => OPEN_BUG_STATUSES.has(b.status)).length)
          }
        })
        .catch(() => {})
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load backlog")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const q = search.toLowerCase()
  const filtersActive = q !== "" || statusFilter !== "all" || epicFilter !== "all"

  const filteredStories = useMemo(
    () =>
      stories.filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false
        if (epicFilter === "none" && s.epicId !== null) return false
        if (epicFilter !== "all" && epicFilter !== "none" && s.epicId !== epicFilter) return false
        return !q || s.title.toLowerCase().includes(q) || s.requirementKey.toLowerCase().includes(q)
      }),
    [stories, q, statusFilter, epicFilter]
  )

  // Global rank number per story = its position in the full (unfiltered) order
  const globalRank = useMemo(() => {
    const map = new Map<string, number>()
    stories.forEach((s, i) => map.set(s.id, i + 1))
    return map
  }, [stories])

  const rankedCount = stories.filter((s) => s.backlogRank !== null).length

  // Grouped display: epics in configured order, No-Epic bucket last
  const groups = useMemo(() => {
    if (!grouped) return null
    const byEpic = new Map<string, BacklogStory[]>()
    const noEpic: BacklogStory[] = []
    filteredStories.forEach((s) => {
      if (!s.epicId) { noEpic.push(s); return }
      const list = byEpic.get(s.epicId) || []
      list.push(s)
      byEpic.set(s.epicId, list)
    })
    return { byEpic, noEpic }
  }, [grouped, filteredStories])

  const toggleCollapsed = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const persistOrder = async (ordered: BacklogStory[]) => {
    setSavingOrder(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((s) => s.id) }),
      })
      if (!res.ok) {
        showToast("Failed to save backlog order", true)
      } else {
        // Mirror the server's renumbering locally so rank #s and the
        // Ranked stat update without a refetch
        setStories(ordered.map((s, i) => ({ ...s, backlogRank: i })))
      }
    } catch {
      showToast("Network error while saving order", true)
    } finally {
      setSavingOrder(false)
    }
  }

  // Reordering mutates the GLOBAL order (rank is global; epic grouping is
  // display only). While grouped, drops are restricted to the same epic so a
  // drag never silently implies "move to another epic".
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = stories.findIndex((s) => s.id === dragId)
    const to = stories.findIndex((s) => s.id === targetId)
    if (from === -1 || to === -1) return
    if (grouped && stories[from].epicId !== stories[to].epicId) {
      showToast("Stories reorder within their epic here — use the Requirements page to move a story to another epic", true)
      return
    }
    const next = [...stories]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setStories(next)
    persistOrder(next)
  }

  const handleSyncStory = async (storyId: string) => {
    setSyncingId(storyId)
    try {
      const res = await fetch(`/api/requirements/${storyId}/sync/openproject`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        showToast(`Story ${data.action} in OpenProject (WP #${data.externalId})`)
        loadAll()
      } else {
        showToast(data.error || "Sync failed", true)
      }
    } catch {
      showToast("Network error during sync", true)
    } finally {
      setSyncingId(null)
    }
  }

  const renderStoryRow = (story: BacklogStory) => (
    <div
      key={story.id}
      draggable={!filtersActive}
      onDragStart={() => setDragId(story.id)}
      onDragEnd={() => { setDragId(null); setOverId(null) }}
      onDragOver={(e) => { e.preventDefault(); setOverId(story.id) }}
      onDrop={(e) => { e.preventDefault(); handleDrop(story.id); setOverId(null) }}
      className={`group flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-all ${
        overId === story.id && dragId !== story.id
          ? "border-blue-400 shadow-md"
          : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
      } ${dragId === story.id ? "opacity-40" : ""}`}
    >
      <span
        className={`shrink-0 text-slate-300 ${filtersActive ? "opacity-30" : "cursor-grab active:cursor-grabbing group-hover:text-slate-400"}`}
        title={filtersActive ? "Clear filters to reorder" : "Drag to reorder (rank is global)"}
      >
        <GripVertical size={15} />
      </span>
      <span className="shrink-0 w-9 text-center text-[10px] font-bold text-slate-400 tabular-nums">
        #{globalRank.get(story.id)}
      </span>
      <span className="shrink-0 font-bold text-[11px] text-slate-500 w-24 truncate" title={story.requirementKey}>
        {story.requirementKey}
      </span>
      <Link
        href={`/projects/${projectId}/requirements/${story.id}`}
        className="flex-1 truncate text-xs font-semibold text-slate-700 hover:text-blue-600"
        title={story.title}
      >
        {story.title}
      </Link>

      <span className="shrink-0">{getPriorityBadge(story.priority)}</span>
      <span className="shrink-0 hidden sm:inline">{getStatusBadge(story.status)}</span>

      {/* Lightweight reference: counts link out to the dedicated pages */}
      <Link
        href={`/projects/${projectId}/test-cases`}
        className="shrink-0 bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-0.5 rounded-full text-[9px] font-bold border border-blue-100 transition-colors"
        title="Linked test cases — open the Test Cases page"
      >
        {story.testCases.length} TC
      </Link>
      {story.openBugsCount > 0 ? (
        <Link
          href={`/projects/${projectId}/bug-reports`}
          className="shrink-0 bg-red-50 text-red-700 hover:bg-red-100 px-2 py-0.5 rounded-full text-[9px] font-bold border border-red-100 flex items-center gap-0.5 transition-colors"
          title="Linked bugs — open the Bug Reports page"
        >
          <AlertTriangle size={9} /> {story.openBugsCount}
        </Link>
      ) : (
        <span className="shrink-0 w-8 text-center text-slate-200 text-[9px]">—</span>
      )}

      {story.openProjectSyncStatus === "Synced" && story.openProjectWorkPackageUrl ? (
        <a
          href={story.openProjectWorkPackageUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-emerald-600 hover:text-emerald-700"
          title="Open in OpenProject"
        >
          <CheckCircle size={10} /> Synced <ExternalLink size={9} />
        </a>
      ) : (
        <button
          onClick={() => handleSyncStory(story.id)}
          disabled={syncingId === story.id}
          className={`shrink-0 flex items-center gap-1 text-[9px] font-bold transition-colors ${
            story.openProjectSyncStatus === "Failed"
              ? "text-red-500 hover:text-red-700"
              : "text-slate-400 hover:text-blue-600"
          }`}
          title="Push this story to OpenProject"
        >
          {syncingId === story.id ? <Loader2 size={10} className="animate-spin" /> : <CloudUpload size={10} />}
          {story.openProjectSyncStatus === "Failed" ? "Retry sync" : "Sync"}
        </button>
      )}
    </div>
  )

  const renderEpicBand = (epic: Epic | null, groupStories: BacklogStory[]) => {
    const key = epic?.id || "__none__"
    const collapsed = collapsedGroups.has(key)
    const covered = groupStories.filter((s) => s.computedCoverage === "Covered").length
    const pct = groupStories.length > 0 ? Math.round((covered / groupStories.length) * 100) : 0
    const neutral = epic === null
    return (
      <div
        className={`flex items-center gap-3 flex-wrap rounded-xl px-4 py-2.5 border ${
          neutral
            ? "bg-gradient-to-r from-slate-100/90 to-slate-50/40 border-slate-200/70 shadow-[inset_2px_0_0_theme(colors.slate.300)]"
            : "bg-gradient-to-r from-violet-50/90 to-violet-50/30 border-violet-100/80 shadow-[inset_2px_0_0_theme(colors.violet.400)]"
        }`}
      >
        <button
          onClick={() => toggleCollapsed(key)}
          className={`inline-flex items-center gap-1.5 font-bold text-sm transition-colors ${
            neutral ? "text-slate-500 hover:text-slate-700" : "text-violet-900 hover:text-violet-600"
          }`}
        >
          <ChevronRight
            size={15}
            className={`transition-transform ${collapsed ? "" : "rotate-90"} ${neutral ? "text-slate-400" : "text-violet-400"}`}
          />
          <FolderKanban size={14} className={neutral ? "text-slate-400" : "text-violet-500"} />
          {epic ? (
            <>
              {epic.epicKey}
              <span className="font-semibold text-violet-800 max-w-md truncate" title={epic.title}>— {epic.title}</span>
            </>
          ) : (
            "No Epic"
          )}
        </button>
        {epic && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            epic.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
            epic.status === "Completed" ? "bg-blue-50 text-blue-700 border-blue-100" :
            epic.status === "Archived" ? "bg-slate-100 text-slate-500 border-slate-200" :
            "bg-amber-50 text-amber-700 border-amber-100"
          }`}>{epic.status}</span>
        )}
        <span className={`text-[10px] font-semibold whitespace-nowrap ${neutral ? "text-slate-400" : "text-violet-500"}`}>
          {groupStories.length} stor{groupStories.length === 1 ? "y" : "ies"}
          {neutral && " awaiting assignment"}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`h-1.5 w-24 rounded-full overflow-hidden ${neutral ? "bg-slate-200" : "bg-violet-100"}`}>
            <span
              className={`block h-full rounded-full transition-all ${neutral ? "bg-slate-400" : "bg-violet-500"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className={`text-[10px] font-bold tabular-nums ${neutral ? "text-slate-500" : "text-violet-600"}`}>
            {covered}/{groupStories.length} covered
          </span>
        </span>
      </div>
    )
  }

  const stats: Array<{ label: string; value: string; color: string; href?: string }> = [
    { label: "Stories", value: String(stories.length), color: "text-slate-800" },
    { label: "Epics", value: String(epics.length), color: "text-violet-600" },
    { label: "Ranked", value: `${rankedCount}/${stories.length}`, color: "text-indigo-600" },
    { label: "Test Cases ↗", value: testCaseCount === null ? "–" : String(testCaseCount), color: "text-blue-600", href: `/projects/${projectId}/test-cases` },
    { label: "Open Bugs ↗", value: openBugCount === null ? "–" : String(openBugCount), color: "text-red-600", href: `/projects/${projectId}/bug-reports` },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layers size={20} className="text-blue-600" /> Product Backlog
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Rank and plan user stories across epics.
            </p>
          </div>
        </div>
        <Link href={`/projects/${projectId}/requirements`}>
          <Button variant="outline" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs font-medium rounded-xl">
            <ListTree size={14} className="mr-1.5 text-indigo-500" /> Requirements & Traceability
          </Button>
        </Link>
      </div>

      {/* Stat strip */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/50 grid grid-cols-3 sm:grid-cols-5 divide-x divide-slate-100 overflow-hidden">
        {stats.map((s) => {
          const cell = (
            <div className={`px-5 py-4 ${s.href ? "hover:bg-slate-50 transition-colors cursor-pointer" : ""}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">{s.label}</span>
              <span className={`text-2xl font-semibold mt-0.5 block tabular-nums ${s.color}`}>{s.value}</span>
            </div>
          )
          return s.href ? (
            <Link key={s.label} href={s.href}>{cell}</Link>
          ) : (
            <div key={s.label}>{cell}</div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stories..."
            className="w-full h-9 pl-8 pr-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={epicFilter}
          onChange={(e) => setEpicFilter(e.target.value)}
          className="h-9 border border-slate-200 rounded-xl px-2.5 text-xs font-semibold text-slate-600 bg-white"
        >
          <option value="all">All epics</option>
          <option value="none">No Epic</option>
          {epics.map((ep) => (
            <option key={ep.id} value={ep.id}>{ep.epicKey} — {ep.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 border border-slate-200 rounded-xl px-2.5 text-xs font-semibold text-slate-600 bg-white"
        >
          <option value="all">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="ReadyForTesting">Ready for Testing</option>
          <option value="InTesting">In Testing</option>
          <option value="Covered">Covered</option>
          <option value="PartiallyCovered">Partially Covered</option>
          <option value="Failed">Failed</option>
          <option value="Blocked">Blocked</option>
        </select>

        <div className="flex items-center bg-slate-100 rounded-xl p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setGrouped(true)}
            className={`px-3 py-1.5 flex items-center gap-1.5 rounded-[10px] text-xs font-semibold transition-all ${
              grouped ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
            title="Group stories under their epics"
          >
            <ListTree size={13} /> By Epic
          </button>
          <button
            type="button"
            onClick={() => setGrouped(false)}
            className={`px-3 py-1.5 flex items-center gap-1.5 rounded-[10px] text-xs font-semibold transition-all ${
              !grouped ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
            title="One flat ranked list"
          >
            <Rows3 size={13} /> Flat
          </button>
        </div>

        {savingOrder && (
          <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> Saving order…
          </span>
        )}
      </div>

      {filtersActive && !loading && !loadError && (
        <p className="text-[10px] text-slate-400 font-semibold">
          Reordering is disabled while filters are active — clear the search/filters to prioritize.
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm animate-pulse">Loading backlog…</div>
      ) : loadError ? (
        <div className="py-14 text-center border border-red-200 bg-red-50/40 rounded-2xl space-y-3">
          <AlertTriangle className="mx-auto text-red-400 h-8 w-8" />
          <p className="text-sm font-semibold text-red-700">Couldn&apos;t load the backlog</p>
          <p className="text-xs text-red-500 max-w-md mx-auto">{loadError}</p>
          <Button onClick={loadAll} variant="outline" className="h-8 border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold rounded-lg">
            <RefreshCw size={12} className="mr-1.5" /> Retry
          </Button>
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-slate-200 rounded-2xl">
          <p className="text-sm font-semibold text-slate-500">
            {stories.length === 0 ? "No user stories in this project yet." : "No stories match the current filters."}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {stories.length === 0
              ? "Create or import stories on the Requirements page."
              : "Adjust the search, epic, or status filter."}
          </p>
        </div>
      ) : grouped && groups ? (
        <div className="space-y-4">
          {epics
            .filter((ep) => epicFilter === "all" || epicFilter === ep.id)
            .filter((ep) => (groups.byEpic.get(ep.id) || []).length > 0 || epicFilter === ep.id)
            .map((ep) => {
              const groupStories = groups.byEpic.get(ep.id) || []
              return (
                <div key={ep.id} className="space-y-1.5">
                  {renderEpicBand(ep, groupStories)}
                  {!collapsedGroups.has(ep.id) && groupStories.map(renderStoryRow)}
                  {!collapsedGroups.has(ep.id) && groupStories.length === 0 && (
                    <p className="px-4 py-2 text-[11px] text-slate-400 italic">No stories in this epic match the filters.</p>
                  )}
                </div>
              )
            })}
          {(epicFilter === "all" || epicFilter === "none") && groups.noEpic.length > 0 && (
            <div className="space-y-1.5">
              {renderEpicBand(null, groups.noEpic)}
              {!collapsedGroups.has("__none__") && groups.noEpic.map(renderStoryRow)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">{filteredStories.map(renderStoryRow)}</div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white ${
            toast.error ? "bg-red-600" : "bg-slate-800"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
