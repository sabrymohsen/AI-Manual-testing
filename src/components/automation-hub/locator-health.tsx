"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Clock,
  GitBranch,
  Target,
  Flame
} from "lucide-react"

interface LocatorHealth {
  locator: string
  page: string
  strategy: string
  healCount: number
  alternatives: number
  avgConfidence: number
  needsReview: boolean
  lastChanged: string
  stabilityScore: number
  band: "green" | "yellow" | "orange" | "red"
  estResolutionMs: number
  latestRecovered: string
  testName: string
  recommendations: string[]
}

interface Summary {
  total: number
  green: number
  yellow: number
  orange: number
  red: number
  needsReview: number
  avgScore: number
}

const BAND_META: Record<string, { text: string; bg: string; ring: string; label: string }> = {
  green: { text: "text-emerald-700", bg: "bg-emerald-500", ring: "ring-emerald-200", label: "Very stable" },
  yellow: { text: "text-amber-700", bg: "bg-amber-500", ring: "ring-amber-200", label: "Monitor" },
  orange: { text: "text-orange-700", bg: "bg-orange-500", ring: "ring-orange-200", label: "Unstable" },
  red: { text: "text-rose-700", bg: "bg-rose-500", ring: "ring-rose-200", label: "Critical" }
}

function ScoreDot({ score, band }: { score: number; band: string }) {
  const meta = BAND_META[band]
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${meta.bg}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`font-mono font-black text-[10px] ${meta.text}`}>{score}</span>
    </div>
  )
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export default function LocatorHealthPanel() {
  const [locators, setLocators] = useState<LocatorHealth[]>([])
  const [atRisk, setAtRisk] = useState<LocatorHealth[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [pageFilter, setPageFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"stability" | "resolution">("stability")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/hub/locator-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setLocators(d.locators || [])
        setAtRisk(d.atRisk || [])
        setSummary(d.summary || null)
        setPages(d.pages || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const strategies = useMemo(() => Array.from(new Set(locators.map((l) => l.strategy))).sort(), [locators])

  const rows = useMemo(() => {
    let r = [...locators]
    if (pageFilter !== "all") r = r.filter((l) => l.page === pageFilter)
    if (typeFilter !== "all") r = r.filter((l) => l.strategy === typeFilter)
    if (sortBy === "stability") r.sort((a, b) => a.stabilityScore - b.stabilityScore)
    else r.sort((a, b) => b.estResolutionMs - a.estResolutionMs)
    return r
  }, [locators, pageFilter, typeFilter, sortBy])

  if (loading) {
    return (
      <div className="py-20 flex justify-center bg-white border rounded-2xl">
        <Loader2 size={22} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (locators.length === 0) {
    return (
      <div className="py-16 text-center bg-white border rounded-2xl space-y-2">
        <ShieldCheck size={26} className="text-emerald-400 mx-auto" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">No locator health signal yet</p>
        <p className="text-[9.5px] text-slate-400 font-medium max-w-md mx-auto">
          Locator health is derived from self-healing history. Once SHAFT recovers a broken locator, it appears here with a
          stability score and recommendations.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* SUMMARY BAND */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
          <div className="bg-white border rounded-2xl p-3 shadow-sm col-span-2 md:col-span-2 flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0">
              <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke={summary.avgScore >= 90 ? "#10b981" : summary.avgScore >= 70 ? "#f59e0b" : summary.avgScore >= 50 ? "#f97316" : "#f43f5e"}
                  strokeWidth="4"
                  strokeDasharray={`${(summary.avgScore / 100) * 94.2} 94.2`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-800">
                {summary.avgScore}
              </span>
            </div>
            <div>
              <p className="text-[9px] uppercase font-black text-slate-400">Avg Stability</p>
              <p className="text-[10px] font-bold text-slate-600">{summary.total} tracked locators</p>
            </div>
          </div>
          {(["green", "yellow", "orange", "red"] as const).map((b) => (
            <div key={b} className="bg-white border rounded-2xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${BAND_META[b].bg}`} />
                <span className="text-[8px] uppercase font-black text-slate-400">{BAND_META[b].label}</span>
              </div>
              <p className="text-xl font-black text-slate-800 mt-1">{summary[b]}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MAIN TABLE */}
        <div className="lg:col-span-2 bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap p-3 border-b">
            <Target size={14} className="text-indigo-600" />
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Locator Health</span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <select
                value={pageFilter}
                onChange={(e) => setPageFilter(e.target.value)}
                className="h-8 rounded-lg border px-2 text-[9px] bg-slate-50 font-bold cursor-pointer max-w-[150px]"
              >
                <option value="all">All Pages</option>
                {pages.map((p) => (
                  <option key={p} value={p}>
                    {(() => {
                      try {
                        return new URL(p).pathname || p
                      } catch {
                        return p
                      }
                    })()}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 rounded-lg border px-2 text-[9px] bg-slate-50 font-bold cursor-pointer"
              >
                <option value="all">All Types</option>
                {strategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-8 rounded-lg border px-2 text-[9px] bg-slate-50 font-bold cursor-pointer"
              >
                <option value="stability">Sort: Stability ↑</option>
                <option value="resolution">Sort: Resolution ↓</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[9.5px]">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase text-[8px] font-black">
                  <th className="text-left px-3 py-2">Locator</th>
                  <th className="text-left px-2 py-2">Page</th>
                  <th className="text-right px-2 py-2">Resolution (est.)</th>
                  <th className="text-left px-2 py-2">Stability</th>
                  <th className="text-left px-2 py-2">Last Changed</th>
                  <th className="text-center px-3 py-2">Alt.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  let pathLabel = l.page
                  try {
                    pathLabel = new URL(l.page).pathname
                  } catch {}
                  const isOpen = expanded === l.locator
                  return (
                    <Fragment key={l.locator}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : l.locator)}
                        className="border-t hover:bg-indigo-50/40 cursor-pointer"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown size={11} className="text-slate-400 shrink-0" /> : <ChevronRight size={11} className="text-slate-400 shrink-0" />}
                            <span className="inline-block rounded bg-slate-100 border text-slate-500 px-1 text-[7.5px] font-black uppercase shrink-0">
                              {l.strategy}
                            </span>
                            <span className="font-mono text-slate-700 truncate max-w-[200px]">{l.locator}</span>
                            {l.needsReview && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                          </div>
                        </td>
                        <td className="px-2 py-2 font-mono text-slate-400 truncate max-w-[110px]">{pathLabel}</td>
                        <td className="px-2 py-2 text-right font-mono text-amber-600 font-bold">~{l.estResolutionMs}ms</td>
                        <td className="px-2 py-2">
                          <ScoreDot score={l.stabilityScore} band={l.band} />
                        </td>
                        <td className="px-2 py-2 font-mono text-slate-400">{relTime(l.lastChanged)}</td>
                        <td className="px-3 py-2 text-center font-mono font-black text-slate-500">{l.alternatives}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t bg-slate-50/60">
                          <td colSpan={6} className="px-4 py-3 space-y-2.5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase font-black text-slate-400">Latest recovered candidate</span>
                                <p className="font-mono text-[9px] text-indigo-700 break-all bg-white border rounded-lg p-2">{l.latestRecovered}</p>
                              </div>
                              <div className="space-y-1 text-[9px] font-bold text-slate-500">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Recovery confidence</span>
                                  <span className="font-mono">{Math.round(l.avgConfidence * 100)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Heal events</span>
                                  <span className="font-mono">{l.healCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Seen in</span>
                                  <span className="font-mono truncate max-w-[140px]">{l.testName}</span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase font-black text-indigo-600 flex items-center gap-1">
                                <Lightbulb size={10} /> Recommendations
                              </span>
                              <ul className="space-y-1">
                                {l.recommendations.map((r, i) => (
                                  <li key={i} className="text-[9px] text-slate-600 font-medium flex items-start gap-1.5">
                                    <span className="text-indigo-400 mt-0.5">→</span> {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* AT-RISK PANEL */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b bg-rose-50/40">
            <Flame size={14} className="text-rose-500" />
            <span className="text-[10px] uppercase font-black text-rose-600 tracking-wider">At-Risk Locators</span>
          </div>
          <div className="p-2 space-y-1.5 max-h-[520px] overflow-y-auto">
            {atRisk.map((l, i) => {
              const meta = BAND_META[l.band]
              return (
                <button
                  key={l.locator}
                  onClick={() => setExpanded(l.locator)}
                  className="w-full text-left p-2.5 rounded-xl border hover:border-slate-300 bg-white transition-all"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black text-slate-300 w-4">#{i + 1}</span>
                    <span className="inline-block rounded bg-slate-100 border text-slate-500 px-1 text-[7px] font-black uppercase">
                      {l.strategy}
                    </span>
                    <span className={`ml-auto font-mono font-black text-[10px] ${meta.text}`}>{l.stabilityScore}</span>
                  </div>
                  <p className="font-mono text-[9px] text-slate-700 truncate mt-1">{l.locator}</p>
                  <div className="flex items-center gap-2 mt-1 text-[8px] font-bold text-slate-400">
                    <span className="inline-flex items-center gap-0.5">
                      <Clock size={8} /> ~{l.estResolutionMs}ms
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <GitBranch size={8} /> {l.healCount} heals
                    </span>
                    {l.needsReview && (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <AlertTriangle size={8} /> review
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
            {atRisk.length === 0 && (
              <p className="text-[9px] text-slate-400 italic text-center py-8">No at-risk locators — all stable.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
