"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { Button } from "@/components/ui/button"
import {
  History,
  Camera,
  Video,
  Bug,
  X,
  Loader2,
  Play,
  Clock,
  Globe,
  Monitor,
  ExternalLink,
  ChevronRight,
} from "@/components/ui/icons"

interface SessionRow {
  id: string
  title: string
  status: string
  startUrl: string
  browserType: string
  viewport: string
  startedAt: string
  finishedAt: string | null
  bugCount: number
  screenshotCount: number
  recordingCount: number
}

interface Shot { id: string; filePath: string; fullPage: boolean; pageUrl: string | null; annotatedFromId: string | null; createdAt: string }
interface Clip { id: string; filePath: string | null; durationMs: number | null; createdAt: string }
interface SessionBug { id: string; bugKey: string | null; title: string; severity: string; priority: string; status: string; createdAt: string }
interface SessionDetail extends SessionRow {
  screenshots: Shot[]
  recordings: Clip[]
  bugReports: SessionBug[]
}

const fileUrl = (p: string) => `/api/files/${encodeURIComponent(p)}`

function fmtDuration(startISO: string, endISO: string | null): string {
  if (!endISO) return "—"
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime()
  if (ms <= 0) return "—"
  const secs = Math.floor(ms / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

const STATUS_STYLES: Record<string, string> = {
  Finished: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Cancelled: "bg-muted text-muted-foreground dark:bg-slate-500/15 dark:text-muted-foreground",
  Failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
}

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-blue-100 text-blue-700",
  Low: "bg-muted text-muted-foreground",
}

export default function LiveQAHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // ?session=<id> opens that session's report straight away (the link the
  // Live QA page offers when a session is completed).
  const searchParams = useSearchParams()
  const linkedSession = searchParams?.get("session")
  useEffect(() => {
    if (linkedSession) openSession(linkedSession)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedSession])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/projects/${projectId}/live-qa-history`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => setSessions(Array.isArray(d.sessions) ? d.sessions : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [projectId])

  const openSession = async (id: string) => {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/live-qa-history/${id}`)
      if (r.ok) {
        const d = await r.json()
        setDetail(d.session)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold">
      <AppPageHeader
        title="Live QA History"
        subtitle="Past Live QA sessions with their bugs, screenshots, and recordings."
        breadcrumb="QA Workflows > Live QA History"
        primaryAction={{
          label: "New Live QA Session",
          onClick: () => router.push(`/projects/${projectId}/live-qa-session`),
          icon: Play,
        }}
      />

      {loading ? (
        <div className="text-center p-12 text-muted-foreground animate-pulse font-semibold">Loading session history…</div>
      ) : sessions.length === 0 ? (
        <div className="p-16 border border-dashed rounded-xl text-center space-y-4 max-w-xl mx-auto">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            <History className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-foreground dark:text-slate-100">No past sessions yet</h3>
            <p className="text-xs text-muted-foreground font-medium max-w-xs mx-auto leading-relaxed">
              Run a Live QA session and end it — it will appear here with its bugs, screenshots, and recordings.
            </p>
          </div>
          <Button onClick={() => router.push(`/projects/${projectId}/live-qa-session`)} size="sm" className="bg-primary hover:bg-primary/90 text-white font-semibold h-9">
            <Play className="h-3.5 w-3.5 mr-2" /> Start Live QA Session
          </Button>
        </div>
      ) : (
        <div className="border border-border dark:border-border rounded-xl bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-500/[0.02] text-xs text-muted-foreground/80">
                  <th className="p-3">Session</th>
                  <th className="p-3">Started</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Environment</th>
                  <th className="p-3 text-center">Bugs</th>
                  <th className="p-3 text-center">Shots</th>
                  <th className="p-3 text-center">Videos</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((s) => (
                  <tr key={s.id} onClick={() => openSession(s.id)} className="hover:bg-muted/50 dark:hover:bg-accent/30 cursor-pointer transition-colors">
                    <td className="p-3 max-w-xs">
                      <span className="font-semibold text-foreground dark:text-slate-100 truncate block" title={s.title}>{s.title}</span>
                      <span className="text-xs text-muted-foreground font-medium truncate block" title={s.startUrl}>{s.startUrl}</span>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(s.startedAt).toLocaleDateString()} {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap tabular-nums">{fmtDuration(s.startedAt, s.finishedAt)}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{s.browserType} · {s.viewport}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${s.bugCount > 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" : "text-muted-foreground"}`}>
                        <Bug className="h-2.5 w-2.5" /> {s.bugCount}
                      </span>
                    </td>
                    <td className="p-3 text-center text-muted-foreground tabular-nums">{s.screenshotCount}</td>
                    <td className="p-3 text-center text-muted-foreground tabular-nums">{s.recordingCount}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-medium text-xs ${STATUS_STYLES[s.status] || "bg-muted text-muted-foreground"}`}>{s.status}</span>
                    </td>
                    <td className="p-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session detail drawer */}
      {openId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setOpenId(null); setDetail(null) }}>
          <div className="w-full max-w-2xl bg-background h-full shadow-[0_8px_24px_rgba(0,0,0,0.08)] border-l flex flex-col animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between bg-accent/15 shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-foreground dark:text-slate-100 truncate flex items-center gap-2">
                  <History className="h-4 w-4 text-primary shrink-0" /> {detail?.title || "Session"}
                </h3>
                {detail && (
                  <p className="text-xs text-muted-foreground font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(detail.startedAt).toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> {detail.browserType} · {detail.viewport}</span>
                  </p>
                )}
              </div>
              <button onClick={() => { setOpenId(null); setDetail(null) }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading || !detail ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground"><BusyDot /></div>
              ) : (
                <>
                  {detail.startUrl && (
                    <a href={detail.startUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-primary dark:text-indigo-400 hover:underline">
                      <Globe className="h-3.5 w-3.5" /> {detail.startUrl} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {/* Bugs */}
                  <section className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Bug className="h-3.5 w-3.5 text-rose-500" /> Bugs ({detail.bugReports.length})</h4>
                    {detail.bugReports.length === 0 ? (
                      <p className="text-xs text-muted-foreground ">No bugs were filed during this session.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.bugReports.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => router.push(`/projects/${projectId}/bug-reports?bug=${b.id}`)}
                            className="w-full text-left p-3 border rounded-lg bg-background hover:border-primary/25 hover:bg-primary/10 dark:hover:bg-indigo-500/[0.06] transition-colors flex items-center gap-2"
                          >
                            <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-semibold shrink-0">{b.bugKey || "BUG"}</span>
                            <span className="flex-1 truncate text-foreground dark:text-slate-100 font-semibold" title={b.title}>{b.title}</span>
                            <span className={`px-2 py-0.5 rounded font-medium text-xs shrink-0 ${SEVERITY_STYLES[b.severity] || "bg-muted text-muted-foreground"}`}>{b.severity}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{b.status}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Screenshots */}
                  <section className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Camera className="h-3.5 w-3.5 text-primary" /> Screenshots ({detail.screenshots.length})</h4>
                    {detail.screenshots.length === 0 ? (
                      <p className="text-xs text-muted-foreground ">No screenshots captured.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {detail.screenshots.map((shot, idx) => (
                          <button
                            key={shot.id}
                            onClick={() => setLightbox(fileUrl(shot.filePath))}
                            className="group relative border rounded-lg overflow-hidden aspect-[4/3] bg-muted/40 hover:ring-2 hover:ring-primary transition-all"
                            title="Click to enlarge"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileUrl(shot.filePath)} alt={`Screenshot ${idx + 1}`} className="h-full w-full object-cover" />
                            {shot.annotatedFromId && (
                              <span className="absolute top-1 left-1 bg-primary text-white text-xs font-semibold px-1 py-0.5 rounded">Annotated</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Recordings */}
                  <section className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Video className="h-3.5 w-3.5 text-primary" /> Recordings ({detail.recordings.length})</h4>
                    {detail.recordings.length === 0 ? (
                      <p className="text-xs text-muted-foreground ">No video recordings.</p>
                    ) : (
                      <div className="space-y-3">
                        {detail.recordings.map((clip, idx) => (
                          <div key={clip.id} className="border rounded-lg overflow-hidden bg-background">
                            {clip.filePath && <video controls preload="metadata" src={fileUrl(clip.filePath)} className="w-full max-h-64 bg-black" />}
                            <div className="px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>Clip {idx + 1}{clip.durationMs ? ` · ${Math.round(clip.durationMs / 1000)}s` : ""}</span>
                              {clip.filePath && (
                                <a href={fileUrl(clip.filePath)} download={`recording-${idx + 1}.webm`} className="font-semibold text-primary dark:text-indigo-400 hover:underline">Download</a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screenshot lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Screenshot" className="max-w-full max-h-full object-contain rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.08)]" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  )
}
