"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Video,
  Film,
  Play,
  Search,
  Loader2,
  X,
  Maximize,
  SkipBack,
  SkipForward,
  AlertTriangle,
  Clock,
  HardDrive,
  Trash2,
  Scissors,
  Settings as SettingsIcon,
  CheckCircle2,
  XCircle,
  Zap,
  Save,
  Circle
} from "lucide-react"

// ---------- Types ----------

interface VideoItem {
  id: string
  testName: string
  browser: string | null
  status: string
  executionStatus: string | null
  stepNumber: number
  description: string
  tags: string[]
  isClip: boolean
  createdAt: string
  fileExists: boolean
  url: string
}
interface ActionMarker {
  index: number
  name: string
  category: string
  status: string
  offsetSec: number
  durationMs: number
}
interface VideoSettings {
  recordVideo: boolean
  scope: string
  quality: string
  format: string
  autoDeleteDays: number
  maxStorageMb: number
}
interface Storage {
  count: number
  bytes: number
  mb: number
}

const SPEEDS = [0.5, 1, 1.5, 2]

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

const statusCls = (s: string) =>
  s === "pass" || s === "Passed"
    ? "text-emerald-600"
    : s === "fail" || s === "Failed"
    ? "text-rose-600"
    : "text-amber-600"

// ---------- Component ----------

export default function VideoLabSection({
  initialVideoId = null,
  onConsumedInitialVideo
}: {
  initialVideoId?: string | null
  onConsumedInitialVideo?: () => void
} = {}) {
  const [subTab, setSubTab] = useState<"gallery" | "settings" | "clips">("gallery")
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [clips, setClips] = useState<VideoItem[]>([])
  const [browsers, setBrowsers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [browserFilter, setBrowserFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "longest">("newest")
  const [durations, setDurations] = useState<Record<string, number>>({})

  const [player, setPlayer] = useState<VideoItem | null>(null)
  const [settings, setSettings] = useState<VideoSettings | null>(null)
  const [storage, setStorage] = useState<Storage | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const loadVideos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (query) params.set("q", query)
      const res = await fetch(`/api/hub/videos?${params}`)
      if (res.ok) {
        const d = await res.json()
        setVideos(d.videos || [])
        setBrowsers(d.browsers || [])
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter, query])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  // Clips + settings loaded lazily per sub-tab
  useEffect(() => {
    if (subTab === "clips") {
      fetch("/api/hub/videos?clips=only")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setClips(d.videos || []))
        .catch(() => {})
    }
    if (subTab === "settings") {
      fetch("/api/hub/videos/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return
          setSettings(d.settings)
          setStorage(d.storage)
        })
        .catch(() => {})
    }
  }, [subTab])

  // Deep-link from Evidence Vault
  useEffect(() => {
    if (!initialVideoId) return
    fetch(`/api/hub/videos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v = (d?.videos || []).find((x: VideoItem) => x.id === initialVideoId)
        if (v) setPlayer(v)
        onConsumedInitialVideo?.()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideoId])

  const patchSettings = async (patch: Partial<VideoSettings>) => {
    setSavingSettings(true)
    try {
      const res = await fetch("/api/hub/videos/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      })
      if (res.ok) setSettings((await res.json()).settings)
    } finally {
      setSavingSettings(false)
    }
  }

  const runCleanup = async () => {
    setCleaning(true)
    try {
      const res = await fetch("/api/hub/videos/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      if (res.ok) {
        const d = await res.json()
        setStorage(d.storage)
        loadVideos()
      }
    } finally {
      setCleaning(false)
    }
  }

  // Client-side filter + sort (browser filter + duration sort need client data)
  const shown = videos
    .filter((v) => browserFilter === "all" || v.browser === browserFilter)
    .sort((a, b) => {
      if (sortBy === "longest") return (durations[b.id] || 0) - (durations[a.id] || 0)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  const SUB_TABS = [
    { id: "gallery" as const, label: "Video Gallery", icon: Film },
    { id: "settings" as const, label: "Recording Settings", icon: SettingsIcon },
    { id: "clips" as const, label: "Clips", icon: Scissors }
  ]

  const VideoCard = ({ v }: { v: VideoItem }) => (
    <button
      onClick={() => setPlayer(v)}
      className="text-left bg-white border rounded-2xl shadow-sm overflow-hidden hover:ring-2 hover:ring-indigo-200 transition-all group"
    >
      <div className="relative bg-slate-950">
        {v.fileExists ? (
          <video
            src={`${v.url}#t=0.1`}
            preload="metadata"
            muted
            onLoadedMetadata={(e) => {
              const d = (e.target as HTMLVideoElement).duration
              if (isFinite(d)) setDurations((cur) => (cur[v.id] ? cur : { ...cur, [v.id]: d }))
            }}
            className="w-full h-36 object-cover"
          />
        ) : (
          <div className="w-full h-36 flex items-center justify-center text-slate-600">
            <Video size={22} />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow group-hover:scale-110 transition-transform">
            <Play size={15} className="text-indigo-700 fill-current ml-0.5" />
          </span>
        </span>
        {durations[v.id] !== undefined && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[8px] font-black rounded px-1.5 py-0.5 font-mono">
            {fmtTime(durations[v.id])}
          </span>
        )}
        {v.isClip && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 bg-indigo-600 text-white text-[7.5px] font-black uppercase rounded px-1.5 py-0.5">
            <Scissors size={8} /> clip
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-[10px] font-black text-slate-800 truncate">{v.testName}</p>
        <div className="flex items-center gap-1.5 text-[8.5px] font-bold">
          {v.browser && <span className="bg-slate-100 border rounded px-1 py-px text-slate-500 uppercase">{v.browser}</span>}
          <span className={`uppercase font-black ${statusCls(v.status)}`}>{v.status}</span>
          <span className="ml-auto text-slate-400 font-mono">{new Date(v.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border w-fit select-none">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === t.id ? "bg-white text-indigo-700 shadow-sm border" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ============ GALLERY ============ */}
      {subTab === "gallery" && (
        <>
          <div className="bg-white border rounded-2xl p-2.5 shadow-sm flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search test / tag..." className="w-full h-8 rounded-xl border pl-8 pr-3 text-[10px] bg-slate-50 font-semibold" />
            </div>
            <select value={browserFilter} onChange={(e) => setBrowserFilter(e.target.value)} className="h-8 rounded-xl border px-2 text-[10px] bg-slate-50 font-bold cursor-pointer">
              <option value="all">All Browsers</option>
              {browsers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-xl border px-2 text-[10px] bg-slate-50 font-bold cursor-pointer">
              <option value="all">All Status</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-8 rounded-xl border px-2 text-[10px] bg-slate-50 font-bold cursor-pointer">
              <option value="newest">Newest first</option>
              <option value="longest">Longest first</option>
            </select>
          </div>

          {loading ? (
            <div className="py-20 flex justify-center bg-white border rounded-2xl">
              <Loader2 size={22} className="animate-spin text-indigo-600" />
            </div>
          ) : shown.length === 0 ? (
            <div className="py-16 text-center bg-white border rounded-2xl space-y-2">
              <Video size={26} className="text-slate-300 mx-auto" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">No test videos yet</p>
              <p className="text-[9.5px] text-slate-400 font-medium max-w-md mx-auto">
                Enable <span className="font-mono">videoParams.recordVideo</span> in Recording Settings, then run a
                non-headless test — recordings land here and in the Evidence Vault.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {shown.map((v) => (
                <VideoCard key={v.id} v={v} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ CLIPS ============ */}
      {subTab === "clips" && (
        <>
          {clips.length === 0 ? (
            <div className="py-16 text-center bg-white border rounded-2xl space-y-2">
              <Scissors size={24} className="text-slate-300 mx-auto" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">No clips yet</p>
              <p className="text-[9.5px] text-slate-400 font-medium">Open a video and use the Clip Creator to cut a highlight for bug reports or demos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {clips.map((v) => (
                <VideoCard key={v.id} v={v} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ SETTINGS ============ */}
      {subTab === "settings" && settings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-4">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5 border-b pb-2">
              <SettingsIcon size={13} className="text-indigo-600" /> Recording {savingSettings && <Loader2 size={11} className="animate-spin text-indigo-400" />}
            </span>
            <div className="flex items-center justify-between p-3 border rounded-xl bg-slate-50/50">
              <div>
                <span className="text-[10.5px] font-black text-slate-800 block">Enable Video Recording</span>
                <span className="text-[8px] text-slate-400 font-medium">Saved to the hub's run settings</span>
              </div>
              <button onClick={() => patchSettings({ recordVideo: !settings.recordVideo })} className={`h-6 w-11 rounded-full relative transition-colors ${settings.recordVideo ? "bg-indigo-600" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.recordVideo ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] uppercase font-black text-slate-400 block mb-1">Scope</label>
                <select value={settings.scope} onChange={(e) => patchSettings({ scope: e.target.value })} className="w-full h-8 rounded-lg border px-2 text-[10px] font-bold bg-slate-50 cursor-pointer">
                  <option value="DriverSession">Per-test</option>
                  <option value="TestRun">Whole run</option>
                </select>
              </div>
              <div>
                <label className="text-[8px] uppercase font-black text-slate-400 block mb-1">Quality</label>
                <select value={settings.quality} onChange={(e) => patchSettings({ quality: e.target.value })} className="w-full h-8 rounded-lg border px-2 text-[10px] font-bold bg-slate-50 cursor-pointer">
                  {["Low", "Medium", "High"].map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[8px] uppercase font-black text-slate-400 block mb-1">Format</label>
                <select value={settings.format} onChange={(e) => patchSettings({ format: e.target.value })} className="w-full h-8 rounded-lg border px-2 text-[10px] font-bold bg-slate-50 cursor-pointer">
                  <option value="webm">WebM</option>
                  <option value="mp4">MP4</option>
                </select>
              </div>
              <div>
                <label className="text-[8px] uppercase font-black text-slate-400 block mb-1">Auto-delete (days, 0=off)</label>
                <input type="number" min={0} value={settings.autoDeleteDays} onChange={(e) => setSettings({ ...settings, autoDeleteDays: Number(e.target.value) })} onBlur={(e) => patchSettings({ autoDeleteDays: Number(e.target.value) })} className="w-full h-8 rounded-lg border px-2 text-[10px] font-bold bg-slate-50" />
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5 border-b pb-2">
              <HardDrive size={13} className="text-indigo-600" /> Storage
            </span>
            {storage && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-800">{storage.mb} <span className="text-[10px] text-slate-400">MB</span></span>
                  <span className="text-[9px] font-bold text-slate-400">{storage.count} videos · limit {settings.maxStorageMb} MB</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${storage.mb > settings.maxStorageMb ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${Math.min(100, (storage.mb / settings.maxStorageMb) * 100)}%` }} />
                </div>
                <div>
                  <label className="text-[8px] uppercase font-black text-slate-400 block mb-1">Max storage limit (MB)</label>
                  <input type="number" min={50} value={settings.maxStorageMb} onChange={(e) => setSettings({ ...settings, maxStorageMb: Number(e.target.value) })} onBlur={(e) => patchSettings({ maxStorageMb: Number(e.target.value) })} className="w-full h-8 rounded-lg border px-2 text-[10px] font-bold bg-slate-50" />
                </div>
                <button onClick={runCleanup} disabled={cleaning || !settings.autoDeleteDays} className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-xl border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-40 text-[10px] font-black">
                  {cleaning ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Clean up videos older than {settings.autoDeleteDays || "—"} days
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ PLAYER MODAL ============ */}
      {player && <PlayerModal video={player} onClose={() => setPlayer(null)} onClip={() => { if (subTab === "clips") fetch("/api/hub/videos?clips=only").then((r) => r.json()).then((d) => setClips(d.videos || [])).catch(() => {}) }} />}
    </div>
  )
}

// ---------- Player modal ----------

function PlayerModal({ video, onClose, onClip }: { video: VideoItem; onClose: () => void; onClip: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [actions, setActions] = useState<ActionMarker[]>([])
  const [failureOffset, setFailureOffset] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [speed, setSpeed] = useState(1)

  // Clip creator
  const [showClip, setShowClip] = useState(false)
  const [clipIn, setClipIn] = useState<number | null>(null)
  const [clipOut, setClipOut] = useState<number | null>(null)
  const [clipTitle, setClipTitle] = useState("")
  const [clipDesc, setClipDesc] = useState("")
  const [creatingClip, setCreatingClip] = useState(false)
  const [clipDone, setClipDone] = useState(false)

  useEffect(() => {
    fetch(`/api/hub/videos/${video.id}/actions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setActions(d.actions || [])
        setFailureOffset(d.failureOffsetSec)
      })
      .catch(() => {})
  }, [video.id])

  const seek = (t: number) => {
    const v = videoRef.current
    if (v) {
      v.currentTime = Math.max(0, Math.min(t, duration || t))
      v.play().catch(() => {})
    }
  }

  const setRate = (r: number) => {
    setSpeed(r)
    if (videoRef.current) videoRef.current.playbackRate = r
  }

  const stepAction = (dir: 1 | -1) => {
    if (actions.length === 0) return
    const offs = actions.map((a) => a.offsetSec)
    if (dir === 1) {
      const next = offs.find((o) => o > current + 0.05)
      if (next !== undefined) seek(next)
    } else {
      const prev = [...offs].reverse().find((o) => o < current - 0.05)
      seek(prev ?? 0)
    }
  }

  const fullscreen = () => videoRef.current?.requestFullscreen?.()

  const createClip = async () => {
    if (clipIn === null || clipOut === null || clipOut <= clipIn) return
    setCreatingClip(true)
    try {
      const res = await fetch("/api/hub/videos/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceEvidenceId: video.id, startSec: clipIn, endSec: clipOut, title: clipTitle || "clip", description: clipDesc })
      })
      if (res.ok) {
        setClipDone(true)
        onClip()
        setTimeout(() => setClipDone(false), 2500)
        setClipIn(null)
        setClipOut(null)
        setClipTitle("")
        setClipDesc("")
      }
    } finally {
      setCreatingClip(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <span className="text-sm font-black text-slate-900">{video.testName}</span>
            <span className="text-[9px] font-bold text-slate-400 ml-2 uppercase">{video.browser} · <span className={statusCls(video.status)}>{video.status}</span></span>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <video
          ref={videoRef}
          src={video.url}
          controls
          onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
          onTimeUpdate={(e) => setCurrent((e.target as HTMLVideoElement).currentTime)}
          className="w-full max-h-[52vh] bg-slate-950 rounded-xl"
        />

        {/* Action-marker timeline */}
        {actions.length > 0 && duration > 0 && (
          <div className="space-y-1">
            <div className="relative h-6 bg-slate-100 rounded-lg">
              {actions.map((a) => (
                <button
                  key={a.index}
                  onClick={() => seek(a.offsetSec)}
                  title={`${a.name} @ ${fmtTime(a.offsetSec)}`}
                  style={{ left: `${Math.min(100, (a.offsetSec / duration) * 100)}%` }}
                  className={`absolute top-0 -translate-x-1/2 h-6 w-1.5 rounded-full ${a.status === "failed" ? "bg-rose-500" : "bg-indigo-400"} hover:w-2.5 transition-all`}
                />
              ))}
              {/* playhead */}
              <div className="absolute top-0 h-6 w-0.5 bg-slate-900" style={{ left: `${Math.min(100, (current / duration) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[8px] font-mono font-bold text-slate-400">
              <span>{fmtTime(current)}</span>
              <span>{actions.length} actions</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => stepAction(-1)} className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Previous action"><SkipBack size={13} /></button>
          <button onClick={() => stepAction(1)} className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Next action"><SkipForward size={13} /></button>

          <div className="flex items-center bg-slate-100 border rounded-lg p-0.5">
            {SPEEDS.map((r) => (
              <button key={r} onClick={() => setRate(r)} className={`px-2 py-1 rounded-md text-[9px] font-black ${speed === r ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{r}×</button>
            ))}
          </div>

          {failureOffset !== null && (
            <button onClick={() => seek(failureOffset)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-[9.5px] font-black">
              <Zap size={11} /> Jump to Failure
            </button>
          )}

          <button onClick={fullscreen} className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-500 hover:bg-slate-50 ml-auto" title="Fullscreen"><Maximize size={13} /></button>
          <button onClick={() => setShowClip((v) => !v)} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[9.5px] font-black ${showClip ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600"}`}>
            <Scissors size={12} /> Clip
          </button>
        </div>

        {/* Clip creator */}
        {showClip && (
          <div className="bg-slate-50 border rounded-xl p-3 space-y-2.5">
            <span className="text-[9px] uppercase font-black text-slate-500 flex items-center gap-1.5"><Scissors size={11} className="text-indigo-600" /> Clip Creator</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setClipIn(current)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border bg-white text-slate-600 text-[9px] font-black"><Circle size={9} /> Set In {clipIn !== null && `(${fmtTime(clipIn)})`}</button>
              <button onClick={() => setClipOut(current)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border bg-white text-slate-600 text-[9px] font-black"><Circle size={9} /> Set Out {clipOut !== null && `(${fmtTime(clipOut)})`}</button>
              {clipIn !== null && clipOut !== null && clipOut > clipIn && (
                <span className="text-[9px] font-mono font-black text-indigo-700">length {fmtTime(clipOut - clipIn)}</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={clipTitle} onChange={(e) => setClipTitle(e.target.value)} placeholder="Clip title" className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-white" />
              <input value={clipDesc} onChange={(e) => setClipDesc(e.target.value)} placeholder="Description (optional)" className="h-8 rounded-lg border px-2 text-[10px] font-semibold bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createClip}
                disabled={creatingClip || clipIn === null || clipOut === null || (clipOut ?? 0) <= (clipIn ?? 0)}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[10px] font-black"
              >
                {creatingClip ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Create Clip
              </button>
              {clipDone && <span className="text-[9px] font-black text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Clip saved to Clips + Evidence Vault</span>}
              <span className="text-[8px] text-slate-400 font-medium ml-auto">Cut with ffmpeg — appears in Clips & Evidence Vault</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
