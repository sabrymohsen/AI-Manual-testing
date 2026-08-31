"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildQaReportHtml,
  type QaReportData,
  type QaReportDefect,
  type QaReportService
} from "@/lib/qa-report/template"
import { FileBarChart, X, Plus, Trash2, Download, Loader2, AlertTriangle, Check } from "lucide-react"

/**
 * Compose and download the QA / UAT testing report.
 *
 * Everything is pre-filled from the project — modules from the test suites,
 * defects from the bug list — so the common case is "open, glance, download".
 * The panel exists for the parts a database cannot know: which modules belong
 * in this report, the customer-facing wording of a remark, the overall verdict
 * a QA lead signs off on. The generated file keeps its own edit mode, so this
 * is a starting point rather than the last chance to change anything.
 */

const SERVICE_STATUS = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Need Retest",
  "Passed",
  "Passed with minor issues",
  "Passed with some issues"
]
const PRIORITY = ["Critical", "High", "Medium", "Low"]
const UNFILED = "Unfiled"
const BUG_STATUS = [
  "Open",
  "InProgress",
  "ReadyForRetest",
  "Reopened",
  "Resolved",
  "Closed",
  "Rejected",
  "Duplicate"
]

/** BugStatus values are PascalCase in the database; humans read them spaced. */
function statusLabel(v: string) {
  if (v === "InProgress") return "In Progress"
  if (v === "ReadyForRetest") return "Ready For Retest"
  return v
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  /**
   * Called after a module added here is created in the project, so the page
   * behind the modal can refresh its module filter and pickers without a
   * reload.
   */
  onModulesChanged?: () => void
}

const emptyService: QaReportService = {
  name: "New module",
  total: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  status: "Not Started",
  remarks: ""
}

export default function QaReportModal({ projectId, open, onClose, onModulesChanged }: Props) {
  const [data, setData] = useState<QaReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"details" | "modules" | "defects">("details")
  /**
   * Module rows that exist in the project, keyed by row index.
   *
   * A row added here used to live only inside the generated file: the report
   * listed a module the rest of the app had never heard of, so no defect could
   * be filed against it and it never appeared on the Bug Reports page. Adding a
   * module now creates a real one, and these ids are what say so.
   */
  const [savedModules, setSavedModules] = useState<Record<number, string>>({})
  const [savingModule, setSavingModule] = useState<number | null>(null)
  const [moduleError, setModuleError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setModuleError(null)
    setSavedModules({})
    setTab("details")
    setLoading(true)
    fetch(`/api/projects/${projectId}/qa-report`)
      .then(async res => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || "Could not load the report data")
        const payload = body as QaReportData
        setData(payload)
        // Rows that came from the project start out already saved, so their
        // rename updates that module instead of creating a second one, and the
        // marks show which rows the rest of the app knows about.
        const seeded: Record<number, string> = {}
        payload.services.forEach((svc, i) => {
          if (svc.suiteId) seeded[i] = svc.suiteId
        })
        setSavedModules(seeded)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [open, projectId])

  if (!open) return null

  const patchMeta = (key: keyof QaReportData["meta"], value: string) =>
    setData(d => (d ? { ...d, meta: { ...d.meta, [key]: value } } : d))

  const patchService = (i: number, patch: Partial<QaReportService>) =>
    setData(d =>
      d ? { ...d, services: d.services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : d
    )

  const patchDefect = (i: number, patch: Partial<QaReportDefect>) =>
    setData(d =>
      d ? { ...d, defects: d.defects.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) } : d
    )

  /**
   * Create a module row in the project so the rest of the app can see it.
   *
   * Called when the name is committed rather than when the row appears: the
   * row starts life as the placeholder "New module", and creating a suite by
   * that name on every click would litter the project with them.
   *
   * Idempotent per row — a row already created is renamed rather than
   * duplicated, so editing the name after saving does not leave an orphan.
   */
  const persistModule = async (index: number, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === emptyService.name) return
    // Never create a second suite for a name the project already has: the row
    // may simply be describing a module that came from the project to begin
    // with.
    const existing = (data?.services || []).some(
      (svc, i) => i !== index && svc.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (existing && savedModules[index] === undefined) return

    setSavingModule(index)
    setModuleError(null)
    try {
      const savedId = savedModules[index]
      const res = savedId
        ? await fetch(`/api/projects/${projectId}/test-suites/${savedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed })
          })
        : await fetch(`/api/projects/${projectId}/test-suites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed })
          })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Could not save the module")
      const id = body.suite?.id || savedId
      if (id) setSavedModules(prev => ({ ...prev, [index]: id }))
      onModulesChanged?.()
    } catch (err: any) {
      setModuleError(err.message)
    } finally {
      setSavingModule(null)
    }
  }

  const handleDownload = () => {
    if (!data) return
    const html = buildQaReportHtml(data)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(data.meta.fileName || "QA-Testing-Report").replace(/[\\/:*?"<>|#%]/g, "-")}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onClose()
  }

  /**
   * Module choices for a defect row: every module in the report, plus the one
   * this defect already names if it is not among them — so an unusual value is
   * visible and preserved instead of being silently reset to Unfiled.
   */
  const moduleOptions = (current?: string) => {
    const names = (data?.services || []).map(s => s.name || UNFILED)
    if (!names.includes(UNFILED)) names.push(UNFILED)
    if (current && !names.includes(current)) names.push(current)
    return names
  }

  const totals = (data?.services || []).reduce(
    (acc, s) => ({
      total: acc.total + (Number(s.total) || 0),
      passed: acc.passed + (Number(s.passed) || 0),
      failed: acc.failed + (Number(s.failed) || 0),
      blocked: acc.blocked + (Number(s.blocked) || 0)
    }),
    { total: 0, passed: 0, failed: 0, blocked: 0 }
  )

  const cellSelect = (value: string, options: string[], onChange: (_v: string) => void) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 w-full px-2 rounded-md border text-[11px] bg-background outline-none"
    >
      {options.map(o => (
        <option key={o} value={o}>
          {statusLabel(o)}
        </option>
      ))}
    </select>
  )

  const numberCell = (value: number, onChange: (_v: number) => void) => (
    <Input
      type="number"
      min={0}
      value={value}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
      className="h-8 w-16 text-[11px] text-center px-1"
    />
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="space-y-0.5">
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-indigo-600" /> QA Testing Report
            </h2>
            <p className="text-[11px] text-muted-foreground font-medium">
              Pre-filled from this project. Review, adjust, then download a standalone HTML report
              that stays editable after you send it.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b bg-slate-50/50">
          {([
            ["details", "Report details"],
            ["modules", `Modules (${data?.services.length || 0})`],
            ["defects", `Defects (${data?.defects.length || 0})`]
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`px-3 py-2 text-[11px] font-bold rounded-t-lg transition-colors ${
                tab === key
                  ? "bg-card text-slate-800 border border-b-0"
                  : "text-muted-foreground hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" /> Gathering test results and defects…
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 p-4 rounded-xl bg-rose-50 border border-rose-100 text-[12px] text-rose-700 font-semibold">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {tab === "details" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {([
                      ["title", "Report title"],
                      ["org", "Organization"],
                      ["system", "System"],
                      ["environment", "Environment"],
                      ["dateRange", "Date range"],
                      ["overallStatus", "Overall status"],
                      ["engineer", "QA engineer"],
                      ["reportDate", "Report date"],
                      ["fileName", "Download file name"]
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground/70">
                          {label}
                        </label>
                        <Input
                          value={data.meta[key] || ""}
                          onChange={e => patchMeta(key, e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Test cases", value: totals.total },
                      { label: "Passed", value: totals.passed },
                      { label: "Failed", value: totals.failed },
                      { label: "Blocked", value: totals.blocked },
                      { label: "Defects", value: data.defects.length }
                    ].map(c => (
                      <div
                        key={c.label}
                        className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-center space-y-1"
                      >
                        <div className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground/60">
                          {c.label}
                        </div>
                        <div className="text-lg font-extrabold text-slate-800">{c.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "modules" && (
                <div className="space-y-3">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50">
                        <tr className="text-left">
                          {["Module / Service", "Total", "Passed", "Failed", "Blocked", "Status", "Remarks", ""].map(h => (
                            <th key={h} className="px-2 py-2 font-extrabold uppercase tracking-wide text-[9px] text-muted-foreground/70 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.services.map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 min-w-[200px]">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={s.name}
                                  onChange={e => patchService(i, { name: e.target.value })}
                                  // Committed on blur or Enter, not on every
                                  // keystroke — otherwise a module would be
                                  // created for each letter typed.
                                  onBlur={e => persistModule(i, e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                                  }}
                                  className="h-8 text-[11px]"
                                />
                                {savingModule === i ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />
                                ) : savedModules[i] ? (
                                  <span
                                    title="Saved to the project — this module appears on the Bug Reports page and defects can be filed against it"
                                    className="shrink-0 text-emerald-600"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">{numberCell(s.total, v => patchService(i, { total: v }))}</td>
                            <td className="px-2 py-1.5">{numberCell(s.passed, v => patchService(i, { passed: v }))}</td>
                            <td className="px-2 py-1.5">{numberCell(s.failed, v => patchService(i, { failed: v }))}</td>
                            <td className="px-2 py-1.5">{numberCell(s.blocked, v => patchService(i, { blocked: v }))}</td>
                            <td className="px-2 py-1.5 min-w-[150px]">
                              {cellSelect(s.status, SERVICE_STATUS, v => patchService(i, { status: v }))}
                            </td>
                            <td className="px-2 py-1.5 min-w-[160px]">
                              <Input
                                value={s.remarks}
                                onChange={e => patchService(i, { remarks: e.target.value })}
                                placeholder="Optional note"
                                className="h-8 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setData(d => (d ? { ...d, services: d.services.filter((_, idx) => idx !== i) } : d))
                                  // Rows are tracked by index, so removing one
                                  // shifts every row after it. Without this the
                                  // saved-module marks would slide onto the
                                  // wrong rows — and a later rename would
                                  // rename the wrong module.
                                  //
                                  // The project module itself is deliberately
                                  // left alone: dropping a row from a report
                                  // must not delete a module that test cases
                                  // and defects are filed under.
                                  setSavedModules(prev => {
                                    const next: Record<number, string> = {}
                                    for (const [key, id] of Object.entries(prev)) {
                                      const idx = Number(key)
                                      if (idx < i) next[idx] = id
                                      else if (idx > i) next[idx - 1] = id
                                    }
                                    return next
                                  })
                                }}
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {!data.services.length && (
                          <tr>
                            <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground font-semibold">
                              No test suites in this project yet — add a module row manually.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setData(d => (d ? { ...d, services: [...d.services, { ...emptyService }] } : d))}
                    className="h-8 text-[11px] font-bold"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add module
                  </Button>
                  <p className="text-[10px] text-muted-foreground font-medium mt-2 leading-relaxed">
                    Naming a module saves it to the project, so it appears on the Bug Reports page
                    and defects can be filed against it. Removing a row here only takes it out of
                    this report — the module and everything filed under it stay.
                  </p>
                  {moduleError && (
                    <p className="text-[10px] text-rose-700 font-semibold mt-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" /> {moduleError}
                    </p>
                  )}
                </div>
              )}

              {tab === "defects" && (
                <div className="space-y-3">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50">
                        <tr className="text-left">
                          {["ID", "Title", "Module", "Severity", "Priority", "Status", "Test case", "Assignee", ""].map(h => (
                            <th key={h} className="px-2 py-2 font-extrabold uppercase tracking-wide text-[9px] text-muted-foreground/70 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.defects.map((b, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 w-24">
                              <Input
                                value={b.key}
                                onChange={e => patchDefect(i, { key: e.target.value })}
                                className="h-8 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5 min-w-[240px]">
                              <Input
                                value={b.title}
                                onChange={e => patchDefect(i, { title: e.target.value })}
                                className="h-8 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5 w-40">
                              {cellSelect(
                                b.module || UNFILED,
                                moduleOptions(b.module),
                                v => patchDefect(i, { module: v })
                              )}
                            </td>
                            <td className="px-2 py-1.5 w-28">
                              {cellSelect(b.severity, PRIORITY, v => patchDefect(i, { severity: v }))}
                            </td>
                            <td className="px-2 py-1.5 w-28">
                              {cellSelect(b.priority, PRIORITY, v => patchDefect(i, { priority: v }))}
                            </td>
                            <td className="px-2 py-1.5 w-36">
                              {cellSelect(b.status, BUG_STATUS, v => patchDefect(i, { status: v }))}
                            </td>
                            <td className="px-2 py-1.5 min-w-[140px]">
                              <Input
                                value={b.area}
                                onChange={e => patchDefect(i, { area: e.target.value })}
                                className="h-8 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5 min-w-[120px]">
                              <Input
                                value={b.assignedTo}
                                onChange={e => patchDefect(i, { assignedTo: e.target.value })}
                                className="h-8 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setData(d => (d ? { ...d, defects: d.defects.filter((_, idx) => idx !== i) } : d))
                                }
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {!data.defects.length && (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground font-semibold">
                              No bugs filed for this project yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Removing a defect here only leaves it out of this report — the bug itself is untouched.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-slate-50/60">
          <span className="text-[10px] text-muted-foreground font-semibold">
            Defects are grouped by module in the report. The downloaded file keeps its own Edit, Download and Print buttons.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-[11px] font-bold">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={loading || !!error || !data}
              className="h-8 text-[11px] font-bold"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download report
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
