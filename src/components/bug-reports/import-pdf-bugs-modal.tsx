"use client"

import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  X, Upload, FileText, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Image as ImageIcon,
} from "@/components/ui/icons"
import type { ProjectModule } from "@/components/bug-reports/module-select"

/**
 * Import bugs from the automation's bug report PDF ("تقرير الأخطاء").
 *
 * Upload → the server reads every BUG-NN section and cuts the screenshots out
 * of the PDF → the tester checks the list, fixes any wording the PDF text
 * scrambled, picks module/severity/priority → the kept bugs are created with
 * their screenshots attached. Nothing is created before the last step.
 */

type Level = "Low" | "Medium" | "High" | "Critical"

interface PreviewShot {
  fileName: string
  url: string
  caption: string
  pageUrl: string | null
  width: number
  height: number
}

interface PreviewBug {
  ref: string
  title: string
  severity: Level
  reportStatus: string
  module: string
  testName: string
  impact: string
  requirementText: string
  requirementRef: string
  expectedResult: string
  actualResult: string
  preconditions: string[]
  steps: string[]
  foundAt: string
  pageUrl: string | null
  screenshots: PreviewShot[]
  existing: { id: string; bugKey: string | null; title: string; status: string } | null
}

interface Preview {
  importId: string
  fileName: string
  report: {
    title: string
    subtitle: string
    environment: string
    baseUrl: string
    date: string
    pageCount: number
    bugs: PreviewBug[]
    warnings: string[]
  }
}

interface Draft {
  ref: string
  include: boolean
  title: string
  severity: Level
  priority: Level
  suiteId: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  pageUrl: string | null
  testName: string
  shots: (PreviewShot & { include: boolean })[]
  reportStatus: string
  module: string
  existing: PreviewBug["existing"]
}

interface Result {
  created: { ref: string; id: string; bugKey: string }[]
  failed: { ref: string; error: string }[]
}

const LEVELS: Level[] = ["Critical", "High", "Medium", "Low"]
const ENVIRONMENTS = ["Dev", "Staging", "UAT", "Production"] as const

function guessEnvironment(value: string): (typeof ENVIRONMENTS)[number] {
  const v = value.trim().toLowerCase()
  if (v.startsWith("dev")) return "Dev"
  if (v.includes("uat")) return "UAT"
  if (v.startsWith("prod")) return "Production"
  return "Staging"
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

/** The project module whose name matches the report's "الوحدة" column. */
function matchModule(name: string, modules: ProjectModule[]): string {
  if (!name) return ""
  const n = norm(name)
  return (
    modules.find((m) => norm(m.name) === n)?.id ||
    modules.find((m) => norm(m.path) === n)?.id ||
    modules.find((m) => norm(m.name).includes(n) || n.includes(norm(m.name)))?.id ||
    ""
  )
}

function toDraft(bug: PreviewBug, modules: ProjectModule[]): Draft {
  const steps: string[] = []
  if (bug.preconditions.length) {
    steps.push("الشروط المسبقة:\n" + bug.preconditions.map((p) => `- ${p}`).join("\n"))
  }
  if (bug.steps.length) {
    steps.push("خطوات إعادة المشكلة:\n" + bug.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"))
  }

  const expected = [bug.expectedResult]
  if (bug.requirementRef) expected.push(`مرجع المتطلبات: ${bug.requirementRef}`)
  if (bug.requirementText) expected.push(`نص المتطلبات:\n${bug.requirementText}`)

  const actual = [bug.actualResult]
  if (bug.impact) actual.push(`أثر المشكلة على العمل: ${bug.impact}`)
  const meta = [
    bug.testName && `حالة الاختبار: ${bug.testName}`,
    bug.foundAt && `تاريخ الاكتشاف: ${bug.foundAt}`,
    bug.pageUrl && `الصفحة: ${bug.pageUrl}`,
  ].filter(Boolean)
  if (meta.length) actual.push(meta.join("\n"))

  return {
    ref: bug.ref,
    include: !bug.existing,
    title: bug.title,
    severity: bug.severity,
    priority: bug.severity,
    suiteId: matchModule(bug.module, modules),
    stepsToReproduce: steps.join("\n\n"),
    expectedResult: expected.filter(Boolean).join("\n\n"),
    actualResult: actual.filter(Boolean).join("\n\n"),
    pageUrl: bug.pageUrl,
    testName: bug.testName,
    shots: bug.screenshots.map((s) => ({ ...s, include: true })),
    reportStatus: bug.reportStatus,
    module: bug.module,
    existing: bug.existing,
  }
}

const SEVERITY_TONE: Record<Level, string> = {
  Critical: "bg-red-500/10 text-red-600 border-red-500/30",
  High: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  Medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  Low: "bg-slate-500/10 text-slate-600 border-slate-500/30",
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  modules: ProjectModule[]
  /** Fired after bugs were created so the list behind the dialog reloads. */
  onImported?: () => void
  /** Open a created bug in the page's drawer. */
  onOpenBug?: (bugId: string) => void
}

export default function ImportPdfBugsModal({ projectId, open, onClose, modules, onImported, onOpenBug }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [environment, setEnvironment] = useState<(typeof ENVIRONMENTS)[number]>("Staging")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const selected = useMemo(() => drafts.filter((d) => d.include), [drafts])
  const shotCount = useMemo(
    () => selected.reduce((n, d) => n + d.shots.filter((s) => s.include).length, 0),
    [selected]
  )

  if (!open) return null

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDrafts([])
    setResult(null)
    setError(null)
    setExpanded(null)
  }

  const close = () => {
    if (reading || creating) return
    reset()
    onClose()
  }

  const pick = (f: File | null | undefined) => {
    setError(null)
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose the bug report PDF (.pdf).")
      return
    }
    setFile(f)
  }

  const read = async () => {
    if (!file) return
    setReading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/projects/${projectId}/bug-reports/import-pdf`, { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Could not read the PDF (${res.status})`)
      const p = data as Preview
      setPreview(p)
      setDrafts(p.report.bugs.map((b) => toDraft(b, modules)))
      setEnvironment(guessEnvironment(p.report.environment))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setReading(false)
    }
  }

  const update = (ref: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.ref === ref ? { ...d, ...patch } : d)))

  const toggleShot = (ref: string, fileName: string) =>
    setDrafts((ds) =>
      ds.map((d) =>
        d.ref === ref
          ? { ...d, shots: d.shots.map((s) => (s.fileName === fileName ? { ...s, include: !s.include } : s)) }
          : d
      )
    )

  const create = async () => {
    if (!preview || !selected.length) return
    const untitled = selected.find((d) => !d.title.trim())
    if (untitled) {
      setError(`${untitled.ref} has no title.`)
      setExpanded(untitled.ref)
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports/import-pdf/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: preview.importId,
          fileName: preview.fileName,
          environment,
          bugs: selected.map((d) => ({
            ref: d.ref,
            title: d.title.trim(),
            severity: d.severity,
            priority: d.priority,
            suiteId: d.suiteId || null,
            stepsToReproduce: d.stepsToReproduce,
            expectedResult: d.expectedResult,
            actualResult: d.actualResult,
            pageUrl: d.pageUrl,
            testName: d.testName,
            screenshots: d.shots.filter((s) => s.include).map((s) => s.fileName),
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.created) throw new Error(data.error || `Could not create the bugs (${res.status})`)
      setResult(data as Result)
      if (data.created?.length) onImported?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const allOn = drafts.length > 0 && drafts.every((d) => d.include)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-background rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex flex-col max-h-[92vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-sm text-foreground">Import bugs from PDF</h2>
              <p className="text-xs text-muted-foreground truncate">
                {preview
                  ? `${preview.fileName}`
                  : "Upload the bug report an automation run produced. You can check every bug before it is created."}
              </p>
            </div>
          </div>
          <button onClick={close} className="p-2 rounded-md hover:bg-muted text-muted-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: upload */}
          {!preview && !result && (
            <div className="p-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  pick(e.dataTransfer.files?.[0])
                }}
                onClick={() => fileInput.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                  dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="mt-3 font-medium text-foreground">
                  {file ? file.name : "Drop the PDF here, or click to choose it"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : "Bug report PDFs (تقرير الأخطاء) with BUG-01, BUG-02 … sections and their screenshots"}
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </div>
            </div>
          )}

          {/* Step 2: preview */}
          {preview && !result && (
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span dir="auto" className="text-foreground font-medium">
                  {preview.report.subtitle || preview.report.title}
                </span>
                {preview.report.date && <span>Date: {preview.report.date}</span>}
                {preview.report.baseUrl && <span className="truncate max-w-[260px]">{preview.report.baseUrl}</span>}
                <span>
                  {drafts.length} bugs · {drafts.reduce((n, d) => n + d.shots.length, 0)} screenshots
                </span>
                <label className="flex items-center gap-2 ml-auto">
                  Environment
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="h-8 rounded-md border bg-background px-2 text-foreground"
                  >
                    {ENVIRONMENTS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  {preview.report.environment && (
                    <span className="text-muted-foreground">(report: {preview.report.environment})</span>
                  )}
                </label>
              </div>

              {preview.report.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 space-y-0.5">
                  {preview.report.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                The text is read from the PDF. Open a bug to check its wording before you create it. Some Arabic letter
                pairs can come out of a PDF swapped.
              </p>

              <div className="border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-b text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setDrafts((ds) => ds.map((d) => ({ ...d, include: !allOn })))}
                    aria-label="Select all bugs"
                  />
                  <span className="w-14">Bug</span>
                  <span className="flex-1">Title</span>
                  <span className="w-28">Severity</span>
                  <span className="w-28">Priority</span>
                  <span className="w-44">Module</span>
                  <span className="w-12 text-right">Shots</span>
                </div>

                {drafts.map((d) => {
                  const isOpen = expanded === d.ref
                  return (
                    <div key={d.ref} className={`border-b last:border-b-0 ${d.include ? "" : "opacity-60"}`}>
                      <div className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={d.include}
                          onChange={() => update(d.ref, { include: !d.include })}
                          aria-label={`Import ${d.ref}`}
                        />
                        <button
                          onClick={() => setExpanded(isOpen ? null : d.ref)}
                          className="w-14 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                        >
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {d.ref.replace("BUG-", "#")}
                        </button>
                        <div className="flex-1 min-w-0">
                          <Input
                            dir="auto"
                            value={d.title}
                            onChange={(e) => update(d.ref, { title: e.target.value })}
                            className="h-8 text-xs"
                          />
                          {d.existing && (
                            <p className="mt-1 text-xs text-amber-700">
                              Already in this project as {d.existing.bugKey || "a bug"} ({d.existing.status}). Left
                              unticked.
                            </p>
                          )}
                        </div>
                        <select
                          value={d.severity}
                          onChange={(e) => update(d.ref, { severity: e.target.value as Level })}
                          className={`w-28 h-8 rounded-md border px-2 text-xs font-medium ${SEVERITY_TONE[d.severity]}`}
                        >
                          {LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <select
                          value={d.priority}
                          onChange={(e) => update(d.ref, { priority: e.target.value as Level })}
                          className="w-28 h-8 rounded-md border bg-background px-2 text-xs"
                        >
                          {LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <select
                          value={d.suiteId}
                          onChange={(e) => update(d.ref, { suiteId: e.target.value })}
                          className="w-44 h-8 rounded-md border bg-background px-2 text-xs"
                          title={d.module ? `Report module: ${d.module}` : undefined}
                        >
                          <option value="">{d.module ? `Unfiled (${d.module})` : "Unfiled"}</option>
                          {modules.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.path}
                            </option>
                          ))}
                        </select>
                        <span className="w-12 text-right text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <ImageIcon className="h-3 w-3" />
                          {d.shots.filter((s) => s.include).length}
                        </span>
                      </div>

                      {isOpen && (
                        <div className="px-3 pb-4 pt-1 ml-8 space-y-3">
                          {(d.testName || d.reportStatus) && (
                            <p className="text-xs text-muted-foreground" dir="auto">
                              {d.testName && <span className="font-mono">{d.testName}</span>}
                              {d.reportStatus && <span> · {d.reportStatus}</span>}
                            </p>
                          )}
                          <Field
                            label="Steps to reproduce"
                            value={d.stepsToReproduce}
                            onChange={(v) => update(d.ref, { stepsToReproduce: v })}
                          />
                          <Field
                            label="Expected result"
                            value={d.expectedResult}
                            onChange={(v) => update(d.ref, { expectedResult: v })}
                          />
                          <Field
                            label="Actual result"
                            value={d.actualResult}
                            onChange={(v) => update(d.ref, { actualResult: v })}
                          />
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              Screenshots (click a picture to enlarge, untick to leave it out)
                            </div>
                            {d.shots.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No screenshot found for this bug.</p>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                {d.shots.map((s) => (
                                  <div
                                    key={s.fileName}
                                    className={`w-56 rounded-lg border overflow-hidden ${s.include ? "" : "opacity-50"}`}
                                  >
                                    <button onClick={() => setZoom(s.url)} className="block w-full bg-muted">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={s.url} alt={s.caption || s.fileName} className="w-full h-32 object-cover object-top" />
                                    </button>
                                    <label className="flex items-start gap-2 p-2 text-xs cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={s.include}
                                        onChange={() => toggleShot(d.ref, s.fileName)}
                                        className="mt-0.5"
                                      />
                                      <span dir="auto" className="line-clamp-2 text-muted-foreground">
                                        {s.caption || s.fileName}
                                      </span>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: result */}
          {result && (
            <div className="p-6 space-y-4">
              {result.created.length > 0 && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Created {result.created.length} bug{result.created.length === 1 ? "" : "s"} with their screenshots.
                  </span>
                </div>
              )}
              {result.failed.length > 0 && (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 space-y-1">
                  <div className="font-medium">{result.failed.length} could not be created:</div>
                  {result.failed.map((f) => (
                    <div key={f.ref}>
                      {f.ref}: {f.error}
                    </div>
                  ))}
                </div>
              )}
              <div className="border rounded-xl divide-y">
                {result.created.map((c) => {
                  const d = drafts.find((x) => x.ref === c.ref)
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-xs w-20 text-foreground">{c.bugKey}</span>
                      <span className="text-xs text-muted-foreground w-14">{c.ref}</span>
                      <span dir="auto" className="flex-1 truncate">
                        {d?.title}
                      </span>
                      {onOpenBug && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            onOpenBug(c.id)
                            close()
                          }}
                        >
                          Open
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {preview && !result && `${selected.length} of ${drafts.length} bugs selected · ${shotCount} screenshots`}
          </div>
          <div className="flex items-center gap-2">
            {!preview && !result && (
              <>
                <Button variant="outline" size="sm" onClick={close} disabled={reading}>
                  Cancel
                </Button>
                <Button size="sm" onClick={read} disabled={!file || reading}>
                  {reading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  {reading ? "Reading PDF…" : "Read PDF"}
                </Button>
              </>
            )}
            {preview && !result && (
              <>
                <Button variant="outline" size="sm" onClick={reset} disabled={creating}>
                  Choose another PDF
                </Button>
                <Button size="sm" onClick={create} disabled={!selected.length || creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {creating
                    ? "Creating…"
                    : `Create ${selected.length} bug${selected.length === 1 ? "" : "s"}`}
                </Button>
              </>
            )}
            {result && (
              <Button size="sm" onClick={close}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(10, Math.max(3, value.split("\n").length + 1))}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}
