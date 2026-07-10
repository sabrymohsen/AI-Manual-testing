"use client"

/**
 * Reports workspace — pick scope (All Projects roll-up or a single project) + a
 * role-based template + date range, view the tailored charts/tables, and export
 * to PDF / Word / Excel.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { Button } from "@/components/ui/button"
import { FileText, FileSpreadsheet, FileType, Loader2, RefreshCw } from "lucide-react"
import { ReportBody } from "@/components/reports/sections"
import { REPORT_TEMPLATES, ROLE_ORDER } from "@/lib/reports/templates"
import type { AnyReport, ReportRole } from "@/lib/reports/types"
import { exportPdf, exportDocx, exportXlsx } from "@/lib/reports/export"

const selectClass =
  "flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface ProjOpt { id: string; name: string }

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProjOpt[]>([])
  const [scope, setScope] = useState<string>("org") // "org" | projectId
  const [role, setRole] = useState<ReportRole>("PM")
  const [from, setFrom] = useState(isoDaysAgo(90))
  const [to, setTo] = useState(isoDaysAgo(0))

  const [report, setReport] = useState<AnyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects((d.projects || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const qs = `?from=${from}&to=${to}`
      const url = scope === "org" ? `/api/reports/org${qs}` : `/api/reports/project/${scope}${qs}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) { setError(data.error); setReport(null) }
      else setReport(data.report)
    } catch (err: any) {
      setError(err?.message || "Failed to load report")
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [scope, from, to])

  useEffect(() => { load() }, [load])

  const runExport = async (kind: "pdf" | "docx" | "xlsx") => {
    if (!report) return
    setExporting(kind)
    try {
      if (kind === "xlsx") await exportXlsx(report)
      else if (canvasRef.current) {
        if (kind === "pdf") await exportPdf(canvasRef.current, report)
        else await exportDocx(canvasRef.current, report, REPORT_TEMPLATES[role].label)
      }
    } catch (err: any) {
      setError(`Export failed: ${err?.message || kind}`)
    } finally {
      setExporting(null)
    }
  }

  const scopeName = scope === "org" ? "All Projects" : projects.find((p) => p.id === scope)?.name || "Project"

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold">
      <AppPageHeader
        title="Reports"
        subtitle="Generate role-based QA reports across all projects or per project, with charts and PDF / Word / Excel export."
        breadcrumb="Executive Hub > Reports"
      />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-4 border border-slate-100 shadow-sm rounded-2xl bg-card">
        <div className="space-y-1">
          <label className="block text-[9px] uppercase font-extrabold text-muted-foreground/60">Scope</label>
          <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="org">All Projects (roll-up)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] uppercase font-extrabold text-muted-foreground/60">Template</label>
          <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as ReportRole)}>
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{REPORT_TEMPLATES[r].label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] uppercase font-extrabold text-muted-foreground/60">From</label>
          <input type="date" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] uppercase font-extrabold text-muted-foreground/60">To</label>
          <input type="date" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="h-9">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => runExport("pdf")} disabled={!report || !!exporting} className="h-9">
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />} PDF
          </Button>
          <Button variant="outline" onClick={() => runExport("docx")} disabled={!report || !!exporting} className="h-9">
            {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileType className="h-4 w-4 mr-1" />} Word
          </Button>
          <Button variant="outline" onClick={() => runExport("xlsx")} disabled={!report || !!exporting} className="h-9">
            {exporting === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />} Excel
          </Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Report canvas (captured for PDF/Word export) */}
      <div ref={canvasRef} className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-4" style={{ colorScheme: "light" }}>
        <div className="border-b pb-3">
          <h2 className="text-lg font-extrabold text-slate-800">{scopeName} — {REPORT_TEMPLATES[role].label} Report</h2>
          <p className="text-[10px] text-slate-400 font-medium">
            {REPORT_TEMPLATES[role].audience} · {from} → {to} · generated {report ? new Date(report.generatedAt).toLocaleString() : "—"}
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 animate-pulse">Building report…</div>
        ) : report ? (
          <ReportBody report={report} role={role} />
        ) : (
          <div className="py-16 text-center text-slate-400 italic">No report data.</div>
        )}
      </div>
    </div>
  )
}
