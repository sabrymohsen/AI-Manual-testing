"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Package,
  FileJson,
  FileCode2,
  Network,
  FileText,
  Download,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Coffee,
  Monitor,
  Globe,
  Lock,
  FolderArchive,
  AlertTriangle
} from "lucide-react"

interface BundleEntry {
  name: string
  size: number
}
interface RedactionFinding {
  id: string
  label: string
  category: string
  count: number
  samples: string[]
}
interface BundleData {
  testName: string
  available: boolean
  traceId: string | null
  entries: BundleEntry[]
  metadata: {
    system: {
      shaftVersion: string | null
      javaVersion: string | null
      javaVendor: string | null
      os: string | null
      osVersion: string | null
      arch: string | null
      browser: string | null
    }
    config: { key: string; value: string }[]
    envAvailable: boolean
  }
  redaction: {
    rules: { id: string; label: string; category: string }[]
    findings: RedactionFinding[]
    totalHits: number
    privacyScore: number
  } | null
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function entryIcon(name: string) {
  const l = name.toLowerCase()
  if (l.endsWith(".har")) return Network
  if (l.endsWith(".json")) return FileJson
  if (l.endsWith(".html") || l.endsWith(".htm")) return FileCode2
  return FileText
}

function previewKind(name: string): "json" | "har" | "html" | "text" {
  const l = name.toLowerCase()
  if (l.endsWith(".har")) return "har"
  if (l.endsWith(".json")) return "json"
  if (l.endsWith(".html") || l.endsWith(".htm")) return "html"
  return "text"
}

export default function DiagnosticsBundlePanel({ diagnosisId, testName }: { diagnosisId: string; testName: string }) {
  const [data, setData] = useState<BundleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"files" | "redaction" | "metadata">("files")

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>("")
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hub/diagnoses/${diagnosisId}/bundle`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BundleData | null) => {
        setData(d)
        if (d?.available && d.entries.length > 0) {
          const first = d.entries.find((e) => e.name.endsWith(".json")) || d.entries[0]
          setSelectedFile(first.name)
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [diagnosisId])

  // Load preview for the selected file
  useEffect(() => {
    if (!selectedFile) return
    const kind = previewKind(selectedFile)
    if (kind === "html") {
      setPreview("")
      return
    }
    setPreviewLoading(true)
    fetch(`/api/hub/diagnoses/${diagnosisId}/bundle/file?name=${encodeURIComponent(selectedFile)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => {
        if (kind === "json" || kind === "har") {
          try {
            setPreview(JSON.stringify(JSON.parse(text), null, 2))
          } catch {
            setPreview(text)
          }
        } else {
          setPreview(text)
        }
      })
      .catch(() => setPreview("(could not read file)"))
      .finally(() => setPreviewLoading(false))
  }, [selectedFile, diagnosisId])

  const privacyBand = useMemo(() => {
    const s = data?.redaction?.privacyScore ?? 100
    return s >= 90
      ? { color: "text-emerald-600", ring: "#10b981", label: "Clean" }
      : s >= 70
      ? { color: "text-amber-600", ring: "#f59e0b", label: "Review" }
      : { color: "text-rose-600", ring: "#f43f5e", label: "At risk" }
  }, [data])

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-6 flex justify-center shadow-2xs">
        <Loader2 size={20} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!data || !data.available) {
    return (
      <div className="bg-white border rounded-2xl p-6 text-center space-y-2 shadow-2xs">
        <FolderArchive size={22} className="text-slate-300 mx-auto" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">No diagnostics bundle found</p>
        <p className="text-[9.5px] text-slate-400 font-medium max-w-md mx-auto">
          Every run saves a Playwright <span className="font-mono">trace.zip</span> per test. No matching bundle
          was found for <span className="font-mono">{testName}</span>.
        </p>
      </div>
    )
  }

  const selectedKind = selectedFile ? previewKind(selectedFile) : "text"

  return (
    <div className="bg-white border rounded-2xl shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap p-3.5 border-b">
        <Package size={15} className="text-indigo-600" />
        <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Diagnostics Bundle</span>
        <span className="font-mono text-[9px] text-slate-400 bg-slate-50 border rounded px-1.5 py-0.5">
          {data.entries.length} files · {fmtBytes(data.entries.reduce((s, e) => s + e.size, 0))}
        </span>
        <a
          href={`/api/hub/diagnoses/${diagnosisId}/bundle/file?name=__zip__`}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[10px] font-black"
        >
          <Download size={12} /> Download .zip
        </a>
      </div>

      {/* Sub-view tabs */}
      <div className="flex items-center gap-1 px-3 pt-2.5 border-b">
        {[
          { id: "files" as const, label: "Files", icon: FileJson },
          { id: "redaction" as const, label: "Redaction Report", icon: Lock },
          { id: "metadata" as const, label: "Metadata", icon: Cpu }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[10px] font-black transition-all border-b-2 -mb-px ${
              view === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      <div className="p-3.5">
        {/* ===== FILES ===== */}
        {view === "files" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Tree */}
            <div className="space-y-1">
              {data.entries.map((e) => {
                const Icon = entryIcon(e.name)
                const active = selectedFile === e.name
                return (
                  <button
                    key={e.name}
                    onClick={() => setSelectedFile(e.name)}
                    className={`w-full text-left px-2.5 py-2 rounded-xl border flex items-center gap-2 transition-all ${
                      active ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200" : "bg-white hover:border-slate-300"
                    }`}
                  >
                    <Icon size={13} className={active ? "text-indigo-600" : "text-slate-400"} />
                    <span className="text-[9.5px] font-bold text-slate-700 truncate flex-1">{e.name}</span>
                    <span className="text-[8px] font-mono text-slate-400">{fmtBytes(e.size)}</span>
                  </button>
                )
              })}
            </div>

            {/* Preview */}
            <div className="md:col-span-2">
              {selectedFile && (
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-400 truncate">{selectedFile}</span>
                  <a
                    href={`/api/hub/diagnoses/${diagnosisId}/bundle/file?name=${encodeURIComponent(selectedFile)}&download=1`}
                    className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-700 hover:text-indigo-900"
                  >
                    <Download size={10} /> file
                  </a>
                </div>
              )}
              {selectedKind === "html" ? (
                <iframe
                  title={selectedFile || "report"}
                  src={`/api/hub/diagnoses/${diagnosisId}/bundle/file?name=${encodeURIComponent(selectedFile || "")}`}
                  sandbox="allow-same-origin"
                  className="w-full h-[46vh] rounded-xl border bg-white"
                />
              ) : previewLoading ? (
                <div className="h-[46vh] flex items-center justify-center bg-slate-950 rounded-xl">
                  <Loader2 size={18} className="animate-spin text-indigo-400" />
                </div>
              ) : (
                <pre className="font-mono text-[9px] leading-relaxed bg-slate-950 text-slate-200 rounded-xl p-3 overflow-auto h-[46vh] whitespace-pre-wrap">
                  {preview}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* ===== REDACTION ===== */}
        {view === "redaction" && data.redaction && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Privacy score */}
            <div className="bg-slate-50 border rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke={privacyBand.ring}
                    strokeWidth="3.5"
                    strokeDasharray={`${(data.redaction.privacyScore / 100) * 94.2} 94.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-black text-slate-800">{data.redaction.privacyScore}</span>
                  <span className={`text-[7px] font-black uppercase ${privacyBand.color}`}>{privacyBand.label}</span>
                </span>
              </div>
              <p className="text-[9px] uppercase font-black text-slate-400 mt-2">Privacy Score</p>
              <p className="text-[8.5px] text-slate-400 font-medium mt-1 leading-relaxed">
                {data.redaction.totalHits === 0
                  ? "No residual sensitive patterns detected in the sanitized bundle."
                  : `${data.redaction.totalHits} sensitive pattern${data.redaction.totalHits === 1 ? "" : "s"} detected in the bundle.`}
              </p>
            </div>

            {/* Findings */}
            <div className="md:col-span-2 space-y-3">
              <div>
                <span className="text-[9px] uppercase font-black text-slate-400 flex items-center gap-1.5">
                  {data.redaction.totalHits === 0 ? (
                    <ShieldCheck size={12} className="text-emerald-500" />
                  ) : (
                    <ShieldAlert size={12} className="text-rose-500" />
                  )}
                  Sensitive-data scan
                </span>
                <div className="mt-2 space-y-1.5">
                  {data.redaction.findings.map((f) => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                        f.count > 0 ? "bg-rose-50/50 border-rose-100" : "bg-slate-50 border-slate-100"
                      }`}
                    >
                      {f.count > 0 ? (
                        <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                      ) : (
                        <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
                      )}
                      <span className="text-[9.5px] font-bold text-slate-700">{f.label}</span>
                      {f.samples.length > 0 && (
                        <span className="font-mono text-[8.5px] text-slate-400 truncate">{f.samples.join("  ")}</span>
                      )}
                      <span
                        className={`ml-auto font-mono font-black text-[9px] rounded-full px-2 py-0.5 ${
                          f.count > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {f.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[9px] uppercase font-black text-slate-400 flex items-center gap-1.5">
                  <Lock size={11} /> Redaction rules applied
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {data.redaction.rules.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded-full bg-white border text-slate-600 px-2 py-0.5 text-[8.5px] font-black"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> {r.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== METADATA ===== */}
        {view === "metadata" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { icon: Package, label: "Playwright", value: data.metadata.system.shaftVersion },
                { icon: Coffee, label: "Java", value: data.metadata.system.javaVersion },
                { icon: Monitor, label: "OS", value: data.metadata.system.os },
                { icon: Cpu, label: "Arch", value: data.metadata.system.arch },
                { icon: Globe, label: "Browser", value: data.metadata.system.browser },
                { icon: Coffee, label: "JVM Vendor", value: data.metadata.system.javaVendor }
              ].map((m) => (
                <div key={m.label} className="bg-slate-50 border rounded-xl p-2.5">
                  <span className="text-[8px] uppercase font-black text-slate-400 flex items-center gap-1">
                    <m.icon size={9} /> {m.label}
                  </span>
                  <p className="text-[10px] font-black text-slate-800 mt-1 truncate" title={m.value || undefined}>
                    {m.value || "—"}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <span className="text-[9px] uppercase font-black text-slate-400">Test configuration snapshot</span>
              {data.metadata.config.length === 0 ? (
                <p className="text-[9px] text-slate-400 italic mt-1.5">
                  No configuration captured (environment.xml unavailable).
                </p>
              ) : (
                <div className="mt-2 border rounded-xl overflow-hidden">
                  <table className="w-full text-[9.5px]">
                    <tbody>
                      {data.metadata.config.map((c, i) => (
                        <tr key={c.key} className={i % 2 ? "bg-slate-50/50" : ""}>
                          <td className="px-3 py-1.5 font-mono text-slate-500 border-r">{c.key}</td>
                          <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{c.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
