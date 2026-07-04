"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  GripVertical,
  Search,
  Layers,
  FileText,
  Bug,
  AlertTriangle,
  CloudUpload,
  CloudDownload,
  ExternalLink,
  Loader2,
  CheckCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderKanban,
  ShieldAlert,
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

interface BacklogTestCase {
  id: string
  title: string
  priority: string
  executionType: string
  moduleRelation?: { name: string } | null
  steps: Array<{ id: string }>
}

interface BacklogBug {
  id: string
  bugKey: string | null
  title: string
  severity: string
  priority: string
  status: string
  testCase?: { id: string; title: string } | null
}

type Tab = "stories" | "testcases" | "bugs"
type ViewMode = "flat" | "epic"

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "bg-red-50/70", text: "text-red-700", border: "border-red-100" },
  High: { bg: "bg-orange-50/70", text: "text-orange-700", border: "border-orange-100" },
  Medium: { bg: "bg-amber-50/70", text: "text-amber-700", border: "border-amber-100" },
  Low: { bg: "bg-slate-50/70", text: "text-slate-500", border: "border-slate-150" },
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Draft: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
  ReadyForTesting: { bg: "bg-blue-50/60", text: "text-blue-700", border: "border-blue-100" },
  InTesting: { bg: "bg-indigo-50/60", text: "text-indigo-700", border: "border-indigo-100" },
  Covered: { bg: "bg-emerald-50/60", text: "text-emerald-700", border: "border-emerald-100" },
  PartiallyCovered: { bg: "bg-sky-50/60", text: "text-sky-700", border: "border-sky-100" },
  Failed: { bg: "bg-rose-50/60", text: "text-rose-700", border: "border-rose-100" },
  Blocked: { bg: "bg-amber-50/60", text: "text-amber-800", border: "border-amber-250" },
  Deprecated: { bg: "bg-slate-100", text: "text-slate-400", border: "border-slate-200" },
}

const BUG_STATUS_STYLES: Record<string, string> = {
  Open: "bg-red-50 text-red-700 border-red-100",
  InProgress: "bg-blue-50 text-blue-700 border-blue-100",
  ReadyForRetest: "bg-violet-50 text-violet-700 border-violet-100",
  Reopened: "bg-orange-50 text-orange-700 border-orange-100",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
  Closed: "bg-slate-100 text-slate-500 border-slate-200",
  Rejected: "bg-slate-100 text-slate-400 border-slate-250",
  Duplicate: "bg-slate-100 text-slate-400 border-slate-250",
}

export default function BacklogPage() {
  const params = useParams()
  const projectId = params.id as string

  const [tab, setTab] = useState<Tab>("stories")
  const [viewMode, setViewMode] = useState<ViewMode>("flat")
  const [stories, setStories] = useState<BacklogStory[]>([])
  const [testCases, setTestCases] = useState<BacklogTestCase[]>([])
  const [bugs, setBugs] = useState<BacklogBug[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(new Set())

  const showToast = (text: string, error = false) => {
    setToast({ text, error })
    setTimeout(() => setToast(null), 4000)
  }

  const loadStories = async () => {
    const res = await fetch(`/api/projects/${projectId}/requirements`)
    if (!res.ok) {
      throw new Error(`Failed to load stories: ${res.statusText}`)
    }
    const data = await res.json()
    const list: BacklogStory[] = data.requirements || []
    list.sort((a, b) => {
      if (a.backlogRank !== null && b.backlogRank !== null) return a.backlogRank - b.backlogRank
      if (a.backlogRank !== null) return -1
      if (b.backlogRank !== null) return 1
      return a.requirementKey.localeCompare(b.requirementKey)
    })
    setStories(list)
  }

  const loadAll = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      await Promise.all([
        loadStories(),
        fetch(`/api/projects/${projectId}/test-cases`).then(async (r) => {
          if (!r.ok) throw new Error(`Test cases loading failed: ${r.statusText}`)
          setTestCases((await r.json()).testCases || [])
        }),
        fetch(`/api/projects/${projectId}/bug-reports`).then(async (r) => {
          if (!r.ok) throw new Error(`Bug reports loading failed: ${r.statusText}`)
          setBugs((await r.json()).bugReports || [])
        }),
      ])
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || "Something went wrong while loading backlog data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const q = search.toLowerCase()

  const filteredStories = useMemo(
    () =>
      stories.filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false
        return !q || s.title.toLowerCase().includes(q) || s.requirementKey.toLowerCase().includes(q)
      }),
    [stories, q, statusFilter]
  )
  const storiesFiltered = filteredStories.length !== stories.length

  const filteredTestCases = useMemo(
    () => testCases.filter((tc) => !q || tc.title.toLowerCase().includes(q)),
    [testCases, q]
  )

  const filteredBugs = useMemo(
    () =>
      bugs.filter(
        (b) => !q || b.title.toLowerCase().includes(q) || (b.bugKey || "").toLowerCase().includes(q)
      ),
    [bugs, q]
  )

  // Epic grouped stories computation
  const epicGroupedStories = useMemo(() => {
    const map = new Map<string, { epic: BacklogStory["epic"] | null; stories: BacklogStory[] }>()
    
    // Initialize map
    filteredStories.forEach(s => {
      const key = s.epicId || "no-epic"
      if (!map.has(key)) {
        map.set(key, { epic: s.epic, stories: [] })
      }
      map.get(key)!.stories.push(s)
    })
    
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "no-epic") return 1
      if (b[0] === "no-epic") return -1
      return (a[1].epic?.epicKey || "").localeCompare(b[1].epic?.epicKey || "")
    })
  }, [filteredStories])

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
        showToast("Backlog priority updated successfully!")
      }
    } catch {
      showToast("Network error while saving order", true)
    } finally {
      setSavingOrder(false)
    }
  }

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const next = [...stories]
    const from = next.findIndex((s) => s.id === dragId)
    const to = next.findIndex((s) => s.id === targetId)
    if (from === -1 || to === -1) return
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
        loadStories()
      } else {
        showToast(data.error || "Sync failed", true)
      }
    } catch {
      showToast("Network error during sync", true)
    } finally {
      setSyncingId(null)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/import-stories`,
        { method: "POST" }
      )
      const data = await res.json()
      if (res.ok) {
        showToast(
          `Imported ${data.imported}, updated ${data.updated}${data.skipped ? `, skipped ${data.skipped}` : ""} (of ${data.total} in OpenProject)`
        )
        loadStories()
      } else {
        showToast(data.error || "Import failed", true)
      }
    } catch {
      showToast("Network error during import", true)
    } finally {
      setImporting(false)
    }
  }

  const toggleEpicCollapse = (epicId: string) => {
    setCollapsedEpics(prev => {
      const next = new Set(prev)
      if (next.has(epicId)) {
        next.delete(epicId)
      } else {
        next.add(epicId)
      }
      return next
    })
  }

  // Stats calculation
  const stats = useMemo(() => {
    const total = stories.length
    const covered = stories.filter(s => s.status === "Covered" || s.computedCoverage === "Covered").length
    const totalBugs = bugs.length
    const prioritized = stories.filter(s => s.backlogRank !== null).length
    const coveragePercent = total > 0 ? Math.round((covered / total) * 100) : 0
    const prioritizedPercent = total > 0 ? Math.round((prioritized / total) * 100) : 0
    
    return {
      total,
      covered,
      coveragePercent,
      totalBugs,
      prioritized,
      prioritizedPercent
    }
  }, [stories, bugs])

  const getPriorityBadge = (prio: string) => {
    const st = PRIORITY_STYLES[prio] || PRIORITY_STYLES.Low
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${st.bg} ${st.text} ${st.border}`}>
        {prio}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const st = STATUS_STYLES[status] || STATUS_STYLES.Draft
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${st.bg} ${st.text} ${st.border}`}>
        {status}
      </span>
    )
  }

  const TABS: Array<{ key: Tab; label: string; icon: any; count: number }> = [
    { key: "stories", label: "User Stories", icon: BookOpen, count: stories.length },
    { key: "testcases", label: "Test Cases", icon: FileText, count: testCases.length },
    { key: "bugs", label: "Bugs", icon: Bug, count: bugs.length },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Title & Navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Layers size={22} className="text-blue-600 animate-pulse" /> Product Backlog
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Prioritize requirements, trace test cases coverage, and manage linked active bugs.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importing}
            className="h-9 border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
          >
            {importing ? (
              <Loader2 size={14} className="animate-spin text-blue-600" />
            ) : (
              <CloudDownload size={14} className="text-blue-600" />
            )}
            Import from OpenProject
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && !errorMsg && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4 divide-y-2 md:divide-y-0 md:divide-x divide-slate-50">
          <div className="p-2 space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total User Stories</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{stats.total}</span>
              <span className="text-xs text-slate-400">stories</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.total > 0 ? 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="p-2 space-y-1 pt-4 md:pt-2 md:pl-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Coverage</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-600">{stats.coveragePercent}%</span>
              <span className="text-xs text-slate-400">({stats.covered}/{stats.total})</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.coveragePercent}%` }}
              />
            </div>
          </div>

          <div className="p-2 space-y-1 pt-4 md:pt-2 md:pl-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prioritization Rate</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-indigo-600">{stats.prioritizedPercent}%</span>
              <span className="text-xs text-slate-400">({stats.prioritized} ranked)</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.prioritizedPercent}%` }}
              />
            </div>
          </div>

          <div className="p-2 space-y-1 pt-4 md:pt-2 md:pl-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Bugs</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold ${stats.totalBugs > 0 ? "text-rose-600" : "text-slate-600"}`}>
                {stats.totalBugs}
              </span>
              <span className="text-xs text-slate-400">unresolved</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full transition-all duration-500 ${stats.totalBugs > 0 ? "bg-rose-500" : "bg-slate-300"}`} 
                style={{ width: `${stats.totalBugs > 0 ? 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabs with badge indicators */}
      <div className="bg-slate-100/50 p-1.5 rounded-xl flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1">
          {TABS.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === key
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200/40"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={14} className={tab === key ? "text-blue-600" : ""} /> 
              <span>{label}</span>
              <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                tab === key ? "bg-blue-50 text-blue-700" : "bg-slate-200/70 text-slate-500"
              }`}>{count}</span>
            </button>
          ))}
        </div>

        {tab === "stories" && (
          <div className="flex items-center bg-slate-200/50 rounded-lg p-0.5 border border-slate-200/10">
            <button
              onClick={() => setViewMode("flat")}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "flat"
                  ? "bg-white text-slate-800 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Flat Backlog
            </button>
            <button
              onClick={() => setViewMode("epic")}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "epic"
                  ? "bg-white text-slate-800 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Epic Board
            </button>
          </div>
        )}
      </div>

      {/* Filters & Actions */}
      {!loading && !errorMsg && (
        <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-100 p-3 rounded-2xl shadow-xs">
          <div className="relative flex-1 min-w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === "stories" ? "stories by title/key" : tab === "testcases" ? "test cases" : "bugs"}...`}
              className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400 bg-slate-50/30"
            />
          </div>
          {tab === "stories" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-xl px-3 text-xs font-semibold text-slate-700 bg-slate-50/20 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">All Coverage Statuses</option>
              <option value="Draft">Draft</option>
              <option value="ReadyForTesting">Ready for Testing</option>
              <option value="InTesting">In Testing</option>
              <option value="Covered">Covered</option>
              <option value="PartiallyCovered">Partially Covered</option>
              <option value="Failed">Failed</option>
              <option value="Blocked">Blocked</option>
            </select>
          )}
          {savingOrder && (
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 ml-2 animate-pulse">
              <Loader2 size={12} className="animate-spin text-blue-600" /> Saving order…
            </span>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 border border-slate-100 bg-white rounded-2xl">
          <Loader2 size={32} className="animate-spin text-blue-600" />
          <p className="text-xs text-slate-400 font-medium">Loading backlog datasets...</p>
        </div>
      ) : errorMsg ? (
        <div className="py-16 text-center border border-rose-100 bg-rose-50/20 rounded-2xl flex flex-col items-center justify-center p-6 space-y-4 max-w-2xl mx-auto">
          <ShieldAlert size={40} className="text-rose-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Backlog API Load Failed</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{errorMsg}</p>
          </div>
          <Button 
            onClick={loadAll} 
            variant="outline" 
            className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1"
          >
            <RefreshCw size={12} /> Retry Loading
          </Button>
        </div>
      ) : (
        <>
          {/* ---- TAB: STORIES ---- */}
          {tab === "stories" && (
            filteredStories.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/10 p-6">
                <FolderKanban size={32} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-600 mt-3">No user stories match your criteria.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Create/import stories on the Requirements view, or confirm your search query or filters.
                </p>
              </div>
            ) : viewMode === "flat" ? (
              /* FLAT LIST (DRAGGABLE) */
              <div className="space-y-2">
                {storiesFiltered && (
                  <p className="text-[10px] text-slate-500 font-bold bg-amber-50 border border-amber-100 p-2 rounded-lg flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-amber-600" /> Reordering is locked while filters are active — clear filter keywords to prioritize.
                  </p>
                )}
                <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                  <div className="divide-y divide-slate-100">
                    {filteredStories.map((story, idx) => (
                      <div
                        key={story.id}
                        draggable={!storiesFiltered}
                        onDragStart={() => setDragId(story.id)}
                        onDragEnd={() => { setDragId(null); setOverId(null) }}
                        onDragOver={(e) => { e.preventDefault(); setOverId(story.id) }}
                        onDrop={(e) => { e.preventDefault(); handleDrop(story.id); setOverId(null) }}
                        className={`group flex items-center gap-4 px-4 py-3 transition-all ${
                          overId === story.id && dragId !== story.id
                            ? "bg-blue-50/50 border-y border-blue-200"
                            : "hover:bg-slate-50/30"
                        } ${dragId === story.id ? "opacity-30" : ""}`}
                      >
                        <span
                          className={`shrink-0 text-slate-350 ${
                            storiesFiltered 
                              ? "opacity-25" 
                              : "cursor-grab active:cursor-grabbing group-hover:text-slate-500 transition-colors"
                          }`}
                          title={storiesFiltered ? "Clear filters to reorder" : "Drag to reorder"}
                        >
                          <GripVertical size={16} />
                        </span>
                        
                        <span className="shrink-0 w-8 text-center text-[11px] font-black text-slate-300 group-hover:text-blue-500 transition-colors">
                          {idx + 1}
                        </span>

                        <span className="shrink-0 font-extrabold text-[11px] text-slate-500 w-24 truncate select-all" title={story.requirementKey}>
                          {story.requirementKey}
                        </span>

                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/projects/${projectId}/requirements/${story.id}`}
                            className="text-xs font-bold text-slate-700 hover:text-blue-600 truncate block transition-colors"
                            title={story.title}
                          >
                            {story.title}
                          </Link>
                          {story.epic && (
                            <span className="inline-flex items-center gap-0.5 mt-1 bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-px text-[9px] font-black uppercase">
                              {story.epic.epicKey}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {getPriorityBadge(story.priority)}
                          {getStatusBadge(story.computedCoverage || story.status)}
                          
                          <span className="shrink-0 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-blue-100 flex items-center gap-1">
                            <FileText size={10} />
                            {story.testCases.length}
                          </span>

                          {story.openBugsCount > 0 ? (
                            <span className="shrink-0 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-100 flex items-center gap-1">
                              <AlertTriangle size={10} className="text-rose-500 animate-bounce" /> 
                              {story.openBugsCount}
                            </span>
                          ) : (
                            <span className="shrink-0 w-8 text-center text-slate-200 text-[10px]">—</span>
                          )}

                          <div className="w-24 flex justify-end">
                            {story.openProjectSyncStatus === "Synced" && story.openProjectWorkPackageUrl ? (
                              <a
                                href={story.openProjectWorkPackageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                                title="Open in OpenProject"
                              >
                                <CheckCircle size={11} /> Synced <ExternalLink size={10} />
                              </a>
                            ) : (
                              <button
                                onClick={() => handleSyncStory(story.id)}
                                disabled={syncingId === story.id}
                                className={`shrink-0 flex items-center gap-1 text-[10px] font-bold transition-all px-2 py-1 rounded hover:bg-slate-100 ${
                                  story.openProjectSyncStatus === "Failed"
                                    ? "text-rose-500 hover:text-rose-700"
                                    : "text-slate-400 hover:text-blue-600"
                                }`}
                                title="Push this story to OpenProject"
                              >
                                {syncingId === story.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <CloudUpload size={11} />
                                )}
                                {story.openProjectSyncStatus === "Failed" ? "Retry" : "Sync"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* EPIC GROUPED VIEW */
              <div className="space-y-4">
                {epicGroupedStories.map(([epicKey, { epic, stories: groupStories }]) => {
                  const isCollapsed = collapsedEpics.has(epicKey)
                  const coveredGroup = groupStories.filter(s => s.status === "Covered" || s.computedCoverage === "Covered").length
                  const coverageGroupPercent = groupStories.length > 0 ? Math.round((coveredGroup / groupStories.length) * 100) : 0
                  
                  return (
                    <div 
                      key={epicKey} 
                      className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs transition-all hover:border-slate-200"
                    >
                      {/* Epic Header Band */}
                      <div 
                        onClick={() => toggleEpicCollapse(epicKey)}
                        className="bg-slate-50/50 border-b border-slate-100 px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                          <FolderKanban size={16} className="text-blue-500 shrink-0" />
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {epic ? (
                              <>
                                <span className="bg-violet-50 text-violet-750 text-[10px] font-black border border-violet-100 rounded px-1.5 py-px shrink-0">
                                  {epic.epicKey}
                                </span>
                                <span className="text-xs font-bold text-slate-800 truncate" title={epic.title}>
                                  {epic.title}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-slate-500">Unassigned User Stories (No Epic)</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">Coverage:</span>
                            <span className="text-[10px] font-black text-slate-700">{coveredGroup}/{groupStories.length}</span>
                            <div className="w-16 bg-slate-200/70 rounded-full h-1 mt-0.5 overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-1 rounded-full" 
                                style={{ width: `${coverageGroupPercent}%` }}
                              />
                            </div>
                          </div>
                          <span className="bg-slate-200/50 text-slate-600 px-2 py-0.5 rounded-full text-[9px] font-bold border border-slate-300/10">
                            {groupStories.length} stories
                          </span>
                        </div>
                      </div>

                      {/* Group Stories List */}
                      {!isCollapsed && (
                        <div className="divide-y divide-slate-100">
                          {groupStories.map((story, idx) => (
                            <div
                              key={story.id}
                              className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/10 transition-colors"
                            >
                              <span className="shrink-0 w-8 text-center text-[10px] font-extrabold text-slate-350">
                                {idx + 1}
                              </span>

                              <span className="shrink-0 font-extrabold text-[11px] text-slate-400 w-24 truncate select-all" title={story.requirementKey}>
                                {story.requirementKey}
                              </span>

                              <Link
                                href={`/projects/${projectId}/requirements/${story.id}`}
                                className="flex-1 text-xs font-semibold text-slate-700 hover:text-blue-600 truncate block transition-colors"
                                title={story.title}
                              >
                                {story.title}
                              </Link>

                              <div className="flex items-center gap-2 shrink-0">
                                {getPriorityBadge(story.priority)}
                                {getStatusBadge(story.computedCoverage || story.status)}
                                
                                <span className="shrink-0 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-blue-100 flex items-center gap-1">
                                  <FileText size={10} />
                                  {story.testCases.length}
                                </span>

                                {story.openBugsCount > 0 ? (
                                  <span className="shrink-0 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-100 flex items-center gap-1">
                                    <AlertTriangle size={10} className="text-rose-505" /> 
                                    {story.openBugsCount}
                                  </span>
                                ) : (
                                  <span className="shrink-0 w-8 text-center text-slate-200 text-[10px]">—</span>
                                )}

                                <div className="w-24 flex justify-end">
                                  {story.openProjectSyncStatus === "Synced" && story.openProjectWorkPackageUrl ? (
                                    <a
                                      href={story.openProjectWorkPackageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                                    >
                                      <CheckCircle size={11} /> Synced <ExternalLink size={10} />
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() => handleSyncStory(story.id)}
                                      disabled={syncingId === story.id}
                                      className="shrink-0 flex items-center gap-1 text-[10px] font-bold transition-all text-slate-400 hover:text-blue-600 hover:bg-slate-100 px-2 py-1 rounded"
                                    >
                                      {syncingId === story.id ? (
                                        <Loader2 size={11} className="animate-spin" />
                                      ) : (
                                        <CloudUpload size={11} />
                                      )}
                                      Sync
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ---- TAB: TEST CASES ---- */}
          {tab === "testcases" && (
            filteredTestCases.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/10 p-6">
                <FileText size={32} className="mx-auto text-slate-350" />
                <p className="text-sm font-bold text-slate-600 mt-3">No test cases found in this project.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
                {filteredTestCases.map((tc, idx) => (
                  <div
                    key={tc.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/30 transition-colors"
                  >
                    <span className="shrink-0 w-8 text-center text-[10px] font-bold text-slate-350">{idx + 1}</span>
                    <FileText size={15} className="shrink-0 text-blue-500" />
                    
                    <Link
                      href={`/projects/${projectId}/test-cases`}
                      className="flex-1 truncate text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                      title={tc.title}
                    >
                      {tc.title}
                    </Link>

                    {tc.moduleRelation?.name && (
                      <span className="shrink-0 hidden md:inline text-[10px] font-bold text-slate-400 max-w-[140px] truncate bg-slate-100/50 px-2 py-0.5 rounded border border-slate-200/10">
                        {tc.moduleRelation.name}
                      </span>
                    )}

                    <div className="flex items-center gap-3 shrink-0">
                      {getPriorityBadge(tc.priority)}
                      
                      <span className="shrink-0 bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-150">
                        {tc.executionType}
                      </span>
                      
                      <span className="shrink-0 text-[10px] font-black text-slate-400 w-16 text-right">
                        {tc.steps?.length || 0} steps
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ---- TAB: BUGS ---- */}
          {tab === "bugs" && (
            filteredBugs.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/10 p-6">
                <Bug size={32} className="mx-auto text-slate-350" />
                <p className="text-sm font-bold text-slate-600 mt-3">No bug reports matching your search.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs divide-y divide-slate-100">
                {filteredBugs.map((bug, idx) => (
                  <div
                    key={bug.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/30 transition-colors"
                  >
                    <span className="shrink-0 w-8 text-center text-[10px] font-bold text-slate-350">{idx + 1}</span>
                    <Bug size={14} className="shrink-0 text-rose-500 animate-pulse" />
                    
                    <span className="shrink-0 font-extrabold text-[11px] text-slate-500 w-20 truncate bg-slate-150/40 px-1.5 py-0.5 rounded border border-slate-200/10 select-all">
                      {bug.bugKey || "BUG"}
                    </span>
                    
                    <Link
                      href={`/projects/${projectId}/bug-reports?bugId=${bug.id}`}
                      className="flex-1 truncate text-xs font-semibold text-slate-700 hover:text-rose-600 transition-colors"
                      title={bug.title}
                    >
                      {bug.title}
                    </Link>

                    {bug.testCase && (
                      <span 
                        className="shrink-0 hidden md:flex items-center gap-1 text-[10px] font-bold text-slate-400 max-w-[180px] truncate" 
                        title={`Linked test case: ${bug.testCase.title}`}
                      >
                        <FileText size={11} className="text-slate-300" /> 
                        <span className="truncate">{bug.testCase.title}</span>
                      </span>
                    )}

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        bug.severity === "Critical" ? "bg-red-50 text-red-700 border-red-100" :
                        bug.severity === "High" ? "bg-orange-50 text-orange-700 border-orange-100" :
                        bug.severity === "Medium" ? "bg-amber-55 text-amber-700 border-amber-100" :
                        "bg-slate-50 text-slate-500 border-slate-200"
                      }`}>
                        {bug.severity}
                      </span>
                      
                      <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${BUG_STATUS_STYLES[bug.status] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {bug.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Elegant Toast popup */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white border animate-fade-in-up flex items-center gap-2 ${
            toast.error 
              ? "bg-rose-600 border-rose-500" 
              : "bg-slate-900 border-slate-800"
          }`}
        >
          {toast.error ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
