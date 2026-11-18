"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Images,
  Upload,
  Trash2,
  Download,
  Plus,
  Loader2,
  X,
  Camera,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Tag,
  Play,
  ScanEye,
  Layers,
  Eye,
  Square,
  Check,
  Cloud,
  Cpu,
  History
} from "lucide-react"

// ---------- Types ----------

interface Baseline {
  id: string
  testName: string
  pageName: string
  browser: string
  viewport: string
  versionTag: string
  provider: string
  width: number | null
  height: number | null
  createdAt: string
  url: string
}
interface ScreenshotOption {
  id: string
  testName: string
  stepNumber: number
  pageUrl: string
  url: string
}
interface Comparison {
  id: string
  baselineId: string
  diffScore: number
  threshold: number
  status: string
  dimensionMismatch: boolean
  createdAt: string
  currentUrl: string | null
  diffUrl: string | null
  baselineUrl: string | null
}
interface IgnoreRegion {
  x: number
  y: number
  width: number
  height: number
}

const PROVIDERS = [
  { id: "pixelmatch", label: "Built-in", note: "pixelmatch pixel diff", available: true },
  { id: "applitools", label: "Applitools Eyes", note: "not configured", available: false },
  { id: "shutterbug", label: "Selenium Shutterbug", note: "not configured", available: false }
]

// Draw an uploaded image onto a canvas and export PNG so the diff engine (pngjs)
// always receives a PNG regardless of the original file type.
function fileToPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement("canvas")
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext("2d")?.drawImage(img, 0, 0)
        resolve(c.toDataURL("image/png"))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const statusMeta = (status: string) => {
  if (status === "pass" || status === "approved")
    return { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-100", label: status === "approved" ? "APPROVED" : "PASS" }
  if (status === "fail" || status === "rejected")
    return { icon: XCircle, cls: "bg-rose-50 text-rose-700 border-rose-100", label: status === "rejected" ? "REJECTED" : "FAIL" }
  return { icon: AlertTriangle, cls: "bg-amber-50 text-amber-700 border-amber-100", label: status.toUpperCase() }
}

// Show the server's error message (e.g. a Viewer trying to change baselines).
async function reportError(res: Response, fallback: string) {
  const d = await res.json().catch(() => null)
  toast.error(d?.error || fallback)
}

// ---------- Component ----------

export default function VisualDiffSection({ projectId }: { projectId: string }) {
  const [subTab, setSubTab] = useState<"baselines" | "compare" | "settings">("baselines")
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [screenshotOptions, setScreenshotOptions] = useState<ScreenshotOption[]>([])
  const [loading, setLoading] = useState(true)

  // Settings (shared)
  const [threshold, setThreshold] = useState(5)
  const [colorSensitivity, setColorSensitivity] = useState(90)
  const [ignoreAntiAliasing, setIgnoreAntiAliasing] = useState(true)
  const [provider, setProvider] = useState("shaft-opencv")

  // Create-baseline form
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ testName: "", pageName: "", browser: "chrome", versionTag: "", evidenceId: "", dataUrl: "" })

  // Compare state
  const [selectedBaselineId, setSelectedBaselineId] = useState("")
  const [currentEvidenceId, setCurrentEvidenceId] = useState("")
  const [currentDataUrl, setCurrentDataUrl] = useState("")
  const [ignoreRegions, setIgnoreRegions] = useState<IgnoreRegion[]>([])
  const [running, setRunning] = useState(false)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [history, setHistory] = useState<Comparison[]>([])
  const [investigate, setInvestigate] = useState<Comparison | null>(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/hub/visual/baselines?projectId=${encodeURIComponent(projectId)}`)
      if (res.ok) {
        const d = await res.json()
        setBaselines(d.baselines || [])
        setScreenshotOptions(d.screenshotOptions || [])
        if (d.baselines?.length && !selectedBaselineId) setSelectedBaselineId(d.baselines[0].id)
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const selectedBaseline = baselines.find((b) => b.id === selectedBaselineId) || null

  // Load history when the selected baseline changes
  useEffect(() => {
    if (!selectedBaselineId) return
    fetch(`/api/hub/visual/comparisons?baselineId=${selectedBaselineId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHistory(d.comparisons || []))
      .catch(() => {})
  }, [selectedBaselineId, comparison])

  // ---------- Baseline actions ----------

  const createBaseline = async () => {
    if (!form.testName || (!form.evidenceId && !form.dataUrl)) return
    setCreating(true)
    try {
      const source = form.dataUrl ? { type: "upload", dataUrl: form.dataUrl } : { type: "evidence", evidenceId: form.evidenceId }
      const res = await fetch("/api/hub/visual/baselines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, provider, source, projectId })
      })
      if (res.ok) {
        setForm({ testName: "", pageName: "", browser: "chrome", versionTag: "", evidenceId: "", dataUrl: "" })
        setShowCreate(false)
        await load()
      } else {
        await reportError(res, "Couldn't create the baseline")
      }
    } finally {
      setCreating(false)
    }
  }

  const deleteBaseline = async (id: string) => {
    if (!confirm("Delete this baseline and its stored image?")) return
    const res = await fetch(`/api/hub/visual/baselines/${id}`, { method: "DELETE" })
    if (!res.ok) await reportError(res, "Couldn't delete the baseline")
    load()
  }

  const tagBaseline = async (id: string, versionTag: string) => {
    const res = await fetch(`/api/hub/visual/baselines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionTag })
    })
    if (!res.ok) return reportError(res, "Couldn't tag the baseline")
    setBaselines((cur) => cur.map((b) => (b.id === id ? { ...b, versionTag } : b)))
  }

  // ---------- Comparison ----------

  const runComparison = async () => {
    if (!selectedBaselineId || (!currentEvidenceId && !currentDataUrl)) return
    setRunning(true)
    setComparison(null)
    try {
      const current = currentDataUrl ? { type: "upload", dataUrl: currentDataUrl } : { type: "evidence", evidenceId: currentEvidenceId }
      const res = await fetch("/api/hub/visual/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: selectedBaselineId, current, threshold, colorSensitivity, ignoreAntiAliasing, ignoreRegions })
      })
      if (res.ok) {
        const d = await res.json()
        setComparison(d.comparison)
      } else {
        await reportError(res, "Comparison failed")
      }
    } finally {
      setRunning(false)
    }
  }

  const actOnComparison = async (id: string, action: "approve" | "reject") => {
    setActing(true)
    try {
      const res = await fetch(`/api/hub/visual/comparisons/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })
      if (res.ok) {
        const d = await res.json()
        setComparison((c) => (c ? { ...c, status: d.comparison.status } : c))
        if (action === "approve") await load() // baseline image changed
      } else {
        await reportError(res, `Couldn't ${action} the comparison`)
      }
    } finally {
      setActing(false)
    }
  }

  // ---------- Ignore-region drawing ----------

  const imgRef = useRef<HTMLImageElement | null>(null)
  const drawState = useRef<{ startX: number; startY: number } | null>(null)
  const [dragRect, setDragRect] = useState<IgnoreRegion | null>(null)

  const toImageCoords = (clientX: number, clientY: number): { x: number; y: number; scale: number } => {
    const img = imgRef.current!
    const rect = img.getBoundingClientRect()
    const scale = (img.naturalWidth || 1) / rect.width
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale, scale }
  }

  const onDrawStart = (e: React.MouseEvent) => {
    if (!imgRef.current) return
    const { x, y } = toImageCoords(e.clientX, e.clientY)
    drawState.current = { startX: x, startY: y }
    setDragRect({ x, y, width: 0, height: 0 })
  }
  const onDrawMove = (e: React.MouseEvent) => {
    if (!drawState.current) return
    const { x, y } = toImageCoords(e.clientX, e.clientY)
    const s = drawState.current
    setDragRect({ x: Math.min(s.startX, x), y: Math.min(s.startY, y), width: Math.abs(x - s.startX), height: Math.abs(y - s.startY) })
  }
  const onDrawEnd = () => {
    if (dragRect && dragRect.width > 6 && dragRect.height > 6) {
      setIgnoreRegions((r) => [...r, { x: Math.round(dragRect.x), y: Math.round(dragRect.y), width: Math.round(dragRect.width), height: Math.round(dragRect.height) }])
    }
    drawState.current = null
    setDragRect(null)
  }

  const scaleForOverlay = () => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return 1
    return img.getBoundingClientRect().width / img.naturalWidth
  }

  // ---------- Render ----------

  const SUB_TABS = [
    { id: "baselines" as const, label: "Baseline Manager", icon: Images },
    { id: "compare" as const, label: "Comparison Runs", icon: ScanEye },
    { id: "settings" as const, label: "Settings", icon: SlidersHorizontal }
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border w-fit select-none">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === t.id ? "bg-card text-primary shadow-sm border" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center bg-card border rounded-xl">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ============ BASELINE MANAGER ============ */}
          {subTab === "baselines" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {baselines.length} baseline{baselines.length === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => setShowCreate((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-[10px] font-semibold"
                >
                  <Plus size={12} /> New Baseline
                </button>
              </div>

              {showCreate && (
                <div className="bg-card border rounded-xl shadow-sm p-4 space-y-3">
                  <span className="text-[11px] font-medium text-muted-foreground">Create baseline</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input value={form.testName} onChange={(e) => setForm({ ...form, testName: e.target.value })} placeholder="Test name *" className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50" />
                    <input value={form.pageName} onChange={(e) => setForm({ ...form, pageName: e.target.value })} placeholder="Page name" className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50" />
                    <select value={form.browser} onChange={(e) => setForm({ ...form, browser: e.target.value })} className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer">
                      {["chrome", "firefox", "edge", "safari"].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <input value={form.versionTag} onChange={(e) => setForm({ ...form, versionTag: e.target.value })} placeholder="Tag (v1.0 / branch)" className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50" />
                  </div>
                  {/* source */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select
                      value={form.evidenceId}
                      onChange={(e) => setForm({ ...form, evidenceId: e.target.value, dataUrl: "" })}
                      className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer"
                    >
                      <option value="">From evidence screenshot…</option>
                      {screenshotOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.testName} #{s.stepNumber}</option>
                      ))}
                    </select>
                    <label className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer flex items-center gap-1.5 text-muted-foreground">
                      <Upload size={12} /> {form.dataUrl ? "Image ready ✓" : "Or upload PNG/JPG…"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (f) setForm({ ...form, dataUrl: await fileToPngDataUrl(f), evidenceId: "" })
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={createBaseline}
                      disabled={creating || !form.testName || (!form.evidenceId && !form.dataUrl)}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-[10px] font-semibold"
                    >
                      {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save baseline
                    </button>
                  </div>
                </div>
              )}

              {baselines.length === 0 ? (
                <div className="py-16 text-center bg-card border rounded-xl space-y-2">
                  <Images size={26} className="text-slate-300 mx-auto" />
                  <p className="text-[11px] font-medium text-muted-foreground">No baselines yet</p>
                  <p className="text-[9.5px] text-muted-foreground font-medium">Capture a baseline from an evidence screenshot or upload one to start tracking visual regressions.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {baselines.map((b) => (
                    <div key={b.id} className="bg-card border rounded-xl shadow-sm overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.url} alt={b.testName} className="w-full h-36 object-cover bg-muted border-b" />
                      <div className="p-2.5 space-y-1.5">
                        <p className="text-[10px] font-semibold text-foreground truncate">{b.testName}</p>
                        <div className="flex items-center gap-1 flex-wrap text-[11px] font-medium">
                          <span className="bg-muted border rounded px-1 py-px text-muted-foreground">{b.browser}</span>
                          {b.viewport && <span className="bg-muted border rounded px-1 py-px text-muted-foreground">{b.viewport}</span>}
                          {b.versionTag && <span className="bg-primary/10 border border-primary/25 rounded px-1 py-px text-primary inline-flex items-center gap-0.5"><Tag size={7} />{b.versionTag}</span>}
                        </div>
                        <div className="flex items-center gap-1 pt-1 border-t">
                          <button
                            onClick={() => {
                              setSelectedBaselineId(b.id)
                              setComparison(null)
                              setIgnoreRegions([])
                              setSubTab("compare")
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 text-[9px] font-semibold"
                          >
                            <ScanEye size={11} /> Compare
                          </button>
                          <a href={`/api/hub/visual/baselines/${b.id}/download`} className="h-7 w-7 rounded-lg border flex items-center justify-center text-muted-foreground hover:bg-muted/50" title="Download">
                            <Download size={12} />
                          </a>
                          <button onClick={() => { const t = prompt("Version / branch tag:", b.versionTag); if (t !== null) tagBaseline(b.id, t) }} className="h-7 w-7 rounded-lg border flex items-center justify-center text-muted-foreground hover:bg-muted/50" title="Tag">
                            <Tag size={12} />
                          </button>
                          <button onClick={() => deleteBaseline(b.id)} className="h-7 w-7 rounded-lg border flex items-center justify-center text-rose-500 hover:bg-rose-50" title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ COMPARISON RUNS ============ */}
          {subTab === "compare" && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="bg-card border rounded-xl shadow-sm p-3.5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">Baseline</label>
                    <select value={selectedBaselineId} onChange={(e) => { setSelectedBaselineId(e.target.value); setComparison(null); setIgnoreRegions([]) }} className="w-full h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer">
                      <option value="">Select baseline…</option>
                      {baselines.map((b) => (
                        <option key={b.id} value={b.id}>{b.testName} · {b.browser}{b.versionTag ? ` · ${b.versionTag}` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">Current image</label>
                    <select value={currentEvidenceId} onChange={(e) => { setCurrentEvidenceId(e.target.value); setCurrentDataUrl("") }} className="w-full h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer">
                      <option value="">From evidence screenshot…</option>
                      {screenshotOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.testName} #{s.stepNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 h-8 rounded-lg border px-2 text-[10px] font-semibold bg-muted/50 cursor-pointer flex items-center gap-1.5 text-muted-foreground">
                      <Upload size={12} /> {currentDataUrl ? "Ready ✓" : "Upload"}
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCurrentDataUrl(await fileToPngDataUrl(f)); setCurrentEvidenceId("") } }} />
                    </label>
                    <button
                      onClick={runComparison}
                      disabled={running || !selectedBaselineId || (!currentEvidenceId && !currentDataUrl)}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-[10px] font-semibold shrink-0"
                    >
                      {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />} Run
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap text-[8.5px] font-semibold text-muted-foreground">
                  <span>Threshold <span className="text-foreground font-semibold">{threshold}%</span></span>
                  <span>Sensitivity <span className="text-foreground font-semibold">{colorSensitivity}</span></span>
                  <span>AA ignore <span className="text-foreground font-semibold">{ignoreAntiAliasing ? "on" : "off"}</span></span>
                  <span>Provider <span className="text-foreground font-semibold">{PROVIDERS.find((p) => p.id === provider)?.label}</span></span>
                  {ignoreRegions.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-rose-500">
                      <Square size={9} /> {ignoreRegions.length} ignore region(s)
                      <button onClick={() => setIgnoreRegions([])} className="underline">clear</button>
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground">Drag on the baseline to add ignore regions</span>
                </div>
              </div>

              {/* Baseline with ignore-region drawing */}
              {selectedBaseline && !comparison && (
                <div className="bg-card border rounded-xl shadow-sm p-3">
                  <span className="text-[11px] font-medium text-muted-foreground block mb-1.5">Baseline (draw to exclude regions)</span>
                  <div className="relative inline-block max-w-full select-none" onMouseDown={onDrawStart} onMouseMove={onDrawMove} onMouseUp={onDrawEnd} onMouseLeave={onDrawEnd}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={imgRef} src={selectedBaseline.url} alt="baseline" className="max-h-[46vh] w-auto rounded-lg border" draggable={false} />
                    {[...ignoreRegions, ...(dragRect ? [dragRect] : [])].map((r, i) => {
                      const s = scaleForOverlay()
                      return (
                        <div key={i} className="absolute border-2 border-dashed border-rose-500 bg-rose-500/20 pointer-events-none" style={{ left: r.x * s, top: r.y * s, width: r.width * s, height: r.height * s }} />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Result */}
              {comparison && (
                <div className="bg-card border rounded-xl shadow-sm p-4 space-y-3">
                  {/* score / status header */}
                  <div className="flex items-center gap-3 flex-wrap border-b pb-2.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-foreground">{comparison.diffScore}%</span>
                      <span className="text-[9px] font-semibold text-muted-foreground">changed · threshold {comparison.threshold}%</span>
                    </div>
                    {(() => { const m = statusMeta(comparison.status); const I = m.icon; return (
                      <span className={`inline-flex items-center gap-1 rounded-full border font-medium px-2.5 py-1 text-[11px] ${m.cls}`}><I size={12} /> {m.label}</span>
                    ) })()}
                    {comparison.dimensionMismatch && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 text-[11px] font-medium"><AlertTriangle size={9} /> dimension mismatch</span>
                    )}
                    <button onClick={() => setInvestigate(comparison)} className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-semibold text-primary hover:text-primary">
                      <Eye size={12} /> Investigate
                    </button>
                  </div>

                  {/* three-up */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[
                      { label: "Baseline (expected)", url: comparison.baselineUrl },
                      { label: "Current (actual)", url: comparison.currentUrl },
                      { label: "Diff (changed pixels)", url: comparison.diffUrl }
                    ].map((pane) => (
                      <div key={pane.label} className="space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground">{pane.label}</span>
                        {pane.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pane.url} alt={pane.label} className="w-full max-h-64 object-contain rounded-lg border bg-slate-950" />
                        ) : (
                          <div className="h-40 flex items-center justify-center bg-muted/50 border rounded-lg text-slate-300"><Images size={18} /></div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* actions */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                    <button onClick={() => actOnComparison(comparison.id, "approve")} disabled={acting || comparison.status === "approved"} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[10px] font-semibold">
                      <Check size={12} /> Approve as New Baseline
                    </button>
                    <button onClick={() => actOnComparison(comparison.id, "reject")} disabled={acting || comparison.status === "rejected"} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-rose-200 text-rose-600 bg-card hover:bg-rose-50 text-[10px] font-semibold">
                      <X size={12} /> Reject
                    </button>
                    <button onClick={() => setInvestigate(comparison)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-muted-foreground bg-card hover:bg-muted/50 text-[10px] font-semibold">
                      <Eye size={12} /> Investigate
                    </button>
                  </div>
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div className="bg-card border rounded-xl shadow-sm p-3.5">
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-2"><History size={13} className="text-primary" /> Comparison history</span>
                  <div className="space-y-1">
                    {history.map((h) => { const m = statusMeta(h.status); const I = m.icon; return (
                      <button key={h.id} onClick={() => setInvestigate(h)} className="w-full flex items-center gap-2 p-2 rounded-xl border hover:border-border text-left">
                        {h.diffUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.diffUrl} alt="diff" className="h-9 w-14 object-cover rounded border bg-slate-950" />
                        )}
                        <span className="font-semibold text-foreground text-[11px] font-mono">{h.diffScore}%</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border font-medium px-1.5 py-px text-[11px] ${m.cls}`}><I size={9} /> {m.label}</span>
                        <span className="ml-auto text-[8.5px] font-mono text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                      </button>
                    ) })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ SETTINGS ============ */}
          {subTab === "settings" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border rounded-xl shadow-sm p-4 space-y-4">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 border-b pb-2"><SlidersHorizontal size={13} className="text-primary" /> Comparison Settings</span>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9.5px] font-semibold"><span className="text-muted-foreground">Diff threshold (pass/fail)</span><span className="text-primary font-semibold font-mono">{threshold}%</span></div>
                  <input type="range" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
                  <p className="text-[8px] text-muted-foreground font-medium">Comparisons with a diff score ≤ threshold PASS.</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9.5px] font-semibold"><span className="text-muted-foreground">Color sensitivity</span><span className="text-primary font-semibold font-mono">{colorSensitivity}</span></div>
                  <input type="range" min={0} max={100} value={colorSensitivity} onChange={(e) => setColorSensitivity(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
                  <p className="text-[8px] text-muted-foreground font-medium">Higher = stricter (smaller color differences count as changes).</p>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/50">
                  <div>
                    <span className="text-[10px] font-semibold text-foreground block">Ignore anti-aliasing</span>
                    <span className="text-[8px] text-muted-foreground font-medium">Don't count anti-aliased edge pixels as changes</span>
                  </div>
                  <button onClick={() => setIgnoreAntiAliasing((v) => !v)} className={`h-6 w-11 rounded-full relative transition-colors ${ignoreAntiAliasing ? "bg-primary" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${ignoreAntiAliasing ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              <div className="bg-card border rounded-xl shadow-sm p-4 space-y-3">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 border-b pb-2"><Layers size={13} className="text-primary" /> Visual Testing Provider</span>
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => p.available && setProvider(p.id)}
                    disabled={!p.available}
                    className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      provider === p.id ? "border-primary/25 ring-1 ring-primary/30 bg-primary/10" : "hover:border-border"
                    } ${!p.available ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {p.id === "shaft-opencv" ? <Cpu size={15} className="text-primary" /> : <Cloud size={15} className="text-muted-foreground" />}
                    <div className="flex-1">
                      <span className="text-[10.5px] font-semibold text-foreground block">{p.label}</span>
                      <span className="text-[11px] font-medium text-muted-foreground">{p.note}</span>
                    </div>
                    {provider === p.id && <CheckCircle2 size={14} className="text-primary" />}
                    {!p.available && <span className="text-[7.5px] font-semibold uppercase bg-muted border rounded-full px-1.5 py-0.5 text-muted-foreground">optional</span>}
                  </button>
                ))}
                <p className="text-[8px] text-muted-foreground font-medium leading-relaxed">
                  The built-in engine runs a real OpenCV-equivalent pixel diff. Applitools Eyes and Selenium Shutterbug light up when their SDK credentials are configured in the Maven workspace.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* INVESTIGATE MODAL */}
      {investigate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setInvestigate(null)}>
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ScanEye size={16} className="text-primary" /> Visual Investigation — {investigate.diffScore}% changed
              </span>
              <button onClick={() => setInvestigate(null)} className="p-1.5 text-muted-foreground hover:text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: "Baseline (expected)", url: investigate.baselineUrl },
                { label: "Current (actual)", url: investigate.currentUrl },
                { label: "Diff (red = changed)", url: investigate.diffUrl }
              ].map((pane) => (
                <div key={pane.label} className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">{pane.label}</span>
                  {pane.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pane.url} alt={pane.label} className="w-full object-contain rounded-lg border bg-slate-950" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
