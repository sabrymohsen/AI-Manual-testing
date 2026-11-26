"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Bug, Check, ChevronLeft, ChevronRight, Crop, ExternalLink, Loader2, Undo2, X } from "@/components/ui/icons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ScreenStatusBadge, api, pathOf, type ScreenStatus } from "@/components/visual-tests/shared"

type View = "side" | "diff" | "flip"
interface Box {
  x: number
  y: number
  width: number
  height: number
}

export default function VisualScreenAnalyzerPage() {
  const { id: projectId, screenId } = useParams() as { id: string; screenId: string }
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [view, setView] = useState<View>("side")
  const [flipShowNew, setFlipShowNew] = useState(true)
  const [showBoxes, setShowBoxes] = useState(true)
  // "fit" scales the screenshot to the pane; 1 / 2 show real pixels so small
  // changes (a 1px border, a changed digit) are actually visible.
  const [zoom, setZoom] = useState<Zoom>("fit")
  // Side-by-side panes scroll together, so both always show the same spot.
  const paneRefs = useRef<(HTMLDivElement | null)[]>([])
  const syncing = useRef(false)
  const syncScroll = (from: number) => {
    if (syncing.current) return
    const src = paneRefs.current[from]
    if (!src) return
    syncing.current = true
    paneRefs.current.forEach((el, i) => {
      if (el && i !== from) {
        el.scrollTop = src.scrollTop
        el.scrollLeft = src.scrollLeft
      }
    })
    requestAnimationFrame(() => { syncing.current = false })
  }
  const jumpTo = (b: Box) => {
    const z = zoom === "fit" ? 1 : zoom
    if (zoom === "fit") setZoom(1)
    if (view !== "side") setView("side")
    // Wait for the zoomed layout before scrolling to the change.
    setTimeout(() => {
      paneRefs.current.forEach(el => {
        if (!el) return
        el.scrollTo({ left: Math.max(0, b.x * z - 60), top: Math.max(0, b.y * z - 60), behavior: "smooth" })
      })
    }, 60)
  }
  const [scope, setScope] = useState<"run" | "test" | "none">("run")
  const [deciding, setDeciding] = useState<null | "accept" | "reject">(null)
  const [autoResult, setAutoResult] = useState<{ action: string; rows: any[] } | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<Box | null>(null)
  const [regionForm, setRegionForm] = useState({ allPages: false, allEnvironments: false, note: "" })
  const [bugOpen, setBugOpen] = useState(false)
  const [bugForm, setBugForm] = useState({ title: "", severity: "Medium", notes: "" })
  const [busy, setBusy] = useState(false)
  const [cacheBust, setCacheBust] = useState(0)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/visual-tests/screens/${screenId}`))
    } catch (err: any) {
      toast.error(err.message)
    }
  }, [screenId])

  useEffect(() => {
    setData(null)
    setAutoResult(null)
    setDraft(null)
    setDrawing(false)
    load()
  }, [load])

  const siblings: any[] = useMemo(() => data?.siblings ?? [], [data])
  const index = siblings.findIndex(s => s.id === screenId)
  const nextToReview = useMemo(() => {
    for (let i = 1; i <= siblings.length; i++) {
      const s = siblings[(index + i) % siblings.length]
      if (s && s.id !== screenId && s.status === "Unresolved") return s
    }
    return null
  }, [siblings, index, screenId])

  const go = useCallback((id?: string) => id && router.push(`/projects/${projectId}/visual-tests/screens/${id}`), [router, projectId])

  const decide = useCallback(
    async (action: "accept" | "reject") => {
      setDeciding(action)
      try {
        const r = await api<{ autoResolved: any[]; baselineUpdated: boolean }>(`/api/visual-tests/screens/${screenId}/resolve`, {
          method: "POST",
          json: { action, scope: data?.test?.autoMaintenance ? scope : "none" },
        })
        const verb = action === "accept" ? "Accepted" : "Rejected"
        if (r.autoResolved.length) {
          setAutoResult({ action: verb, rows: r.autoResolved })
          toast.success(`${verb}, plus ${r.autoResolved.length} other screen(s) with the same change`)
        } else {
          toast.success(action === "accept" && !r.baselineUpdated && data?.screen?.status !== "Removed" ? `${verb}. A newer screenshot of this page is already approved, so it stays.` : verb)
        }
        await load()
      } catch (err: any) {
        toast.error(err.message)
      } finally {
        setDeciding(null)
      }
    },
    [screenId, scope, data, load]
  )

  // Keyboard: A accept, R reject, ← → previous / next. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "ArrowRight") go(siblings[index + 1]?.id)
      else if (e.key === "ArrowLeft") go(siblings[index - 1]?.id)
      else if ((e.key === "a" || e.key === "A") && canDecide(data?.screen?.status)) decide("accept")
      else if ((e.key === "r" || e.key === "R") && canDecide(data?.screen?.status)) decide("reject")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, siblings, index, decide, data])

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const { screen, test, run, regions, bug, autoChildren } = data
  const img = (kind: string) => `/api/visual-tests/screens/${screen.id}/image?kind=${kind}&v=${cacheBust}`
  const hasBaseline = !!screen.baselineImagePath
  const hasActual = !!screen.actualImagePath
  const hasDiff = !!screen.diffImagePath

  const saveRegion = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const r = await api<{ updated: { id: string; status: string }[] }>(`/api/visual-tests/screens/${screen.id}/regions`, {
        method: "POST",
        json: { ...draft, ...regionForm },
      })
      const cleared = r.updated.filter(u => u.status === "Passed").length
      toast.success(cleared ? `Area ignored. ${cleared} screen(s) now pass.` : "Area ignored. Screens still show other changes.")
      setDraft(null)
      setDrawing(false)
      setCacheBust(v => v + 1)
      await load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const undoAuto = async () => {
    if (!autoResult) return
    setBusy(true)
    try {
      const r = await api<{ undone: number }>(`/api/visual-tests/screens/undo`, { method: "POST", json: { screenIds: autoResult.rows.map(x => x.id) } })
      toast.success(`${r.undone} screen(s) are waiting for review again`)
      setAutoResult(null)
      await load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fileBug = async () => {
    setBusy(true)
    try {
      const r = await api<{ bug: { id: string; bugKey: string } }>(`/api/visual-tests/screens/${screen.id}/bug`, {
        method: "POST",
        json: { title: bugForm.title || undefined, severity: bugForm.severity, notes: bugForm.notes || undefined },
      })
      toast.success(`${r.bug.bugKey} filed`)
      setBugOpen(false)
      await load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const decidable = canDecide(screen.status)

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <Link href={`/projects/${projectId}/visual-tests/runs/${screen.runId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Run
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-semibold text-foreground">
            {screen.url ? pathOf(screen.url) : screen.name}
            {screen.url && (
              <a href={screen.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="Open page">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <ScreenStatusBadge status={screen.status as ScreenStatus} auto={screen.resolvedByAuto} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {test?.name} · {screen.envName} · {screen.viewport}
            {screen.httpStatus ? ` · HTTP ${screen.httpStatus}` : ""}
            {screen.loadMs ? ` · loaded in ${(screen.loadMs / 1000).toFixed(1)} s` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Button size="sm" variant="ghost" disabled={index <= 0} onClick={() => go(siblings[index - 1]?.id)} aria-label="Previous screen">
            <ChevronLeft />
          </Button>
          {index + 1} / {siblings.length}
          <Button size="sm" variant="ghost" disabled={index >= siblings.length - 1} onClick={() => go(siblings[index + 1]?.id)} aria-label="Next screen">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Images */}
        <div className="flex min-w-0 flex-1 flex-col bg-muted">
          <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-sm">
            {(
              [
                ["side", "Side by side"],
                ["diff", "Differences"],
                ["flip", "Flip"],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                disabled={(v !== "side" && !hasBaseline) || (v === "diff" && !hasDiff)}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 disabled:opacity-40 ${view === v ? "bg-primary text-white" : "hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
            <div className="ml-2 flex items-center overflow-hidden rounded-md border">
              {(
                [
                  ["fit", "Fit"],
                  [1, "100%"],
                  [2, "200%"],
                ] as [Zoom, string][]
              ).map(([z, label]) => (
                <button
                  key={String(z)}
                  onClick={() => setZoom(z)}
                  className={`px-3 py-1 text-xs ${zoom === z ? "bg-slate-800 text-white" : "hover:bg-slate-100"}`}
                  title={z === "fit" ? "Fit the screenshot to the pane" : `Show at ${label} — panes scroll together`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="ml-2 flex items-center gap-1 text-muted-foreground">
              <input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} className="accent-indigo-600" /> Outline changes
            </label>
            {hasActual && (
              <Button size="sm" variant={drawing ? "default" : "outline"} className="ml-auto" onClick={() => { setDrawing(d => !d); setDraft(null); setView("side") }}>
                <Crop /> {drawing ? "Drag over the new screenshot…" : "Ignore an area"}
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {screen.status === "Error" && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{screen.errorMessage || "The page could not be captured."}</div>
            )}
            {screen.status !== "Error" && screen.errorMessage && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{screen.errorMessage}</div>
            )}
            {view === "side" && (
              <div className={`grid gap-4 ${hasBaseline && hasActual ? "grid-cols-2" : "grid-cols-1"}`}>
                {hasBaseline && (
                  <Pane
                    label={screen.status === "Removed" ? "Approved (page no longer in sitemap)" : "Approved"}
                    scrollRef={el => { paneRefs.current[0] = el }}
                    onScroll={() => syncScroll(0)}
                    zoomed={zoom !== "fit"}
                  >
                    <ImageWithOverlays src={img("baseline")} naturalWidth={screen.width} zoom={zoom} boxes={showBoxes ? screen.diffRegions : []} ignore={regions} />
                  </Pane>
                )}
                {hasActual && (
                  <Pane
                    label={screen.status === "New" ? "First screenshot (now approved)" : "New"}
                    scrollRef={el => { paneRefs.current[1] = el }}
                    onScroll={() => syncScroll(1)}
                    zoomed={zoom !== "fit"}
                  >
                    <ImageWithOverlays
                      src={img("actual")}
                      naturalWidth={screen.width}
                      zoom={zoom}
                      boxes={showBoxes ? screen.diffRegions : []}
                      ignore={regions}
                      drawing={drawing}
                      draft={draft}
                      onDraft={setDraft}
                    />
                  </Pane>
                )}
                {!hasBaseline && !hasActual && <p className="text-sm text-muted-foreground">No screenshot was taken.</p>}
              </div>
            )}
            {view === "diff" && hasDiff && (
              <Pane label="Differences in red" zoomed={zoom !== "fit"}>
                <ImageWithOverlays src={img("diff")} naturalWidth={screen.width} zoom={zoom} boxes={showBoxes ? screen.diffRegions : []} ignore={regions} />
              </Pane>
            )}
            {view === "flip" && hasBaseline && (
              <Pane label={flipShowNew ? "New — click to see approved" : "Approved — click to see new"} zoomed={zoom !== "fit"}>
                <div onClick={() => setFlipShowNew(v => !v)} className="cursor-pointer">
                  <ImageWithOverlays src={img(flipShowNew && hasActual ? "actual" : "baseline")} naturalWidth={screen.width} zoom={zoom} boxes={showBoxes ? screen.diffRegions : []} ignore={regions} />
                </div>
              </Pane>
            )}
          </div>
        </div>

        {/* Decision panel */}
        <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l bg-card p-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">
            {screen.status === "Unresolved" && (
              <>
                <p className="font-medium text-foreground">Your turn: is this change expected?</p>
                <p className="mt-1 text-xs">
                  {screen.diffRegions.length} area(s) changed, {(screen.mismatchPercent ?? 0).toFixed(2)}% of the page.
                </p>
                {screen.diffRegions.length > 0 && (hasBaseline || hasActual) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {screen.diffRegions.slice(0, 30).map((b: Box, i: number) => (
                      <button
                        key={i}
                        onClick={() => jumpTo(b)}
                        className="rounded border border-rose-200 bg-card px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        title={`Zoom to change ${i + 1} (${b.width}×${b.height}px at ${b.x},${b.y})`}
                      >
                        Change {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {screen.status === "Removed" && <p>This page was approved before and is no longer in the sitemap. Accept if it was removed on purpose.</p>}
            {screen.status === "New" && <p>First screenshot of this page here. It is approved already; reject it if it is wrong.</p>}
            {screen.status === "Passed" && <p>Matches the approved screenshot. Nothing to do.</p>}
            {screen.status === "Accepted" && <p>Accepted{screen.resolvedByAuto ? " automatically, because it shows the same change as a screen someone accepted" : ""}. You can still reject it.</p>}
            {screen.status === "Rejected" && <p>Rejected{screen.resolvedByAuto ? " automatically, because it shows the same change as a screen someone rejected" : ""}. You can still accept it.</p>}
            {screen.status === "Error" && <p>Nothing to compare. Fix the page, or leave it out of the test, and run again.</p>}
          </div>

          {decidable && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => decide("accept")} disabled={!!deciding || screen.status === "Accepted"} className="bg-emerald-600 hover:bg-emerald-700">
                  {deciding === "accept" ? <Loader2 className="animate-spin" /> : <Check />} Accept
                </Button>
                <Button onClick={() => decide("reject")} disabled={!!deciding || screen.status === "Rejected"} variant="destructive">
                  {deciding === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">Keyboard: A accept · R reject · ← → move</p>
              {test?.autoMaintenance && screen.diffRegions.length > 0 && (
                <label className="block space-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Also decide identical changes on</span>
                  <select value={scope} onChange={e => setScope(e.target.value as any)} className="h-8 w-full rounded-md border bg-card px-2 text-sm">
                    <option value="run">other screens in this run</option>
                    <option value="test">screens waiting in any run of this test</option>
                    <option value="none">only this screen</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {autoResult && (
            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm">
              <p className="font-medium text-primary">
                {autoResult.action} {autoResult.rows.length} other screen(s) with the same change
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-primary">
                {autoResult.rows.map(r => (
                  <li key={r.id}>
                    <Link href={`/projects/${projectId}/visual-tests/screens/${r.id}`} className="hover:underline">
                      {pathOf(r.name) || r.name} · {r.envName}
                    </Link>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={undoAuto} disabled={busy}>
                <Undo2 /> Undo those
              </Button>
            </div>
          )}

          {!autoResult && autoChildren?.length > 0 && (
            <p className="text-xs text-muted-foreground">This decision was also applied to {autoChildren.length} other screen(s) with the same change.</p>
          )}

          {nextToReview && (
            <Button variant="outline" className="w-full" onClick={() => go(nextToReview.id)}>
              Next screen to review <ChevronRight />
            </Button>
          )}

          {drawing && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium text-foreground">Ignore an area</p>
              {!draft ? (
                <p className="text-xs text-muted-foreground">Drag a box over the new screenshot, around something that is allowed to change (an ad, a carousel, a clock).</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {draft.width}×{draft.height} at ({draft.x}, {draft.y})
                  </p>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={regionForm.allPages} onChange={e => setRegionForm(f => ({ ...f, allPages: e.target.checked }))} className="accent-indigo-600" />
                    On every page of this test
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={regionForm.allEnvironments} onChange={e => setRegionForm(f => ({ ...f, allEnvironments: e.target.checked }))} className="accent-indigo-600" />
                    On every browser &amp; screen size
                  </label>
                  <input value={regionForm.note} onChange={e => setRegionForm(f => ({ ...f, note: e.target.value }))} placeholder="Why (optional)" className="h-8 w-full rounded-md border px-2 text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveRegion} disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <Check />} Ignore it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                      Redraw
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            {bug ? (
              <Link href={`/projects/${projectId}/bug-reports/${bug.id}`} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100">
                <Bug className="h-4 w-4" /> {bug.bugKey} · {bug.status}
              </Link>
            ) : !bugOpen ? (
              <Button variant="outline" className="w-full" onClick={() => setBugOpen(true)}>
                <Bug /> File a bug
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium text-foreground">File a bug{test?.suite ? ` in ${test.suite.name}` : ""}</p>
                <input value={bugForm.title} onChange={e => setBugForm(f => ({ ...f, title: e.target.value }))} placeholder="Title (a good one is suggested if left empty)" className="h-8 w-full rounded-md border px-2 text-xs" />
                <select value={bugForm.severity} onChange={e => setBugForm(f => ({ ...f, severity: e.target.value }))} className="h-8 w-full rounded-md border bg-card px-2 text-xs">
                  {["Low", "Medium", "High", "Critical"].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <textarea value={bugForm.notes} onChange={e => setBugForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Notes (optional)" className="w-full rounded-md border p-2 text-xs" />
                <p className="text-xs text-muted-foreground">The approved, new and difference images are attached.</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={fileBug} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Bug />} File bug
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBugOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {regions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {regions.length} ignored area(s) apply to this screen (grey). Manage them on the{" "}
              <Link href={`/projects/${projectId}/visual-tests/${test?.id}`} className="text-primary hover:underline">
                test page
              </Link>
              .
            </p>
          )}
          {run && <p className="text-xs text-muted-foreground">Compared {run.matchLevel === "Strict" ? "exactly" : run.matchLevel === "Dynamic" ? "ignoring changing text" : "ignoring colours"}.</p>}
        </aside>
      </div>
    </div>
  )
}

function canDecide(status?: string) {
  return status === "Unresolved" || status === "Accepted" || status === "Rejected" || status === "New" || status === "Removed"
}

type Zoom = "fit" | 1 | 2

function Pane({
  label,
  children,
  scrollRef,
  onScroll,
  zoomed,
}: {
  label: string
  children: React.ReactNode
  scrollRef?: (_el: HTMLDivElement | null) => void
  onScroll?: () => void
  zoomed?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`rounded-lg border bg-card shadow-sm ${zoomed ? "max-h-[75vh] overflow-auto" : "overflow-hidden"}`}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * An image with change boxes (red), ignored areas (grey) and, while drawing, a
 * drag-to-select box. Coordinates are kept in the screenshot's own pixels, so a
 * box drawn on a scaled-down image lands on the same spot on every run.
 */
function ImageWithOverlays({
  src,
  naturalWidth,
  zoom = "fit",
  boxes,
  ignore,
  drawing,
  draft,
  onDraft,
}: {
  src: string
  naturalWidth?: number | null
  zoom?: Zoom
  boxes: Box[]
  ignore: Box[]
  drawing?: boolean
  draft?: Box | null
  onDraft?: (_b: Box | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [natural, setNatural] = useState<number | null>(naturalWidth ?? null)
  const start = useRef<{ x: number; y: number } | null>(null)

  const measure = useCallback(() => {
    const el = ref.current
    if (el && natural) setScale(el.clientWidth / natural)
  }, [natural])
  useEffect(() => {
    measure()
    const el = ref.current
    // Re-measure whenever the box changes size: window resize, zoom, panel layout.
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(measure) : null
    if (ro && el) ro.observe(el)
    else window.addEventListener("resize", measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  const toImage = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.round((e.clientX - rect.left) / scale)), y: Math.max(0, Math.round((e.clientY - rect.top) / scale)) }
  }

  return (
    <div
      ref={ref}
      className={`relative select-none ${drawing ? "cursor-crosshair" : ""}`}
      style={zoom !== "fit" && natural ? { width: natural * zoom, maxWidth: "none" } : undefined}
      onMouseDown={e => {
        if (!drawing || !onDraft) return
        e.preventDefault()
        start.current = toImage(e)
        onDraft(null)
      }}
      onMouseMove={e => {
        if (!drawing || !onDraft || !start.current) return
        const p = toImage(e)
        const s = start.current
        onDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) })
      }}
      onMouseUp={() => {
        start.current = null
        if (draft && (draft.width < 4 || draft.height < 4)) onDraft?.(null)
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="block w-full"
        onLoad={e => {
          const w = (e.target as HTMLImageElement).naturalWidth
          setNatural(w)
          if (ref.current) setScale(ref.current.clientWidth / w)
        }}
      />
      {ignore.map((b, i) => (
        <div
          key={`i${i}`}
          className="pointer-events-none absolute border border-slate-500/60 bg-slate-500/30"
          style={{ left: b.x * scale, top: b.y * scale, width: b.width * scale, height: b.height * scale, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 4px, transparent 4px 8px)" }}
        />
      ))}
      {boxes.map((b, i) => (
        <div key={`b${i}`} className="pointer-events-none absolute border-2 border-rose-500" style={{ left: b.x * scale - 2, top: b.y * scale - 2, width: b.width * scale + 4, height: b.height * scale + 4 }} />
      ))}
      {draft && (
        <div className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/20" style={{ left: draft.x * scale, top: draft.y * scale, width: draft.width * scale, height: draft.height * scale }} />
      )}
    </div>
  )
}
