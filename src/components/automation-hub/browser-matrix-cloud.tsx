"use client"

import { useEffect, useState } from "react"
import {
  Cloud,
  Server,
  Zap,
  Boxes,
  Save,
  ExternalLink,
  DollarSign,
  Clock,
  Cpu,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  Gauge,
  Plus,
  Radio,
  KeyRound,
  Film
} from "lucide-react"

// ---------- Types ----------

interface ParallelConfig {
  crossBrowserMode: string
  parallel: string
  threadCount: number
  onDocker: boolean
  executionAddress: string
}
interface DockerStatus {
  installed: boolean
  running: boolean
  containers: { name: string; image: string; status: string }[]
}
interface Savings {
  testCount: number
  browserCount: number
  sequentialMs: number
  parallelMs: number
  savedMs: number
  savedPct: number
  estimatedContainers: number
  estimatedMemoryMb: number
}
interface BsSession {
  id: string
  testName: string
  status: string
  durationMs: number | null
  createdAt: string
}
interface BsStatus {
  configured: boolean
  username: string | null
  targetName: string | null
  dashboardUrl: string
  cloudRuns: number
  sessions: BsSession[]
  usage: { minutesThisMonth: number; ratePerMinute: number }
  costEstimate: { sessionsPerRun: number; avgRunMinutes: number; estMinutesPerRun: number; estCostPerRun: number }
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ---------- Component ----------

export default function BrowserMatrixCloudPanel() {
  const [parallel, setParallel] = useState<ParallelConfig | null>(null)
  const [docker, setDocker] = useState<DockerStatus | null>(null)
  const [savings, setSavings] = useState<Savings | null>(null)
  const [bs, setBs] = useState<BsStatus | null>(null)
  const [yml, setYml] = useState("")
  const [ymlDirty, setYmlDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ymlSaving, setYmlSaving] = useState(false)

  // Quick platform-add form
  const [pf, setPf] = useState({ os: "Windows", browser: "chrome", version: "latest", device: "", realMobile: false })

  const loadParallel = () =>
    fetch("/api/hub/browser-matrix/parallel")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setParallel(d.config)
        setDocker(d.docker)
        setSavings(d.savings)
      })
      .catch(() => {})

  useEffect(() => {
    Promise.all([
      loadParallel(),
      fetch("/api/hub/browserstack")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return
          setBs(d.status)
          setYml(d.config.yml)
        })
        .catch(() => {})
    ]).finally(() => setLoading(false))
  }, [])

  const patchParallel = async (patch: Partial<{ crossBrowserMode: string; threadCount: number; onDocker: boolean }>) => {
    setSaving(true)
    try {
      const res = await fetch("/api/hub/browser-matrix/parallel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      })
      if (res.ok) {
        const d = await res.json()
        setParallel(d.config)
      }
    } finally {
      setSaving(false)
    }
  }

  const saveYml = async () => {
    setYmlSaving(true)
    try {
      const res = await fetch("/api/hub/browserstack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yml })
      })
      if (res.ok) {
        setYmlDirty(false)
        // refresh cost estimate (platform count may have changed)
        fetch("/api/hub/browserstack")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setBs(d.status))
          .catch(() => {})
      }
    } finally {
      setYmlSaving(false)
    }
  }

  const addPlatform = () => {
    const block = pf.realMobile
      ? `  - deviceName: ${pf.device || "iPhone 15"}\n    osVersion: "latest"\n    browserName: ${pf.browser}\n    realMobile: true\n`
      : `  - os: ${pf.os}\n    osVersion: "latest"\n    browserName: ${pf.browser}\n    browserVersion: ${pf.version}\n`
    const lines = yml.split("\n")
    const idx = lines.findIndex((l) => /^platforms:/.test(l.trim()))
    if (idx >= 0) {
      lines.splice(idx + 1, 0, block.replace(/\n$/, ""))
      setYml(lines.join("\n"))
    } else {
      setYml(`${yml}\nplatforms:\n${block}`)
    }
    setYmlDirty(true)
  }

  if (loading) {
    return (
      <div className="py-20 flex justify-center bg-white border rounded-2xl">
        <Loader2 size={22} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  const isParallel = parallel?.crossBrowserMode === "parallelized"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left">
      {/* ============ CROSS-BROWSER PARALLEL MODE ============ */}
      <div className="space-y-4">
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <Zap size={15} className="text-indigo-600" />
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Cross-Browser Parallel Mode</span>
            {saving && <Loader2 size={12} className="animate-spin text-indigo-400 ml-auto" />}
          </div>

          {/* Parallel toggle */}
          <div className="flex items-center justify-between p-3 border rounded-xl bg-slate-50/50">
            <div>
              <span className="text-[10.5px] font-black text-slate-800 block">Parallel Execution</span>
              <span className="text-[8.5px] text-slate-400 font-medium">
                {isParallel ? "All browsers run simultaneously" : "Browsers run sequentially"}
              </span>
            </div>
            <button
              onClick={() => patchParallel({ crossBrowserMode: isParallel ? "off" : "parallelized" })}
              className={`h-6 w-11 rounded-full relative transition-colors ${isParallel ? "bg-indigo-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isParallel ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Thread count */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9.5px] font-bold">
              <span className="text-slate-500">Thread count</span>
              <span className="text-indigo-700 font-black font-mono">{parallel?.threadCount}</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              value={parallel?.threadCount || 1}
              disabled={!isParallel}
              onChange={(e) => setParallel((c) => (c ? { ...c, threadCount: Number(e.target.value) } : c))}
              onMouseUp={(e) => patchParallel({ threadCount: Number((e.target as HTMLInputElement).value) })}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
            />
          </div>

          {/* Docker */}
          <div className="p-3 border rounded-xl bg-slate-50/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Boxes size={13} className="text-slate-500" />
                <span className="text-[10.5px] font-black text-slate-800">Run on Docker</span>
              </div>
              <button
                onClick={() => patchParallel({ onDocker: !parallel?.onDocker })}
                className={`h-6 w-11 rounded-full relative transition-colors ${parallel?.onDocker ? "bg-indigo-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${parallel?.onDocker ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            <p className="text-[8.5px] text-slate-400 font-medium leading-relaxed">
              Writes <span className="font-mono">executionAddress=dockerized</span> — SHAFT auto-pulls Selenium/Playwright
              images and manages containers at run time.
            </p>
            {/* Real docker daemon status */}
            <div className="flex items-center gap-2 text-[8.5px] font-black">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                  docker?.running
                    ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                    : docker?.installed
                    ? "bg-amber-50 text-amber-600 border-amber-100"
                    : "bg-slate-100 text-slate-400 border-slate-200"
                }`}
              >
                <Radio size={8} className={docker?.running ? "animate-pulse" : ""} />
                {docker?.running ? "Daemon running" : docker?.installed ? "Installed · daemon stopped" : "Not installed"}
              </span>
              {docker?.running && (
                <span className="text-slate-400 font-bold">{docker.containers.length} test container(s)</span>
              )}
            </div>
            {docker?.running && docker.containers.length > 0 && (
              <div className="space-y-1">
                {docker.containers.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[8px] font-mono text-slate-500 bg-white border rounded px-2 py-1">
                    <span className="font-black text-slate-700 truncate">{c.name}</span>
                    <span className="truncate text-slate-400">{c.image}</span>
                    <span className="ml-auto text-emerald-600">{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Execution summary */}
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5 border-b pb-2">
            <Gauge size={13} className="text-indigo-600" /> Execution Summary
          </span>
          {savings && savings.testCount > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[8px] uppercase font-black text-slate-400">Sequential</p>
                  <p className="text-sm font-black text-slate-700 mt-0.5">{fmtMs(savings.sequentialMs)}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase font-black text-slate-400">Parallel</p>
                  <p className="text-sm font-black text-indigo-600 mt-0.5">{fmtMs(savings.parallelMs)}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase font-black text-slate-400">Saved</p>
                  <p className="text-sm font-black text-emerald-600 mt-0.5">
                    {fmtMs(savings.savedMs)} <span className="text-[9px]">({savings.savedPct}%)</span>
                  </p>
                </div>
              </div>
              {/* comparison bars */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-slate-400 w-16">Sequential</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-400" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-slate-400 w-16">Parallel</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${Math.max(4, (savings.parallelMs / (savings.sequentialMs || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500 pt-1 border-t">
                <span className="inline-flex items-center gap-1">
                  <Boxes size={11} className="text-slate-400" /> ~{savings.estimatedContainers} containers
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cpu size={11} className="text-slate-400" /> ~{(savings.estimatedMemoryMb / 1024).toFixed(1)} GB est.
                </span>
                <span className="ml-auto text-slate-400">{savings.testCount} tests · {savings.browserCount} browsers</span>
              </div>
            </>
          ) : (
            <p className="text-[9.5px] text-slate-400 italic text-center py-6">
              No cross-browser results yet — run the Browser Matrix to compute time savings.
            </p>
          )}
        </div>
      </div>

      {/* ============ BROWSERSTACK CLOUD ============ */}
      <div className="space-y-4">
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Cloud size={15} className="text-indigo-600" />
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">BrowserStack Cloud</span>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[8px] font-black uppercase ${
                bs?.configured ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
              }`}
            >
              <KeyRound size={8} /> {bs?.configured ? `creds: ${bs.username}` : "no credentials"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={bs?.dashboardUrl || "https://automate.browserstack.com"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[9.5px] font-black"
            >
              <ExternalLink size={11} /> Automate Dashboard
            </a>
            {bs?.targetName && (
              <span className="text-[9px] font-mono font-bold text-slate-400">target: {bs.targetName}</span>
            )}
          </div>

          {/* browserstack.yml editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] uppercase font-black text-slate-400 flex items-center gap-1">
                <Server size={10} /> browserstack.yml
              </span>
              <button
                onClick={saveYml}
                disabled={!ymlDirty || ymlSaving}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[9px] font-black"
              >
                {ymlSaving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save{ymlDirty ? " *" : ""}
              </button>
            </div>
            <textarea
              value={yml}
              onChange={(e) => {
                setYml(e.target.value)
                setYmlDirty(true)
              }}
              spellCheck={false}
              className="w-full h-44 rounded-xl border bg-slate-950 text-slate-200 font-mono text-[9px] leading-relaxed p-3 resize-y"
            />
          </div>

          {/* Quick platform add */}
          <div className="bg-slate-50 border rounded-xl p-2.5 space-y-2">
            <span className="text-[8.5px] uppercase font-black text-slate-400">Add platform</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {!pf.realMobile ? (
                <select value={pf.os} onChange={(e) => setPf({ ...pf, os: e.target.value })} className="h-7 rounded-lg border px-1.5 text-[9px] font-bold bg-white cursor-pointer">
                  {["Windows", "OS X"].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={pf.device}
                  onChange={(e) => setPf({ ...pf, device: e.target.value })}
                  placeholder="Device (e.g. iPhone 15)"
                  className="h-7 rounded-lg border px-2 text-[9px] font-bold bg-white w-32"
                />
              )}
              <select value={pf.browser} onChange={(e) => setPf({ ...pf, browser: e.target.value })} className="h-7 rounded-lg border px-1.5 text-[9px] font-bold bg-white cursor-pointer">
                {["chrome", "firefox", "edge", "safari", "samsung"].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {!pf.realMobile && (
                <select value={pf.version} onChange={(e) => setPf({ ...pf, version: e.target.value })} className="h-7 rounded-lg border px-1.5 text-[9px] font-bold bg-white cursor-pointer">
                  {["latest", "latest-1", "latest-2"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setPf({ ...pf, realMobile: !pf.realMobile })}
                className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg border text-[8.5px] font-black uppercase ${
                  pf.realMobile ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500"
                }`}
              >
                <Smartphone size={10} /> Real device
              </button>
              <button
                onClick={addPlatform}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[9px] font-black ml-auto"
              >
                <Plus size={11} /> Add
              </button>
            </div>
          </div>
        </div>

        {/* Cost + usage */}
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5 border-b pb-2">
            <DollarSign size={13} className="text-indigo-600" /> Cost Estimation & Usage
          </span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 border rounded-xl p-2">
              <p className="text-[7.5px] uppercase font-black text-slate-400">Sessions / run</p>
              <p className="text-base font-black text-slate-800 mt-0.5">{bs?.costEstimate.sessionsPerRun}</p>
            </div>
            <div className="bg-slate-50 border rounded-xl p-2">
              <p className="text-[7.5px] uppercase font-black text-slate-400">Est. min / run</p>
              <p className="text-base font-black text-slate-800 mt-0.5">{bs?.costEstimate.estMinutesPerRun}</p>
            </div>
            <div className="bg-slate-50 border rounded-xl p-2">
              <p className="text-[7.5px] uppercase font-black text-slate-400">Est. $ / run</p>
              <p className="text-base font-black text-emerald-600 mt-0.5">${bs?.costEstimate.estCostPerRun}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 pt-1 border-t">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} className="text-slate-400" /> Used this month
            </span>
            <span className="font-mono font-black text-slate-800">{bs?.usage.minutesThisMonth ?? 0} min</span>
          </div>
          <p className="text-[7.5px] text-slate-400 font-medium leading-relaxed">
            Estimate = platforms × parallels × avg run minutes × ${bs?.usage.ratePerMinute}/min. Usage is tracked from your
            BrowserStack-targeted executions.
          </p>
        </div>

        {/* Sessions */}
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-2">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5 border-b pb-2">
            <Film size={13} className="text-indigo-600" /> Cloud Sessions
          </span>
          {bs && bs.sessions.length > 0 ? (
            <div className="space-y-1.5">
              {bs.sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2 p-2 border rounded-xl text-[9px]">
                  {s.status === "Passed" ? (
                    <CheckCircle2 size={12} className="text-emerald-500" />
                  ) : s.status === "Failed" ? (
                    <XCircle size={12} className="text-rose-500" />
                  ) : (
                    <AlertTriangle size={12} className="text-amber-500" />
                  )}
                  <span className="font-bold text-slate-700 truncate">{s.testName}</span>
                  <span className="font-mono text-[8px] text-slate-400 truncate">{s.id.slice(0, 8)}</span>
                  <span className="ml-auto font-mono text-slate-400">{s.durationMs ? fmtMs(s.durationMs) : "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[9px] text-slate-400 italic text-center py-4 leading-relaxed">
              No BrowserStack sessions yet. Sessions, IDs and video playback appear here after a cloud run against a{" "}
              <span className="font-mono">browserstack</span> execution target.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
