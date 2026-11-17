"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Activity,
  Flame,
  Award,
  AlertTriangle,
  Clock,
  Zap,
  TrendingDown,
  TrendingUp,
  Minus,
  Settings2,
  CheckCircle,
  HelpCircle,
  Loader2,
  ListRestart
} from "lucide-react"

interface FlakyTestItem {
  id: string
  testName: string
  flakinessScore: number
  totalRuns: number
  failures: number
  retries: number
  rootCause: string
  suggestedFix: string
  trendDirection: string
  lastAnalyzed: string
}

interface KPIs {
  suiteStability: number
  flakyCount: number
  avgActionTime: number
  slowestTest: string
}

export default function FlakeDetectorPage() {
  const params = useParams()
  const projectId = params.id as string

  const [tests, setTests] = useState<FlakyTestItem[]>([])
  const [selectedTest, setSelectedTest] = useState<FlakyTestItem | null>(null)
  const [kpis, setKpis] = useState<KPIs>({
    suiteStability: 100,
    flakyCount: 0,
    avgActionTime: 380,
    slowestTest: "N/A"
  })

  // Timing breakdown details for selected test (simulated base values derived from test metrics)
  const [profilerEnabled, setProfilerEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFlakyData()
  }, [])

  const loadFlakyData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/flakes")
      if (res.ok) {
        const data = await res.json()
        setTests(data.tests || [])
        setKpis(data.kpis)
        if (data.tests?.length > 0) {
          setSelectedTest(data.tests[0])
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Derived mock timeline breakdown based on selected test flakiness severity
  const timelineBreakdown = useMemo(() => {
    if (!selectedTest) return null
    
    // Scale timeline base on flakiness score
    const scale = selectedTest.flakinessScore * 4.2 + 0.8
    const elementIdTime = Math.round(320 * scale)
    const syncWaitTime = Math.round(1200 * scale)
    const screenshotTime = Math.round(450 * (scale > 1.5 ? 1.2 : 0.9))
    const assertionTime = Math.round(180 * scale)
    const total = elementIdTime + syncWaitTime + screenshotTime + assertionTime

    return {
      elementIdTime,
      syncWaitTime,
      screenshotTime,
      assertionTime,
      total
    }
  }, [selectedTest])

  // Mock trend data points for the last 30 days
  const trendDays = Array.from({ length: 30 }, (_, i) => {
    const dayNum = i + 1
    // Flakiness score starting around 45% dropping to 15% (stable downward trend)
    const value = Math.max(8, Math.round(45 - (dayNum * 1.1) + Math.sin(dayNum) * 3))
    return { day: dayNum, val: value }
  })

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-foreground">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="text-indigo-650 animate-pulse h-5 w-5" /> Flake Detector
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Analyze execution timing spikes, dynamic locator stalls, and test retries using SHAFT Flake Profiler.
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px]">
          <span>Profiler attachment parsed: allure-results/</span>
        </div>
      </div>

      {/* KPI Cards Row */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground border bg-card rounded-xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Synchronizing flakiness logs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Suite Stability", val: `${kpis.suiteStability}%`, desc: "Target rate >90%", icon: Award, color: kpis.suiteStability >= 80 ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50" },
            { label: "Flaky Tests", val: kpis.flakyCount, desc: "High flakiness score tests", icon: AlertTriangle, color: kpis.flakyCount > 0 ? "text-rose-600 bg-rose-50 animate-pulse" : "text-muted-foreground bg-muted/50" },
            { label: "Avg Action Time", val: `${kpis.avgActionTime}ms`, desc: "Includes element identification", icon: Clock, color: "text-primary bg-primary/10" },
            { label: "Slowest Test Name", val: kpis.slowestTest.split(".")[0], desc: kpis.slowestTest, icon: Flame, color: "text-amber-600 bg-amber-55" }
          ].map((kpi, idx) => (
            <div key={idx} className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-slate-450">{kpi.label}</span>
                <h3 className="text-xl font-semibold text-foreground block truncate max-w-[170px]">{kpi.val}</h3>
                <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[175px]">{kpi.desc}</p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                <kpi.icon size={18} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Dashboard Content Sections */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left / Center Grid: Leaderboard & Timing Breakdown */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Flaky Test Leaderboard Table */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Unstable Tests Leaderboard</span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b text-[11px] font-medium text-slate-450">
                      <th className="p-3">Test Case Details</th>
                      <th className="p-3 text-center">Flakiness %</th>
                      <th className="p-3 text-center">Runs</th>
                      <th className="p-3 text-center">Fails / Retries</th>
                      <th className="p-3">Primary Root Cause</th>
                      <th className="p-3 text-center">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650">
                    {tests.map(test => {
                      const isSelected = selectedTest?.id === test.id
                      const flPercent = Math.round(test.flakinessScore * 100)
                      const isHigh = flPercent >= 35
                      const badgeColor = isHigh 
                        ? "bg-rose-50 text-rose-700 border-rose-100 animate-pulse" 
                        : "bg-amber-50 text-amber-700 border-amber-100"

                      return (
                        <tr
                          key={test.id}
                          onClick={() => setSelectedTest(test)}
                          className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                            isSelected ? "bg-primary/10 font-semibold" : ""
                          }`}
                        >
                          <td className="p-3 font-semibold text-foreground truncate max-w-[220px]">{test.testName}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${badgeColor}`}>
                              {flPercent}% Flaky
                            </span>
                          </td>
                          <td className="p-3 text-center font-semibold text-foreground">{test.totalRuns}</td>
                          <td className="p-3 text-center font-semibold text-muted-foreground">{test.failures} / {test.retries}</td>
                          <td className="p-3 text-muted-foreground font-medium truncate max-w-[180px]">{test.rootCause}</td>
                          <td className="p-3 text-center">
                            {test.trendDirection === "up" ? (
                              <TrendingUp className="text-rose-500 h-4.5 w-4.5 mx-auto" />
                            ) : test.trendDirection === "down" ? (
                              <TrendingDown className="text-emerald-500 h-4.5 w-4.5 mx-auto" />
                            ) : (
                              <Minus className="text-muted-foreground h-4.5 w-4.5 mx-auto" />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Timeline Timing Breakdown */}
            {selectedTest && timelineBreakdown && (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-[11px] font-medium text-slate-450">
                    Action Timeline Breakdown: {selectedTest.testName.split(".")[1]}
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground font-mono">
                    Total Duration: {timelineBreakdown.total}ms
                  </span>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "Element Identification (Locator query)", val: timelineBreakdown.elementIdTime, color: "bg-blue-500" },
                    { label: "Synchronization Waits (shaft implicit/explicit waits)", val: timelineBreakdown.syncWaitTime, color: "bg-amber-500 animate-pulse" },
                    { label: "Screenshot & Diagnostics Captures", val: timelineBreakdown.screenshotTime, color: "bg-purple-500" },
                    { label: "Assertion Verification Engine", val: timelineBreakdown.assertionTime, color: "bg-primary" }
                  ].map((bar, idx) => {
                    const percentage = Math.round((bar.val / timelineBreakdown.total) * 100)
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-semibold text-slate-650">{bar.label}</span>
                          <span className="font-semibold text-muted-foreground font-mono">{bar.val}ms ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden">
                          <div className={`h-full ${bar.color}`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Fix Suggestions & Profiler Config */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Fix Suggestions Panel */}
            {selectedTest && (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Recommended Heuristics</span>
                <div className="bg-primary/10 border border-indigo-150 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-primary font-semibold text-[10.5px]">
                    <Zap size={13} className="fill-current" /> Suggested Fix Recommendation:
                  </div>
                  <p className="text-slate-650 leading-relaxed font-medium">
                    {selectedTest.suggestedFix}
                  </p>
                  <Button
                    onClick={() => alert("Suggestion details copied to clipboard. Paste this optimization in your test class code!")}
                    className="bg-primary hover:bg-primary/90 text-white rounded-xl w-full h-8.5 text-[10px] font-semibold shadow-xs flex items-center justify-center gap-1.5 mt-2"
                  >
                    Copy Fix Parameters
                  </Button>
                </div>
              </div>
            )}

            {/* Last 30 Days Trend mini list chart */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">30-Day Flakiness Trend</span>
              <div className="h-16 flex items-end justify-between gap-1 select-none">
                {trendDays.filter((_, i) => i % 2 === 0).map((pt, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer">
                    <div
                      className="w-full bg-primary hover:bg-indigo-650 rounded-xs transition-all"
                      style={{ height: `${pt.val * 1.2}px` }}
                      title={`Day ${pt.day}: ${pt.val}% Flakiness`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-[9px] text-muted-foreground font-semibold font-mono">
                <span>30 Days Ago (45% Flakes)</span>
                <span>Today (15% Flakes)</span>
              </div>
            </div>

            {/* Profiler Configuration Switch */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Profiler Configuration</span>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="font-semibold text-foreground block">Flake Profiler Logging</span>
                    <p className="text-[9px] text-muted-foreground font-medium leading-relaxed">
                      Enable execution attachments and timing reports under target/allure-results/.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={profilerEnabled}
                    onChange={(e) => {
                      setProfilerEnabled(e.target.checked)
                      alert("Flake Profiler configuration toggled! Updates will be written to properties/custom.properties.")
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </div>
                <div className="bg-muted/50 border p-2 rounded-xl text-[9px] font-mono text-muted-foreground select-all font-semibold">
                  shaft.flakeProfiler.enabled={profilerEnabled ? "true" : "false"}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
