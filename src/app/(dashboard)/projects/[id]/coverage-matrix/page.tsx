"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  FileSpreadsheet,
  Download,
  Layers,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Bug,
  Search,
  ArrowRight
} from "@/components/ui/icons"
import * as XLSX from "xlsx"

interface MatrixRow {
  id: string
  requirementKey: string
  title: string
  priority: string
  epic: { id: string; epicKey: string; title: string } | null
  feature: string | null
  coverageStatus: string
  risk: "High" | "Medium" | "Low"
  linkedTestCases: Array<{
    id: string
    title: string
    priority: string
  }>
  openBugs: Array<{
    id: string
    title: string
    severity: string
    priority: string
  }>
}

export default function CoverageMatrixPage() {
  const params = useParams()
  const projectId = params.id as string

  const [matrixData, setMatrixData] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [groupByEpic, setGroupByEpic] = useState(true)

  useEffect(() => {
    fetchMatrixData()
  }, [projectId])

  const fetchMatrixData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/coverage-matrix`)
      if (res.ok) {
        const data = await res.json()
        setMatrixData(data.matrix || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  // Filter matrix
  const filteredMatrix = matrixData.filter((row) => {
    const searchLower = search.toLowerCase()
    const matchSearch =
      row.requirementKey.toLowerCase().includes(searchLower) ||
      row.title.toLowerCase().includes(searchLower) ||
      (row.feature && row.feature.toLowerCase().includes(searchLower))

    if (!matchSearch) return false
    if (riskFilter !== "ALL" && row.risk !== riskFilter) return false
    if (statusFilter !== "ALL" && row.coverageStatus !== statusFilter) return false

    return true
  })

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredMatrix.map((r) => ({
      "Requirement Key": r.requirementKey,
      "Requirement Title": r.title,
      "Epic": r.epic ? `${r.epic.epicKey} — ${r.epic.title}` : "No Epic",
      "Feature": r.feature || "N/A",
      "Priority": r.priority,
      "Coverage Status": r.coverageStatus,
      "Risk Level": r.risk,
      "Linked Test Cases": r.linkedTestCases.map(tc => tc.title).join(", ") || "None",
      "Open Bugs": r.openBugs.map(b => `${b.title} [${b.severity}]`).join(", ") || "None"
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Traceability Matrix")
    XLSX.writeFile(workbook, `Requirements_Traceability_Matrix_${projectId}.xlsx`)
  }

  // Export to Markdown
  const handleExportMarkdown = () => {
    let md = `# Requirements Traceability Matrix - Project ${projectId}\n\n`
    md += `| Requirement Key | Title | Feature | Priority | Coverage Status | Risk | Test Cases | Bugs |\n`
    md += `| --- | --- | --- | --- | --- | --- | --- | --- |\n`

    filteredMatrix.forEach((r) => {
      const casesStr = r.linkedTestCases.map(tc => tc.title).join("<br>") || "None"
      const bugsStr = r.openBugs.map(b => `${b.title} (${b.severity})`).join("<br>") || "None"
      md += `| **${r.requirementKey}** | ${r.title} | ${r.feature || "Unassigned"} | ${r.priority} | ${r.coverageStatus} | **${r.risk}** | ${casesStr} | ${bugsStr} |\n`
    })

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `Traceability_Matrix_${projectId}.md`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Export to JSON
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(filteredMatrix, null, 2)], { type: "application/json;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `Traceability_Matrix_${projectId}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Badges formatting
  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "High":
        return <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">High Risk</span>
      case "Medium":
        return <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-255">Medium Risk</span>
      default:
        return <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200">Low Risk</span>
    }
  }

  const getCoverageBadge = (cov: string) => {
    switch (cov) {
      case "Covered":
        return <span className="text-xs font-medium bg-green-95 text-green-700 px-2 py-0.5 rounded-full">Covered</span>
      case "PartiallyCovered":
        return <span className="text-xs font-medium bg-yellow-95 text-yellow-700 px-2 py-0.5 rounded-full">Partial</span>
      case "Uncovered":
        return <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Uncovered</span>
      case "Failed":
        return <span className="text-xs font-medium bg-red-95 text-red-700 px-2 py-0.5 rounded-full">Failed</span>
      case "Blocked":
        return <span className="text-xs font-medium bg-orange-95 text-orange-700 px-2 py-0.5 rounded-full">Blocked</span>
      case "NotExecuted":
        return <span className="text-xs font-medium bg-blue-95 text-blue-700 px-2 py-0.5 rounded-full">Not Executed</span>
      default:
        return <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{cov}</span>
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl text-foreground">
      
      {/* Header breadcrumbs & actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-6 gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-blue-600 ">
              Traceability Matrix
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Multi-dimensional verification mapping (Requirement → Test Cases → Execution Result → Open Bugs).</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2 h-9 px-4 rounded-xl text-xs shadow-md">
            <Download size={14} /> Export Excel
          </Button>
          <Button onClick={handleExportMarkdown} variant="outline" className="border-border hover:bg-muted/50 text-foreground font-medium flex items-center gap-2 h-9 px-4 rounded-xl text-xs">
            <Layers size={14} /> Export Markdown
          </Button>
          <Button onClick={handleExportJson} variant="outline" className="border-border hover:bg-muted/50 text-foreground font-medium flex items-center gap-2 h-9 px-4 rounded-xl text-xs">
            <Download size={14} /> Export JSON
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by key, title, module..."
            className="w-full bg-muted/50 border border-border pl-8 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
          />
        </div>

        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="px-3 py-2 border border-border bg-card rounded-xl text-xs focus:outline-none text-foreground font-semibold"
        >
          <option value="ALL">All Risk Levels</option>
          <option value="High">High Risk</option>
          <option value="Medium">Medium Risk</option>
          <option value="Low">Low Risk</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-border bg-card rounded-xl text-xs focus:outline-none text-foreground font-semibold"
        >
          <option value="ALL">All Coverage Statuses</option>
          <option value="Covered">Covered</option>
          <option value="PartiallyCovered">Partially Covered</option>
          <option value="Uncovered">Uncovered</option>
          <option value="Failed">Failed</option>
          <option value="Blocked">Blocked</option>
          <option value="NotExecuted">Not Executed</option>
        </select>

        <button
          type="button"
          onClick={() => setGroupByEpic(v => !v)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
            groupByEpic ? "bg-violet-600 text-white border-violet-600" : "bg-card border-border hover:bg-muted/50 text-muted-foreground"
          }`}
          title="Group requirements under their parent epics"
        >
          Group by Epic
        </button>
      </div>

      {/* Matrix Tree List */}
      <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20">
            <BusyDot />
            <p className="text-muted-foreground text-sm">Compiling project traceability records...</p>
          </div>
        ) : filteredMatrix.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground ">No matrix records matched.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="p-4 w-24">Req Key</th>
                  <th className="p-4 w-48">Requirement Title</th>
                  <th className="p-4 w-40">Feature</th>
                  <th className="p-4 w-32">Coverage Status</th>
                  <th className="p-4 w-28">Risk Factor</th>
                  <th className="p-4">Linked Test Cases</th>
                  <th className="p-4 w-44">Related Bugs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-foreground">
                {(groupByEpic
                  ? (() => {
                      // Group rows under epic headers, No-Epic bucket last
                      const groups = new Map<string, { label: string; rows: MatrixRow[] }>()
                      filteredMatrix.forEach((row) => {
                        const key = row.epic?.id || "__none__"
                        const label = row.epic ? `${row.epic.epicKey} — ${row.epic.title}` : "No Epic"
                        const g = groups.get(key) || { label, rows: [] }
                        g.rows.push(row)
                        groups.set(key, g)
                      })
                      const ordered = Array.from(groups.entries()).sort(([a], [b]) =>
                        a === "__none__" ? 1 : b === "__none__" ? -1 : 0
                      )
                      return ordered.flatMap(([key, group]) => {
                        const covered = group.rows.filter((r) => r.coverageStatus === "Covered").length
                        return [
                          <tr key={`epic-${key}`} className={key === "__none__" ? "bg-muted/50 border-y border-border" : "bg-violet-50/60 border-y border-violet-100/80"}>
                            <td colSpan={7} className="px-4 py-3">
                              <span className={`text-xs font-semibold ${key === "__none__" ? "text-muted-foreground" : "text-violet-900"}`}>
                                {group.label}
                              </span>
                              <span className={`ml-3 text-xs font-semibold ${key === "__none__" ? "text-muted-foreground" : "text-violet-500"}`}>
                                {group.rows.length} stor{group.rows.length === 1 ? "y" : "ies"} · {covered}/{group.rows.length} covered
                              </span>
                            </td>
                          </tr>,
                          ...group.rows.map(renderMatrixRow)
                        ]
                      })
                    })()
                  : filteredMatrix.map(renderMatrixRow))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )

  function renderMatrixRow(row: MatrixRow) {
    return (
                  <tr key={row.id} className="hover:bg-muted/50 transition-colors align-top">
                    <td className="p-4 font-semibold text-foreground">{row.requirementKey}</td>
                    <td className="p-4 font-semibold text-foreground">
                      <Link href={`/projects/${projectId}/requirements/${row.id}`} className="hover:text-blue-600 hover:underline">
                        {row.title}
                      </Link>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {row.feature || "Unassigned"}
                    </td>
                    <td className="p-4">{getCoverageBadge(row.coverageStatus)}</td>
                    <td className="p-4">{getRiskBadge(row.risk)}</td>
                    
                    {/* Linked Cases Checklist */}
                    <td className="p-4 space-y-2">
                      {row.linkedTestCases.length === 0 ? (
                        <span className="text-slate-500 text-xs">No test cases linked</span>
                      ) : (
                        row.linkedTestCases.map((tc) => (
                          <div key={tc.id} className="bg-muted/50 border border-border p-2 rounded-lg flex items-center justify-between gap-2">
                            <Link href={`/projects/${projectId}/test-cases/${tc.id}/edit`} className="font-semibold text-foreground hover:text-blue-600 truncate max-w-[200px]">
                              {tc.title}
                            </Link>
                            <span className="text-xs text-muted-foreground font-mono">({tc.priority})</span>
                          </div>
                        ))
                      )}
                    </td>

                    {/* Related Bugs list */}
                    <td className="p-4 space-y-2">
                      {row.openBugs.length === 0 ? (
                        <span className="text-muted-foreground text-xs">-</span>
                      ) : (
                        row.openBugs.map((bug) => (
                          <div key={bug.id} className="bg-red-50/20 border border-red-100 p-2 rounded-lg flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-red-800 truncate max-w-[120px]" title={bug.title}>
                              {bug.title}
                            </span>
                            <span className="text-xs bg-red-100 text-red-700 font-semibold px-1 rounded">
                              {bug.severity}
                            </span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
    )
  }
}
