"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Timer,
  Loader2,
  Gauge,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle
} from "lucide-react"

type WaitBucket = "navigation" | "elementSync" | "lazyLoad" | "validation" | "other"

interface WaitProfile {
  id: string
  testName: string
  methodName: string
  status: string
  actionCount: number
  totalWaitMs: number
  avgWaitMs: number
  maxWaitMs: number
  buckets: Record<WaitBucket, number>
  bucketCounts: Record<WaitBucket, number>
  unnecessary: WaitBucket[]
  perAction: { name: string; bucket: WaitBucket; durationMs: number; status: string }[]
  flakinessScore: number | null
  rootCause: string | null
  suggestedFix: string | null
  recommendations: string[]
}

interface WaitData {
  config: { elementTimeoutSec: number; lazyLoadTimeoutSec: number; networkIdleQuietMs: number }
  profiles: WaitProfile[]
  suite: { testCount: number; totalWaitMs: number; avgWaitMs: number; potentialSavingsMs: number; flaggedTests: number }
}

const BUCKET_META: Record<WaitBucket, { label: string; color: string; text: string }> = {
  navigation: { label: "Navigation / documentReady", color: "bg-sky-500", text: "text-sky-600" },
  elementSync: { label: "Element identification", color: "bg-indigo-500", text: "text-indigo-600" },
  lazyLoad: { label: "Lazy-load (network-idle)", color: "bg-amber-500", text: "text-amber-600" },
  validation: { label: "Validation sync", color: "bg-emerald-500", text: "text-emerald-600" },
  other: { label: "Other", color: "bg-slate-400", text: "text-slate-500" }
}

const BUCKET_ORDER: WaitBucket[] = ["navigation", "elementSync", "lazyLoad", "validation", "other"]

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function WaitAnalysisPanel() {
  const [data, setData] = useState<WaitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/hub/wait-profiler")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const maxTotal = useMemo(() => Math.max(1, ...(data?.profiles || []).map((p) => p.totalWaitMs)), [data])

  if (loading) {
    return (
      <div className="py-20 flex justify-center bg-white border rounded-2xl">
        <Loader2 size={22} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!data || data.profiles.length === 0) {
    return (
      <div className="py-16 text-center bg-white border rounded-2xl space-y-2">
        <Timer size={26} className="text-slate-300 mx-auto" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">No wait profiles yet</p>
        <p className="text-[9.5px] text-slate-400 font-medium max-w-md mx-auto">
          The auto-wait profiler reads action timings from Playwright traces. Run a test in the Tests tab to generate a{" "}
          <span className="font-mono">shaft-trace.zip</span> and its wait breakdown appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* SUITE SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <span className="text-[8px] uppercase font-black text-slate-400 flex items-center gap-1">
            <Timer size={10} /> Total Suite Wait
          </span>
          <p className="text-xl font-black text-slate-800 mt-1">{fmtMs(data.suite.totalWaitMs)}</p>
          <p className="text-[8px] text-slate-400 font-bold">{data.suite.testCount} tests · {data.suite.avgWaitMs}ms avg/action</p>
        </div>
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <span className="text-[8px] uppercase font-black text-slate-400 flex items-center gap-1">
            <TrendingDown size={10} /> Potential Savings
          </span>
          <p className="text-xl font-black text-emerald-600 mt-1">{fmtMs(data.suite.potentialSavingsMs)}</p>
          <p className="text-[8px] text-slate-400 font-bold">from reducible waits</p>
        </div>
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <span className="text-[8px] uppercase font-black text-slate-400 flex items-center gap-1">
            <AlertTriangle size={10} /> Flagged Tests
          </span>
          <p className="text-xl font-black text-amber-600 mt-1">{data.suite.flaggedTests}</p>
          <p className="text-[8px] text-slate-400 font-bold">with reducible waits</p>
        </div>
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <span className="text-[8px] uppercase font-black text-slate-400 flex items-center gap-1">
            <Gauge size={10} /> Configured Timeouts
          </span>
          <p className="text-sm font-black text-slate-800 mt-1.5">
            {data.config.elementTimeoutSec}s <span className="text-slate-400 font-bold text-[9px]">element</span>
          </p>
          <p className="text-[8px] text-slate-400 font-bold">{data.config.lazyLoadTimeoutSec}s lazy-load · {data.config.networkIdleQuietMs}ms idle</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap bg-white border rounded-2xl px-3.5 py-2.5 shadow-sm">
        <span className="text-[8px] uppercase font-black text-slate-400">Wait types</span>
        {BUCKET_ORDER.map((b) => (
          <span key={b} className="inline-flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-sm ${BUCKET_META[b].color}`} /> {BUCKET_META[b].label}
          </span>
        ))}
      </div>

      {/* PER-TEST PROFILES */}
      <div className="space-y-3">
        {data.profiles.map((p) => {
          const isOpen = expanded === p.id
          const total = p.totalWaitMs || 1
          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="p-3.5 space-y-2.5">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  {p.status === "passed" ? (
                    <CheckCircle2 size={13} className="text-emerald-500" />
                  ) : (
                    <XCircle size={13} className="text-rose-500" />
                  )}
                  <span className="font-mono text-[10.5px] font-black text-slate-800">
                    {p.testName}.{p.methodName}
                  </span>
                  {p.flakinessScore !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 text-[8px] font-black uppercase">
                      <Activity size={8} /> {Math.round(p.flakinessScore * 100)}% flaky
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3 text-[9px] font-mono font-bold text-slate-500">
                    <span>
                      Σ <span className="text-slate-800">{fmtMs(p.totalWaitMs)}</span>
                    </span>
                    <span>
                      avg <span className={p.avgWaitMs >= 3000 ? "text-rose-600" : "text-slate-800"}>{fmtMs(p.avgWaitMs)}</span>
                    </span>
                    <span>
                      max <span className={p.maxWaitMs >= data.config.elementTimeoutSec * 1000 * 0.8 ? "text-rose-600" : "text-slate-800"}>{fmtMs(p.maxWaitMs)}</span>
                    </span>
                  </div>
                </div>

                {/* Distribution bar */}
                <div className="space-y-1.5">
                  <div className="flex h-3.5 rounded-lg overflow-hidden border bg-slate-50">
                    {BUCKET_ORDER.map((b) => {
                      const ms = p.buckets[b]
                      if (ms <= 0) return null
                      const pct = (ms / total) * 100
                      const flagged = p.unnecessary.includes(b)
                      return (
                        <div
                          key={b}
                          className={`${BUCKET_META[b].color} h-full ${flagged ? "opacity-60 ring-1 ring-inset ring-rose-500" : ""}`}
                          style={{ width: `${pct}%` }}
                          title={`${BUCKET_META[b].label}: ${fmtMs(ms)} (${pct.toFixed(0)}%)${flagged ? " · reducible" : ""}`}
                        />
                      )
                    })}
                  </div>
                  {/* Bucket chips */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {BUCKET_ORDER.filter((b) => p.bucketCounts[b] > 0).map((b) => {
                      const flagged = p.unnecessary.includes(b)
                      return (
                        <span
                          key={b}
                          className={`inline-flex items-center gap-1 text-[8.5px] font-bold ${flagged ? "text-rose-600" : BUCKET_META[b].text}`}
                        >
                          <span className={`h-2 w-2 rounded-sm ${BUCKET_META[b].color}`} />
                          {fmtMs(p.buckets[b])}
                          {flagged && (
                            <span className="inline-flex items-center gap-0.5 text-rose-600 font-black uppercase">
                              <Zap size={8} /> reducible
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Recommendations */}
                {p.recommendations.length > 0 && (
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-2.5 space-y-1">
                    <span className="text-[8px] uppercase font-black text-indigo-600 flex items-center gap-1">
                      <Lightbulb size={9} /> Recommendations
                    </span>
                    <ul className="space-y-0.5">
                      {p.recommendations.map((r, i) => (
                        <li key={i} className="text-[9px] text-slate-600 font-medium flex items-start gap-1.5">
                          <span className="text-indigo-400 mt-0.5">→</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Expand per-action */}
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 hover:text-slate-700"
                >
                  {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {p.actionCount} actions
                </button>
              </div>

              {isOpen && (
                <div className="border-t bg-slate-50/60 p-3 space-y-1">
                  {p.perAction.map((a, i) => {
                    const meta = BUCKET_META[a.bucket]
                    const pct = (a.durationMs / (p.maxWaitMs || 1)) * 100
                    return (
                      <div key={i} className="flex items-center gap-2 text-[9px]">
                        <span className="w-4 text-slate-300 font-black text-[8px]">#{i + 1}</span>
                        <span className={`h-2 w-2 rounded-sm shrink-0 ${meta.color}`} />
                        <span className="font-bold text-slate-700 w-32 truncate">{a.name}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${meta.color}`} style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                        <span className={`font-mono font-bold w-14 text-right ${a.durationMs >= 3000 ? "text-rose-600" : "text-slate-500"}`}>
                          {fmtMs(a.durationMs)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
