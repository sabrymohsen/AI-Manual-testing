"use client"

import { BusyDot, SkeletonLines } from "@/components/ui/skeleton"
import { useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useScrumUI } from "@/stores/scrum-ui"
import { useScrumSprints, useScrumEpics } from "@/hooks/scrum/use-scrum"
import type { TaskType } from "@/types/scrum"
import { TYPE_META } from "@/components/scrum/task/task-detail-config"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Download, FileSpreadsheet, ListChecks, Search, Upload, X } from "@/components/ui/icons"

type ImportSource = "file" | "testCases"

/** Columns the file import understands; header cells are auto-matched against the aliases. */
const FILE_FIELDS = [
  { key: "title", label: "Title", required: true, aliases: ["title", "summary", "name", "user story", "story"] },
  { key: "description", label: "Description", aliases: ["description", "details", "acceptance criteria"] },
  { key: "type", label: "Type", aliases: ["type", "issue type", "issuetype"] },
  { key: "priority", label: "Priority", aliases: ["priority", "prio", "severity"] },
  { key: "status", label: "Status", aliases: ["status", "state", "column"] },
  { key: "storyPoints", label: "Story points", aliases: ["story points", "points", "estimate", "sp"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels", "label"] },
] as const

type FieldKey = (typeof FILE_FIELDS)[number]["key"]
type Mapping = Partial<Record<FieldKey, number>>

const IMPORT_TYPES: TaskType[] = ["STORY", "TASK", "BUG", "TEST_CASE"]

// One example per supported type so the Type column is self-documenting.
const TEMPLATE_CSV =
  "Title,Description,Type,Priority,Status,Story Points,Tags\n" +
  'As a user I can reset my password,"Given a registered user, when they request a reset link…",User Story,High,To Do,3,"auth, email"\n' +
  "Verify login with invalid credentials,Expect an inline error and no session cookie,Test Case,Medium,To Do,1,auth\n" +
  "Checkout fails with a saved card,Spinner never resolves after pressing Pay,Bug,Critical,To Do,,checkout\n" +
  "Upgrade Prisma to v6,Blocked on the schema-engine change,Task,Low,To Do,2,infra\n"

interface PickerTestCase {
  id: string
  title: string
  priority: string
  executionType: string
  tags: string[]
  alreadyImported: boolean
}

interface ImportResult {
  created: number
  skipped: { row: number; title: string; reason: string }[]
}

export function ImportModal({ projectId }: { projectId: string }) {
  const { importOpen, setImportOpen } = useScrumUI()
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)
  const qc = useQueryClient()

  const [source, setSource] = useState<ImportSource>("file")
  const [sprintId, setSprintId] = useState("none")
  const [epicId, setEpicId] = useState("none")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── File mode state ──
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [defaultType, setDefaultType] = useState<TaskType>("STORY")
  const [dragging, setDragging] = useState(false)

  // ── Test-case mode state ──
  const [tcSearch, setTcSearch] = useState("")
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set())

  const { data: picker, isLoading: pickerLoading } = useQuery({
    queryKey: ["scrum", projectId, "import-testcases"],
    queryFn: async (): Promise<{ testCases: PickerTestCase[] }> => {
      const res = await fetch(`/api/projects/${projectId}/scrum/tasks/import`)
      if (!res.ok) throw new Error("Failed to load test cases")
      return res.json()
    },
    enabled: importOpen && source === "testCases",
  })

  const visibleTestCases = useMemo(() => {
    const list = picker?.testCases ?? []
    const q = tcSearch.trim().toLowerCase()
    return q ? list.filter((tc) => tc.title.toLowerCase().includes(q)) : list
  }, [picker, tcSearch])

  const importableVisible = visibleTestCases.filter((tc) => !tc.alreadyImported)

  function resetAll() {
    setSource("file")
    setSprintId("none"); setEpicId("none")
    setFileName(null); setHeaders([]); setRows([]); setMapping({}); setDefaultType("STORY"); setDragging(false)
    setTcSearch(""); setSelectedTcIds(new Set())
    setResult(null); setError(null); setSubmitting(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  function close() {
    setImportOpen(false)
    resetAll()
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" })
        if (raw.length < 2) {
          setError("The file needs a header row plus at least one data row.")
          return
        }
        const headerRow = raw[0].map((h: any) => String(h ?? "").trim())
        const dataRows = raw.slice(1).filter((r) => r.some((c: any) => String(c ?? "").trim() !== ""))

        // Auto-map columns by header name.
        const auto: Mapping = {}
        headerRow.forEach((h: string, idx: number) => {
          const lower = h.toLowerCase()
          for (const f of FILE_FIELDS) {
            if (auto[f.key] === undefined && f.aliases.some((a) => lower === a || lower.includes(a))) {
              auto[f.key] = idx
              break
            }
          }
        })

        setFileName(file.name)
        setHeaders(headerRow)
        setRows(dataRows)
        setMapping(auto)
        setError(null)
        setResult(null)
      } catch {
        setError("Couldn't parse that file. Use .xlsx, .xls, or .csv.")
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const mappedPreview = useMemo(() => {
    if (mapping.title === undefined) return []
    return rows.slice(0, 5).map((r) => ({
      title: String(r[mapping.title!] ?? "").trim(),
      type: mapping.type !== undefined ? String(r[mapping.type] ?? "").trim() : "",
      priority: mapping.priority !== undefined ? String(r[mapping.priority] ?? "").trim() : "",
      storyPoints: mapping.storyPoints !== undefined ? String(r[mapping.storyPoints] ?? "").trim() : "",
    }))
  }, [rows, mapping])

  const validRowCount = useMemo(
    () => (mapping.title === undefined ? 0 : rows.filter((r) => String(r[mapping.title!] ?? "").trim() !== "").length),
    [rows, mapping]
  )

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const base = {
        sprintId: sprintId === "none" ? null : sprintId,
        epicId: epicId === "none" ? null : epicId,
      }
      const payload =
        source === "file"
          ? {
              source: "file" as const,
              defaultType,
              ...base,
              rows: rows.map((r) => ({
                title: mapping.title !== undefined ? String(r[mapping.title] ?? "") : "",
                description: mapping.description !== undefined ? String(r[mapping.description] ?? "") : null,
                type: mapping.type !== undefined ? String(r[mapping.type] ?? "") : null,
                priority: mapping.priority !== undefined ? String(r[mapping.priority] ?? "") : null,
                status: mapping.status !== undefined ? String(r[mapping.status] ?? "") : null,
                storyPoints: mapping.storyPoints !== undefined ? String(r[mapping.storyPoints] ?? "") : null,
                tags: mapping.tags !== undefined ? String(r[mapping.tags] ?? "") : null,
              })),
            }
          : { source: "testCases" as const, testCaseIds: [...selectedTcIds], ...base }

      const res = await fetch(`/api/projects/${projectId}/scrum/tasks/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Import failed")
        return
      }
      setResult(json)
      toast.success(
        `Imported ${json.created} ${json.created === 1 ? "issue" : "issues"}` +
          (json.skipped?.length ? ` (${json.skipped.length} skipped)` : "")
      )
      qc.invalidateQueries({ queryKey: ["scrum", projectId, "tasks"] })
      qc.invalidateQueries({ queryKey: ["scrum", projectId, "import-testcases"] })
      setSelectedTcIds(new Set())
      // Consume the parsed file so the same rows can't be imported twice —
      // the panel returns to the dropzone with the summary banner above it.
      setFileName(null)
      setHeaders([])
      setRows([])
      setMapping({})
      if (fileInput.current) fileInput.current.value = ""
    } catch {
      setError("Import failed — check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "scrum-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const canSubmit =
    !submitting &&
    (source === "file" ? validRowCount > 0 && mapping.title !== undefined : selectedTcIds.size > 0)

  return (
    <Dialog open={importOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import issues</DialogTitle>
          <DialogDescription className="body-6">Add issues from a spreadsheet (XLSX, XLS or CSV) or from this project&apos;s test cases.</DialogDescription>
        </DialogHeader>

        {/* Source tabs */}
        <div className="flex gap-2">
          {(
            [
              { id: "file", label: "From file", icon: FileSpreadsheet, hint: "stories, test cases, bugs" },
              { id: "testCases", label: "From test cases", icon: ListChecks, hint: "already in this project" },
            ] as const
          ).map((t) => {
            const on = source === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setSource(t.id); setResult(null); setError(null) }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                <span className="font-normal opacity-60">· {t.hint}</span>
              </button>
            )
          })}
        </div>

        {/* Success summary */}
        {result && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Imported {result.created}{" "}
              {result.created === 1 ? "issue" : "issues"}
            </p>
            {result.skipped.length > 0 && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <p className="font-semibold">{result.skipped.length} skipped:</p>
                {result.skipped.slice(0, 6).map((s, i) => (
                  <p key={i}>
                    {s.row > 0 ? `Row ${s.row}` : s.title ? `"${s.title.slice(0, 40)}"` : "Item"} — {s.reason}
                  </p>
                ))}
                {result.skipped.length > 6 && <p>…and {result.skipped.length - 6} more</p>}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </div>
        )}

        {/* ── FILE MODE ── */}
        {source === "file" && (
          <div className="space-y-3">
            {/* What are we importing? This used to be hidden until a file was
                parsed, so on open there was no sign the importer handles user
                stories, test cases or bugs at all. */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Import rows as{" "}
                <span className="font-normal">— overridden per row by a Type column, if your file has one</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {IMPORT_TYPES.map((t) => {
                  const meta = TYPE_META[t]
                  const Icon = meta.icon
                  const on = defaultType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDefaultType(t)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${on ? "" : meta.color}`} />
                      {t === "STORY" ? "User story" : meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {!fileName ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
              >
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm font-semibold">
                    {dragging ? "Drop to upload" : "Drop a file here, or click to choose"}
                  </span>
                  <span className="text-xs">
                    XLSX, XLS, or CSV — first row must be headers
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> {fileName}
                  <span className="text-xs text-muted-foreground">
                    {validRowCount} importable {validRowCount === 1 ? "row" : "rows"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => { setFileName(null); setHeaders([]); setRows([]); setMapping({}); if (fileInput.current) fileInput.current.value = "" }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV template
            </button>

            {headers.length > 0 && (
              <>
                {/* Column mapping */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Column mapping</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FILE_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-0.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          {f.label}
                          {"required" in f && f.required ? " *" : ""}
                        </label>
                        <Select
                          value={mapping[f.key] !== undefined ? String(mapping[f.key]) : "none"}
                          onValueChange={(v) =>
                            setMapping((m) => {
                              const next = { ...m }
                              if (v === "none") delete next[f.key]
                              else next[f.key] = Number(v)
                              return next
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— not mapped —</SelectItem>
                            {headers.map((h, idx) => (
                              <SelectItem key={idx} value={String(idx)}>
                                {h || `Column ${idx + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {mapping.title === undefined && (
                    <p className="text-xs font-medium text-destructive">Map the Title column to continue.</p>
                  )}
                </div>

                {/* Preview */}
                {mappedPreview.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-semibold">Title</th>
                          <th className="px-2 py-2 font-semibold">Type</th>
                          <th className="px-2 py-2 font-semibold">Priority</th>
                          <th className="px-2 py-2 font-semibold">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappedPreview.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="max-w-[260px] truncate px-2 py-2 font-medium">{r.title || <span className="text-destructive">missing</span>}</td>
                            <td className="px-2 py-2">{r.type || <span className="text-muted-foreground">{TYPE_META[defaultType].label}</span>}</td>
                            <td className="px-2 py-2">{r.priority || <span className="text-muted-foreground">Medium</span>}</td>
                            <td className="px-2 py-2">{r.storyPoints}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 5 && (
                      <p className="border-t bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                        …and {rows.length - 5} more rows
                      </p>
                    )}
                  </div>
                )}

              </>
            )}
          </div>
        )}

        {/* ── TEST CASE MODE ── */}
        {source === "testCases" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tcSearch}
                onChange={(e) => setTcSearch(e.target.value)}
                placeholder="Search test cases…"
                className="h-9 pl-8"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selectedTcIds.size} selected · {importableVisible.length} importable
              </span>
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => {
                  const allSelected = importableVisible.every((tc) => selectedTcIds.has(tc.id))
                  setSelectedTcIds((prev) => {
                    const next = new Set(prev)
                    importableVisible.forEach((tc) => (allSelected ? next.delete(tc.id) : next.add(tc.id)))
                    return next
                  })
                }}
              >
                {importableVisible.length > 0 && importableVisible.every((tc) => selectedTcIds.has(tc.id))
                  ? "Clear visible"
                  : "Select all visible"}
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {pickerLoading && (
                <SkeletonLines lines={4} className="p-2" />
              )}
              {!pickerLoading && visibleTestCases.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No test cases found.</p>
              )}
              {visibleTestCases.map((tc) => {
                const on = selectedTcIds.has(tc.id)
                return (
                  <label
                    key={tc.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                      tc.alreadyImported ? "cursor-not-allowed opacity-50" : on ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={on}
                      disabled={tc.alreadyImported}
                      onChange={() =>
                        setSelectedTcIds((prev) => {
                          const next = new Set(prev)
                          on ? next.delete(tc.id) : next.add(tc.id)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{tc.title}</span>
                    <span className="shrink-0 rounded border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {tc.priority}
                    </span>
                    <span className="shrink-0 rounded border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {tc.executionType}
                    </span>
                    {tc.alreadyImported && (
                      <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        on board
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Imported test cases become <span className="font-semibold">Test Case</span> issues linked back to the
              original test case — preconditions and steps are carried into the description.
            </p>
          </div>
        )}

        {/* Destination */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Sprint</label>
            <Select value={sprintId} onValueChange={setSprintId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Backlog (no sprint)</SelectItem>
                {sprints?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Epic</label>
            <Select value={epicId} onValueChange={setEpicId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No epic</SelectItem>
                {epics?.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <BusyDot />}
            {source === "file"
              ? `Import ${validRowCount || ""} ${
                  validRowCount === 1
                    ? (defaultType === "STORY" ? "user story" : TYPE_META[defaultType].label.toLowerCase())
                    : (defaultType === "STORY" ? "user stories" : `${TYPE_META[defaultType].label.toLowerCase()}s`)
                }`
              : `Import ${selectedTcIds.size || ""} test ${selectedTcIds.size === 1 ? "case" : "cases"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
