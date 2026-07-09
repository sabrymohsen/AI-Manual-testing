"use client"

import { useRef, useState } from "react"
import { Upload, X, Loader2, BookMarked, ArrowLeft, CheckCircle2 } from "lucide-react"
import * as XLSX from "xlsx"

/**
 * Simplified "Import user stories" flow for the board. Unlike the full
 * requirements importer, this maps only Summary / Description / Acceptance
 * criteria / Priority — story keys are auto-generated (STORY-###) and every row
 * lands in the backlog as a Draft story.
 */

type FieldKey = "summary" | "description" | "acceptanceCriteria" | "priority"
const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "summary", label: "Summary", required: true },
  { key: "description", label: "Description" },
  { key: "acceptanceCriteria", label: "Acceptance criteria" },
  { key: "priority", label: "Priority" },
]

const normPriority = (v: unknown): "Low" | "Medium" | "High" | "Critical" => {
  const s = String(v ?? "").trim().toLowerCase()
  if (/crit|urgent|highest|p0|p1|حرج|عاجل/.test(s)) return "Critical"
  if (/high|p2|عالي|مرتفع/.test(s)) return "High"
  if (/low|minor|p4|p5|منخفض/.test(s)) return "Low"
  return "Medium"
}

export default function ImportStoriesModal({
  projectId, isOpen, onClose, onImported,
}: {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [map, setMap] = useState<Record<FieldKey, string>>({ summary: "", description: "", acceptanceCriteria: "", priority: "" })
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const reset = () => { setHeaders([]); setRows([]); setMap({ summary: "", description: "", acceptanceCriteria: "", priority: "" }); setError(null); setProgress(null) }
  const close = () => { reset(); onClose() }

  const readFile = (file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
        if (json.length < 2) { setError("The file has no data rows."); return }
        const hdrs = (json[0] as string[]).map((h) => String(h ?? "").trim())
        const body = (json.slice(1) as any[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
        // Auto-guess the 4 columns from header names (EN + AR).
        const guess: Record<FieldKey, string> = { summary: "", description: "", acceptanceCriteria: "", priority: "" }
        hdrs.forEach((h, i) => {
          const l = h.toLowerCase()
          if (!guess.summary && /(summary|title|story|name|عنوان|اسم)/.test(l)) guess.summary = String(i)
          else if (!guess.acceptanceCriteria && /(accept|criteria|معايير|شروط)/.test(l)) guess.acceptanceCriteria = String(i)
          else if (!guess.description && /(desc|detail|وصف)/.test(l)) guess.description = String(i)
          else if (!guess.priority && /(priorit|severity|أولوية|اولوية)/.test(l)) guess.priority = String(i)
        })
        setHeaders(hdrs)
        setRows(body)
        setMap(guess)
      } catch {
        setError("Could not read the file. Make sure it's a valid Excel or CSV file.")
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const runImport = async () => {
    if (map.summary === "") { setError("Map the Summary column first."); return }
    setImporting(true)
    setError(null)
    try {
      // Find the highest existing STORY-### so new keys continue the series.
      const existRes = await fetch(`/api/projects/${projectId}/requirements`)
      const existing = existRes.ok ? (await existRes.json()).requirements || [] : []
      let maxNum = 0
      for (const s of existing) { const m = String(s.requirementKey).match(/^STORY-(\d+)$/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)) }

      const valid = rows.filter((r) => String(r[Number(map.summary)] ?? "").trim() !== "")
      setProgress({ done: 0, total: valid.length })
      let created = 0
      for (const r of valid) {
        const cell = (k: FieldKey) => (map[k] === "" ? null : String(r[Number(map[k])] ?? "").trim() || null)
        const key = `STORY-${String(maxNum + created + 1).padStart(3, "0")}`
        const res = await fetch(`/api/projects/${projectId}/requirements`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requirementKey: key,
            title: cell("summary"),
            description: cell("description"),
            acceptanceCriteria: cell("acceptanceCriteria"),
            priority: map.priority === "" ? "Medium" : normPriority(r[Number(map.priority)]),
            status: "Draft",
            source: "ExcelImport",
          }),
        }).catch(() => null)
        if (res && res.ok) created++
        setProgress({ done: created, total: valid.length })
      }
      onImported()
      close()
    } finally {
      setImporting(false)
    }
  }

  const previewRows = rows.slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={close}>
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-emerald-600" />
            <h3 className="font-black text-slate-900 dark:text-slate-100">Import user stories</h3>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[68vh] overflow-y-auto">
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-200/60 rounded-lg px-3 py-2">{error}</p>}

          {headers.length === 0 ? (
            /* Step 1 — upload */
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) readFile(e.dataTransfer.files[0]) }}
              className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors flex flex-col items-center gap-3"
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><Upload className="h-6 w-6" /></div>
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Drop your stories sheet, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-0.5">Excel or CSV · we only need Summary, Description, Acceptance criteria, Priority</p>
              </div>
            </div>
          ) : (
            /* Step 2 — map the four columns */
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground">Match your columns · <span className="text-slate-700 dark:text-slate-200">{rows.length} rows</span></p>
                <button onClick={reset} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Choose another file</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      {f.label}{f.required && <span className="text-red-500"> *</span>}
                    </label>
                    <select
                      value={map[f.key]}
                      onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background"
                    >
                      <option value="">— Not in file —</option>
                      {headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {map.summary !== "" && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/40 text-[11px] font-black uppercase tracking-wide text-muted-foreground">Preview</div>
                  <div className="divide-y max-h-48 overflow-y-auto">
                    {previewRows.map((r, i) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <BookMarked className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{String(r[Number(map.summary)] ?? "").trim() || <em className="text-muted-foreground">（empty summary — skipped）</em>}</span>
                        {map.priority !== "" && <span className="text-[10px] font-bold text-muted-foreground">{normPriority(r[Number(map.priority)])}</span>}
                      </div>
                    ))}
                    {rows.length > previewRows.length && <div className="px-3 py-1.5 text-[11px] text-muted-foreground">+ {rows.length - previewRows.length} more…</div>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {headers.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t">
            <span className="text-xs font-semibold text-muted-foreground">
              {progress ? `Imported ${progress.done} of ${progress.total}…` : "New stories land in the Backlog as Draft."}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={close} className="h-9 px-4 rounded-lg border text-sm font-semibold">Cancel</button>
              <button onClick={runImport} disabled={importing || map.summary === ""} className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50 flex items-center gap-1.5">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Import stories
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
