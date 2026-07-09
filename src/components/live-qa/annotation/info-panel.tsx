"use client"

import { useRef, useState } from "react"
import {
  Info,
  Download,
  Share2,
  GitCompare,
  ChevronDown,
  Copy,
  FileText,
  FileJson,
  FileImage,
  Loader2,
  Check,
  Link2,
} from "lucide-react"
import { ScreenshotMetadata, Severity, SEVERITY_META, ISSUE_TEMPLATES } from "./types"

export type ExportFormat = "png" | "jpg" | "clipboard" | "pdf" | "json"

interface Props {
  metadata: ScreenshotMetadata
  setMetadata: (m: ScreenshotMetadata) => void
  onExport: (fmt: ExportFormat) => void
  onUploadCompare: (file: File) => void
  onShare: () => void
  sharing: boolean
  shareUrl: string | null
  exportingPdf: boolean
}

export function InfoPanel({ metadata, setMetadata, onExport, onUploadCompare, onShare, sharing, shareUrl, exportingPdf }: Props) {
  const [exportOpen, setExportOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const compareInput = useRef<HTMLInputElement | null>(null)
  const [tagInput, setTagInput] = useState("")

  const patch = (p: Partial<ScreenshotMetadata>) => setMetadata({ ...metadata, ...p })

  const applySeverity = (s: Severity) => {
    // Insert the QA template only when the description is empty or is another
    // (unedited) template, so we never clobber the user's own notes.
    const isTemplate = Object.values(ISSUE_TEMPLATES).includes(metadata.description.trim())
    const desc = !metadata.description.trim() || isTemplate ? ISSUE_TEMPLATES[s] : metadata.description
    patch({ severity: s, description: desc })
  }

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "")
    if (t && !metadata.tags.includes(t)) patch({ tags: [...metadata.tags, t] })
    setTagInput("")
  }

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1500)
    } catch {}
  }

  const exportItems: { fmt: ExportFormat; icon: any; label: string }[] = [
    { fmt: "png", icon: FileImage, label: "PNG (annotations burned in)" },
    { fmt: "jpg", icon: FileImage, label: "JPG" },
    { fmt: "clipboard", icon: Copy, label: "Copy to clipboard" },
    { fmt: "pdf", icon: FileText, label: "PDF report" },
    { fmt: "json", icon: FileJson, label: "JSON (annotation data)" },
  ]

  return (
    <div className="w-72 shrink-0 border-l bg-card overflow-y-auto flex flex-col">
      <div className="p-3 space-y-4 text-sm">
        {/* ── Metadata ── */}
        <section>
          <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground mb-2">
            <Info className="h-3.5 w-3.5" /> Screenshot Info
          </h3>
          <input
            value={metadata.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Title"
            className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
          />
          <textarea
            value={metadata.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Description / notes…"
            rows={4}
            className="w-full border rounded-md px-2.5 py-1.5 text-[13px] bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2 resize-none"
          />
          <input
            value={metadata.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="Page URL"
            className="w-full border rounded-md px-2.5 py-1.5 text-[12px] bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
          />
          {/* tags */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {metadata.tags.map((t) => (
              <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border flex items-center gap-1">
                #{t}
                <button onClick={() => patch({ tags: metadata.tags.filter((x) => x !== t) })} className="hover:text-red-600">×</button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
            placeholder="Add tag + Enter"
            className="w-full border rounded-md px-2.5 py-1 text-[12px] bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {/* auto-captured */}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <Auto label="Captured" value={metadata.capturedAt} />
            <Auto label="Dimensions" value={metadata.dimensions} />
            <Auto label="OS" value={metadata.os} />
            <Auto label="Browser" value={metadata.browser} />
          </dl>
        </section>

        {/* ── Issue templates ── */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-wide text-muted-foreground mb-2">Issue Severity</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(SEVERITY_META) as Severity[]).map((s) => (
              <button
                key={s}
                onClick={() => applySeverity(s)}
                className={`h-8 rounded-md text-[11px] font-black text-white transition-transform ${metadata.severity === s ? "ring-2 ring-offset-1 ring-indigo-400 scale-[1.02]" : ""}`}
                style={{ backgroundColor: SEVERITY_META[s].color }}
              >
                {SEVERITY_META[s].label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Compare ── */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-wide text-muted-foreground mb-2">Compare</h3>
          <input ref={compareInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadCompare(f); e.target.value = "" }} />
          <button onClick={() => compareInput.current?.click()} className="w-full h-9 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-muted">
            <GitCompare className="h-3.5 w-3.5" /> Upload image to compare
          </button>
        </section>

        {/* ── Export ── */}
        <section className="relative">
          <button onClick={() => setExportOpen((o) => !o)} className="w-full h-9 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {exportOpen && (
            <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg overflow-hidden">
              {exportItems.map((it) => (
                <button
                  key={it.fmt}
                  onClick={() => { setExportOpen(false); onExport(it.fmt) }}
                  disabled={it.fmt === "pdf" && exportingPdf}
                  className="w-full px-3 py-2 text-left text-[12px] font-medium flex items-center gap-2 hover:bg-muted disabled:opacity-50"
                >
                  {it.fmt === "pdf" && exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <it.icon className="h-3.5 w-3.5 text-muted-foreground" />}
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Share ── */}
        <section>
          <button onClick={onShare} disabled={sharing} className="w-full h-9 rounded-md border text-xs font-black flex items-center justify-center gap-1.5 hover:bg-muted disabled:opacity-60">
            {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Share link
          </button>
          {shareUrl && (
            <div className="mt-2 flex items-center gap-1 border rounded-md p-1.5 bg-muted/50">
              <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono truncate flex-1">{shareUrl}</span>
              <button onClick={copyLink} className="text-muted-foreground hover:text-foreground shrink-0" title="Copy link">
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Auto({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</dt>
      <dd className="font-medium text-foreground break-words">{value || "—"}</dd>
    </div>
  )
}
