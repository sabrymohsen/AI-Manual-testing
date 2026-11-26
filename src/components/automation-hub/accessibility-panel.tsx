"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Accessibility,
  Loader2,
  Download,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Filter,
  ChevronDown,
  ChevronRight
} from "@/components/ui/icons"

interface Violation {
  ruleId: string
  severity: "critical" | "serious" | "moderate" | "minor"
  element: string
  description: string
  fix: string
}

interface AccessibilityResult {
  id: string
  testExecutionId: string
  wcagLevel: string
  passCount: number
  violationCount: number
  violations: Violation[]
  createdAt: string
}

interface ScriptRef {
  id: string
  name: string
  accessibilityEnabled: boolean
}

const SEVERITY_META: Record<string, { className: string; order: number }> = {
  critical: { className: "bg-rose-50 text-rose-700 border-rose-200", order: 0 },
  serious: { className: "bg-orange-50 text-orange-700 border-orange-200", order: 1 },
  moderate: { className: "bg-amber-50 text-amber-700 border-amber-200", order: 2 },
  minor: { className: "bg-muted/50 text-muted-foreground border-border", order: 3 }
}

const WCAG_META: Record<string, { className: string; label: string }> = {
  AAA: { className: "bg-emerald-500 text-white", label: "WCAG AAA" },
  AA: { className: "bg-emerald-500 text-white", label: "WCAG AA" },
  A: { className: "bg-amber-500 text-white", label: "WCAG A" },
  None: { className: "bg-rose-500 text-white", label: "Non-compliant" }
}

export default function AccessibilityPanel({
  script,
  onToggle,
  executionId
}: {
  script: ScriptRef | null
  onToggle: (enabled: boolean) => void
  executionId?: string | null
}) {
  const [result, setResult] = useState<AccessibilityResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [severityFilter, setSeverityFilter] = useState("all")
  const [expanded, setExpanded] = useState<number | null>(null)

  const loadResult = useCallback(async () => {
    if (!script) {
      setResult(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/hub/accessibility?scriptId=${script.id}`)
      if (res.ok) {
        const d = await res.json()
        setResult(d.result || null)
      }
    } finally {
      setLoading(false)
    }
  }, [script])

  useEffect(() => {
    loadResult()
  }, [loadResult, executionId])

  const handleToggle = async () => {
    if (!script) return
    const next = !script.accessibilityEnabled
    setToggling(true)
    try {
      const res = await fetch(`/api/hub/scripts/${script.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessibilityEnabled: next })
      })
      if (res.ok) onToggle(next)
    } finally {
      setToggling(false)
    }
  }

  const filteredViolations = useMemo(() => {
    const list = result?.violations || []
    const filtered = severityFilter === "all" ? list : list.filter((v) => v.severity === severityFilter)
    return [...filtered].sort((a, b) => (SEVERITY_META[a.severity]?.order ?? 9) - (SEVERITY_META[b.severity]?.order ?? 9))
  }, [result, severityFilter])

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    for (const v of result?.violations || []) counts[v.severity] = (counts[v.severity] || 0) + 1
    return counts
  }, [result])

  if (!script) {
    return (
      <div className="bg-card border rounded-xl py-20 text-center space-y-2">
        <Accessibility size={26} className="text-slate-300 mx-auto" />
        <p className="text-xs font-medium text-muted-foreground">Select a test script</p>
        <p className="text-xs text-muted-foreground font-medium">Choose a script from the Editor tab to configure its accessibility audit.</p>
      </div>
    )
  }

  const wcag = WCAG_META[result?.wcagLevel || "None"] || WCAG_META.None

  return (
    <div className="space-y-4">
      {/* Toggle + summary bar */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Accessibility size={20} className="text-primary" />
          <div>
            <p className="text-xs font-semibold text-foreground">{script.name}</p>
            <p className="text-xs font-medium text-muted-foreground">WCAG Accessibility Audit</p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="flex items-center gap-2 ml-auto"
        >
          <span className="text-xs font-semibold text-muted-foreground">Enable accessibility audit</span>
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${script.accessibilityEnabled ? "bg-primary" : "bg-slate-300"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${script.accessibilityEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </span>
        </button>
      </div>

      {script.accessibilityEnabled && (
        <div className="bg-primary/10 border border-primary/25 rounded-xl px-3 py-2 text-xs font-semibold text-primary flex items-center gap-2">
          <ShieldCheck size={12} /> Audit enabled — the next run of this script writes a WCAG report parsed into the panel below.
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="bg-card border rounded-xl py-16 flex justify-center"><BusyDot /></div>
      ) : !result ? (
        <div className="bg-card border rounded-xl py-16 text-center space-y-2">
          <AlertTriangle size={24} className="text-slate-300 mx-auto" />
          <p className="text-xs font-medium text-muted-foreground">No accessibility results yet</p>
          <p className="text-xs text-muted-foreground font-medium">
            {script.accessibilityEnabled ? "Run this script to generate a WCAG report." : "Enable the audit above, then run this script."}
          </p>
        </div>
      ) : (
        <>
          {/* Score cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-xl p-4 flex flex-col justify-center ${wcag.className}`}>
              <span className="text-xs font-semibold  opacity-80">Compliance</span>
              <span className="text-lg font-semibold leading-tight">{wcag.label}</span>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <span className="text-xs font-semibold  text-muted-foreground block">Checks passed</span>
              <span className="text-lg font-semibold text-emerald-600 flex items-center gap-2"><CheckCircle2 size={16} /> {result.passCount}</span>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <span className="text-xs font-semibold  text-muted-foreground block">Violations</span>
              <span className="text-lg font-semibold text-rose-600 flex items-center gap-2"><AlertTriangle size={16} /> {result.violationCount}</span>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <span className="text-xs font-semibold  text-muted-foreground block">Audited</span>
              <span className="text-xs font-semibold text-foreground">{new Date(result.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Filter + export bar */}
          <div className="bg-card border rounded-xl p-3 shadow-2xs flex items-center gap-2 flex-wrap">
            <Filter size={12} className="text-muted-foreground" />
            <div className="flex items-center gap-1">
              {["all", "critical", "serious", "moderate", "minor"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold  transition-all ${
                    severityFilter === sev ? "bg-primary text-white" : "bg-muted/50 text-muted-foreground border hover:bg-muted"
                  }`}
                >
                  {sev}{sev !== "all" ? ` ${severityCounts[sev] || 0}` : ""}
                </button>
              ))}
            </div>
            <a
              href={`/api/hub/accessibility/export?scriptId=${script.id}`}
              className="ml-auto inline-flex items-center gap-2 h-8 px-3 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted/50 text-xs font-semibold"
            >
              <Download size={12} /> Download CSV
            </a>
          </div>

          {/* Violations table */}
          <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
            {filteredViolations.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-12">
                {result.violationCount === 0 ? "No violations — the page passed all accessibility checks." : "No violations match this severity filter."}
              </p>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-xs font-semibold  text-muted-foreground ">
                  <span className="col-span-3">Rule</span>
                  <span className="col-span-2">Severity</span>
                  <span className="col-span-7">Element / description</span>
                </div>
                {filteredViolations.map((v, i) => {
                  const sev = SEVERITY_META[v.severity] || SEVERITY_META.minor
                  const isOpen = expanded === i
                  return (
                    <div key={i}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : i)}
                        className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-left hover:bg-muted/50 items-center"
                      >
                        <span className="col-span-3 font-mono font-semibold text-xs text-primary truncate flex items-center gap-1">
                          {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {v.ruleId}
                        </span>
                        <span className="col-span-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${sev.className}`}>{v.severity}</span>
                        </span>
                        <span className="col-span-7 text-xs font-semibold text-muted-foreground truncate">{v.description || v.element}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 pt-1 bg-muted/50 space-y-2 text-xs">
                          <div>
                            <span className="text-xs font-medium text-muted-foreground block">Element</span>
                            <code className="font-mono text-foreground break-all bg-card border rounded px-2 py-0.5 inline-block">{v.element}</code>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground block">Description</span>
                            <span className="text-muted-foreground font-medium">{v.description || "—"}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground block">Suggested fix</span>
                            {/^https?:\/\//.test(v.fix) ? (
                              <a href={v.fix} target="_blank" rel="noreferrer" className="text-primary font-semibold underline break-all">{v.fix}</a>
                            ) : (
                              <span className="text-muted-foreground font-medium">{v.fix || "—"}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
