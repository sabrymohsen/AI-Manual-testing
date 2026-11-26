"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  Upload, FileText, Sparkles, Save, Check, ChevronRight, ChevronLeft,
  Loader2, AlertCircle, Settings, Eye, ListChecks, X, CheckCircle2,
  Circle, Wand2, RefreshCw, FileSpreadsheet, FileType, Globe,
  Layers, AlertTriangle, Download, ArrowRight, Zap, Info,
} from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import type { ParsedRequirementItem } from "@/lib/requirements/parsers"
import type { GeneratedTestCaseFromReq } from "@/lib/requirements/rule-based-generator"

type WizardStep = "upload" | "extracted" | "configure" | "generated" | "saved"

interface DuplicateInfo {
  index: number
  title: string
  isDuplicate: boolean
  matchedTitle?: string
}

interface ParseResponse {
  importId: string
  fileName: string
  fileType: string
  language: string
  totalItems: number
  parsedItems: ParsedRequirementItem[]
  summary: {
    total: number
    withAcceptanceCriteria: number
    languages: { english: number; arabic: number; mixed: number }
    modules: string[]
  }
}

interface GenerateResponse {
  testCases: GeneratedTestCaseFromReq[]
  count: number
  duplicates: DuplicateInfo[]
  generationMode: string
  outputLanguage: string
}

export default function GenerateFromFilePage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [step, setStep] = useState<WizardStep>("upload")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Parse state
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null)
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([])

  // Configure state
  const [mode, setMode] = useState<"conservative" | "balanced" | "detailed">("balanced")
  const [outputLanguage, setOutputLanguage] = useState<"source" | "en" | "ar">("source")

  // Generate state
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null)
  const [testCases, setTestCases] = useState<(GeneratedTestCaseFromReq & { selected: boolean })[]>([])
  const [expandedTc, setExpandedTc] = useState<number | null>(null)

  // Save state
  const [savedCount, setSavedCount] = useState(0)
  const [savedReqCount, setSavedReqCount] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Step 1: Upload & Parse ──────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true)
    setErrorMsg("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/projects/${projectId}/requirements/parse-file`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to parse file")

      setParseResult(data)
      setSelectedItemIndices(data.parsedItems.map((_: any, i: number) => i))
      setStep("extracted")
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  // ─── Step 3: Generate ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!parseResult) return
    setIsLoading(true)
    setErrorMsg("")
    setStep("generated")

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/generate-test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: parseResult.importId,
          parsedItems: parseResult.parsedItems,
          mode,
          outputLanguage,
          selectedIndices: selectedItemIndices,
        }),
      })
      const data: GenerateResponse = await res.json()
      if (!res.ok) throw new Error((data as any).error || "Generation failed")

      setGenerateResult(data)
      setTestCases(data.testCases.map(tc => ({ ...tc, selected: true })))
    } catch (err: any) {
      setErrorMsg(err.message)
      setStep("configure")
    } finally {
      setIsLoading(false)
    }
  }, [parseResult, projectId, mode, outputLanguage, selectedItemIndices])

  // ─── Step 4: Save ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const selected = testCases.filter(tc => tc.selected)
    if (selected.length === 0) {
      setErrorMsg("Select at least one test case to save.")
      return
    }
    setIsLoading(true)
    setErrorMsg("")

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/save-generated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCases: selected,
          importId: parseResult?.importId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")

      setSavedCount(data.count || 0)
      setSavedReqCount(data.requirementsCount || 0)
      setStep("saved")
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [testCases, parseResult, projectId])

  function toggleTc(i: number) {
    setTestCases(prev => prev.map((tc, idx) => idx === i ? { ...tc, selected: !tc.selected } : tc))
  }
  function selectAll() { setTestCases(prev => prev.map(tc => ({ ...tc, selected: true }))) }
  function deselectAll() { setTestCases(prev => prev.map(tc => ({ ...tc, selected: false }))) }
  const selectedCount = testCases.filter(tc => tc.selected).length

  function reset() {
    setStep("upload"); setParseResult(null); setGenerateResult(null)
    setTestCases([]); setErrorMsg(""); setSelectedItemIndices([])
    setSavedCount(0); setSavedReqCount(0)
  }

  const STEPS: { key: WizardStep; label: string; labelAr: string }[] = [
    { key: "upload", label: "Upload File", labelAr: "رفع الملف" },
    { key: "extracted", label: "Review Extracted", labelAr: "مراجعة المستخلص" },
    { key: "configure", label: "Configure", labelAr: "الإعدادات" },
    { key: "generated", label: "Review & Edit", labelAr: "مراجعة وتعديل" },
    { key: "saved", label: "Saved", labelAr: "تم الحفظ" },
  ]
  const stepIndex = STEPS.findIndex(s => s.key === step)

  const priorityColors: Record<string, string> = {
    Critical: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    High: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  }

  const typeColors: Record<string, string> = {
    Positive: "bg-emerald-100 text-emerald-700",
    Negative: "bg-red-100 text-red-700",
    Boundary: "bg-purple-100 text-purple-700",
    Validation: "bg-amber-100 text-amber-700",
    ErrorHandling: "bg-orange-100 text-orange-700",
    Permission: "bg-primary/15 text-primary",
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-violet-500" />
            Test Case Generator from Requirements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload Excel, Word, CSV or text files containing user stories and requirements — generate structured test cases instantly.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">
              ✓ Free Rule-Based Generation
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold border border-blue-200">
              Arabic + English
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold border border-violet-200">
              No AI API Required
            </span>
          </div>
        </div>
        <Link href={`/projects/${projectId}/test-cases`}>
          <Button variant="outline" size="sm">← Test Cases</Button>
        </Link>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-1 bg-card border rounded-xl p-3 overflow-x-auto">
        {STEPS.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              idx === stepIndex ? "bg-violet-600 text-white shadow-sm" :
              idx < stepIndex ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
              "bg-accent text-muted-foreground"
            }`}>
              {idx < stepIndex ? <Check className="h-3.5 w-3.5" /> :
               idx === stepIndex ? <Zap className="h-3.5 w-3.5" /> :
               <span className="text-xs font-semibold">{idx + 1}</span>}
              {s.label}
            </div>
            {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg("")}><X className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
        </div>
      )}

      {/* ─── STEP 1: UPLOAD ───────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-6">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-muted-foreground/25 hover:border-violet-400 rounded-xl p-16 text-center bg-card/40 hover:bg-violet-50/10 dark:hover:bg-violet-950/10 cursor-pointer transition-all group space-y-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.docx,.txt,.md"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
            <div className="mx-auto w-16 h-16 rounded-xl bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              {isLoading ? <BusyDot /> : <Upload className="h-8 w-8 text-violet-500" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {isLoading ? "Parsing your file..." : "Drag & Drop your requirements file"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {isLoading ? "Extracting user stories, requirements, and acceptance criteria..." : "Supports Excel, CSV, Word DOCX, plain text, and Markdown"}
              </p>
            </div>
            {!isLoading && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  { icon: <FileSpreadsheet className="h-4 w-4" />, label: ".xlsx / .xls", color: "text-green-600 bg-green-50 border-green-200" },
                  { icon: <FileText className="h-4 w-4" />, label: ".csv", color: "text-blue-600 bg-blue-50 border-blue-200" },
                  { icon: <FileType className="h-4 w-4" />, label: ".docx", color: "text-blue-700 bg-blue-50 border-blue-200" },
                  { icon: <FileText className="h-4 w-4" />, label: ".txt / .md", color: "text-muted-foreground bg-muted/50 border-border" },
                ].map(f => (
                  <span key={f.label} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-lg border ${f.color}`}>
                    {f.icon} {f.label}
                  </span>
                ))}
              </div>
            )}
            {!isLoading && (
              <Button className="mt-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                Browse File
              </Button>
            )}
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Globe className="h-5 w-5 text-blue-500" />,
                title: "Arabic & English",
                desc: "Automatically detects language and generates test cases in Arabic or English based on your requirements.",
              },
              {
                icon: <Zap className="h-5 w-5 text-amber-500" />,
                title: "Free Rule-Based",
                desc: "No AI API keys required. Generates professional test cases using intelligent rule-based patterns.",
              },
              {
                icon: <Layers className="h-5 w-5 text-violet-500" />,
                title: "Full Coverage",
                desc: "Generates positive, negative, validation, boundary, and error handling test cases automatically.",
              },
            ].map(card => (
              <div key={card.title} className="border rounded-xl p-4 bg-card space-y-2">
                <div className="flex items-center gap-2">
                  {card.icon}
                  <span className="font-semibold text-sm">{card.title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── STEP 2: EXTRACTED REQUIREMENTS ───────────────────────────────────── */}
      {step === "extracted" && parseResult && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "File", value: parseResult.fileName, sub: parseResult.fileType.toUpperCase(), color: "text-foreground" },
              { label: "Requirements Found", value: parseResult.summary.total, sub: "items extracted", color: "text-violet-600" },
              { label: "With Acceptance Criteria", value: parseResult.summary.withAcceptanceCriteria, sub: "items have criteria", color: "text-blue-600" },
              { label: "Language", value: parseResult.language, sub: `EN:${parseResult.summary.languages.english} AR:${parseResult.summary.languages.arabic}`, color: "text-emerald-600" },
            ].map(card => (
              <div key={card.label} className="border rounded-xl p-4 bg-card text-center">
                <div className="text-xs font-medium text-muted-foreground mb-1">{card.label}</div>
                <div className={`text-xl font-semibold truncate ${card.color}`}>{card.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between bg-accent/20 rounded-xl px-4 py-3 border">
            <span className="text-sm font-semibold">
              Select requirements to generate test cases from
              <span className="text-muted-foreground font-normal ml-1">({selectedItemIndices.length} of {parseResult.parsedItems.length} selected)</span>
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedItemIndices(parseResult.parsedItems.map((_, i) => i))}>
                Select All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedItemIndices([])}>
                Deselect All
              </Button>
            </div>
          </div>

          {/* Requirements List */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {parseResult.parsedItems.map((item, idx) => {
              const isSelected = selectedItemIndices.includes(idx)
              const isAr = item.language === "Arabic"
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedItemIndices(prev => isSelected ? prev.filter(i => i !== idx) : [...prev, idx])}
                  className={`border rounded-xl p-4 cursor-pointer transition-all space-y-2 ${
                    isSelected ? "border-violet-300 bg-violet-50/30 dark:border-violet-700 dark:bg-violet-950/10" :
                    "border-border bg-card/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                      isSelected ? "border-violet-600 bg-violet-600" : "border-muted-foreground/30 bg-background"
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {item.requirementKey && (
                          <span className="text-xs font-semibold bg-violet-100 text-violet-700 dark:bg-violet-950/30 px-2 py-0.5 rounded">
                            {item.requirementKey}
                          </span>
                        )}
                        <span className="font-semibold text-sm" dir={isAr ? "rtl" : "ltr"}>{item.title}</span>
                        {item.language && (
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold border ${
                            item.language === "Arabic" ? "bg-green-50 text-green-700 border-green-200" :
                            item.language === "Mixed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-muted/50 text-muted-foreground border-border"
                          }`}>{item.language}</span>
                        )}
                        {item.priority && (
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${priorityColors[item.priority] || priorityColors.Medium}`}>
                            {item.priority}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2" dir={isAr ? "rtl" : "ltr"}>{item.description}</p>
                      )}
                      {item.acceptanceCriteria && item.acceptanceCriteria.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.acceptanceCriteria.slice(0, 2).map((ac, ai) => (
                            <span key={ai} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900 max-w-xs truncate" dir={isAr ? "rtl" : "ltr"}>
                              ✓ {ac}
                            </span>
                          ))}
                          {item.acceptanceCriteria.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{item.acceptanceCriteria.length - 2} more</span>
                          )}
                        </div>
                      )}
                      {(item.module || item.feature) && (
                        <div className="text-xs text-muted-foreground mt-2">
                          📁 {item.module}{item.feature && ` → ${item.feature}`}{item.component && ` → ${item.component}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ChevronLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button
              onClick={() => setStep("configure")}
              disabled={selectedItemIndices.length === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Configure Generation <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: CONFIGURE ────────────────────────────────────────────────── */}
      {step === "configure" && (
        <div className="space-y-6">
          <div className="border rounded-xl bg-card p-6 space-y-6">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-violet-500" /> Generation Settings
            </h3>

            {/* Generation Mode */}
            <div className="space-y-3">
              <label className="text-sm font-semibold">Generation Mode</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  { key: "conservative", label: "Conservative", icon: "🎯", desc: "Positive + 1 negative test case per requirement. Best for quick coverage." },
                  { key: "balanced", label: "Balanced", icon: "⚖️", desc: "Positive, negative, and validation tests. Recommended for most projects." },
                  { key: "detailed", label: "Detailed", icon: "🔬", desc: "Full coverage: positive, negative, validation, boundary, and error handling." },
                ] as const).map(m => (
                  <div
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all space-y-2 ${
                      mode === m.key ? "border-violet-400 bg-violet-50/30 dark:border-violet-700 dark:bg-violet-950/10 shadow-sm" : "border-border bg-card/40 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{m.icon} {m.label}</span>
                      {mode === m.key && <Check className="h-4 w-4 text-violet-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                    <div className="text-xs font-semibold text-muted-foreground">
                      ~{m.key === "conservative" ? "2" : m.key === "balanced" ? "3" : "5"} tests per requirement
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Output Language */}
            <div className="space-y-3">
              <label className="text-sm font-semibold">Output Language</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: "source", label: "Same as Source", icon: "🔄", desc: "Detect per requirement — Arabic stays Arabic, English stays English." },
                  { key: "en", label: "English", icon: "🇬🇧", desc: "Generate all test cases in English." },
                  { key: "ar", label: "Arabic", icon: "🇸🇦", desc: "Generate all test cases in Arabic." },
                ] as const).map(l => (
                  <div
                    key={l.key}
                    onClick={() => setOutputLanguage(l.key)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${
                      outputLanguage === l.key ? "border-violet-400 bg-violet-50/30 dark:border-violet-700 dark:bg-violet-950/10" : "border-border bg-card/40 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{l.icon} {l.label}</span>
                      {outputLanguage === l.key && <Check className="h-4 w-4 text-violet-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{l.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Preview */}
            <div className="bg-accent/20 rounded-xl p-4 border text-sm space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" /> Generation Preview
              </div>
              <div className="text-muted-foreground text-xs space-y-1">
                <div>📋 <strong>{selectedItemIndices.length}</strong> requirement{selectedItemIndices.length !== 1 ? "s" : ""} selected</div>
                <div>🧪 Estimated <strong>{selectedItemIndices.length * (mode === "conservative" ? 2 : mode === "balanced" ? 3 : 5)}</strong> test cases will be generated</div>
                <div>🌐 Output language: <strong>{outputLanguage === "source" ? "Auto-detect per requirement" : outputLanguage === "en" ? "English" : "Arabic"}</strong></div>
                <div>⚡ <strong>Free rule-based generation</strong> — no API keys needed</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep("extracted")}>
              <ChevronLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Button onClick={handleGenerate} disabled={isLoading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {isLoading ? <BusyDot /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generate Test Cases
            </Button>
          </div>
        </div>
      )}

      {/* ─── LOADING (during generation) ─────────────────────────────────────── */}
      {step === "generated" && isLoading && (
        <div className="flex flex-col items-center justify-center py-24 space-y-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">Generating Test Cases...</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Analyzing {selectedItemIndices.length} requirement{selectedItemIndices.length !== 1 ? "s" : ""} and generating structured test cases with steps and expected results.
            </p>
          </div>
        </div>
      )}

      {/* ─── STEP 4: REVIEW GENERATED ────────────────────────────────────────── */}
      {step === "generated" && !isLoading && testCases.length > 0 && (
        <div className="space-y-6">
          {/* Stats bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card border rounded-xl">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-semibold text-violet-600">{testCases.length}</div>
              <div>
                <div className="font-semibold text-sm">Test Cases Generated</div>
                <div className="text-xs text-muted-foreground">{selectedCount} selected to save</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {generateResult && generateResult.duplicates.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {generateResult.duplicates.length} possible duplicate{generateResult.duplicates.length !== 1 ? "s" : ""}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={selectAll}>
                <Check className="h-3.5 w-3.5 mr-1" /> Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                <X className="h-3.5 w-3.5 mr-1" /> Deselect All
              </Button>
            </div>
          </div>

          {/* Test Cases List */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {testCases.map((tc, idx) => {
              const isDup = generateResult?.duplicates.find(d => d.index === idx)?.isDuplicate
              const isAr = tc.language === "ar"
              const isExpanded = expandedTc === idx
              return (
                <div
                  key={idx}
                  className={`border rounded-xl transition-all ${
                    tc.selected ? "border-violet-200 dark:border-violet-800 bg-card" : "border-border bg-card/30 opacity-55"
                  }`}
                >
                  {/* TC Header */}
                  <div className="p-4 flex items-start gap-3">
                    <button onClick={() => toggleTc(idx)} className="mt-0.5 shrink-0">
                      {tc.selected
                        ? <CheckCircle2 className="h-5 w-5 text-violet-600" />
                        : <Circle className="h-5 w-5 text-muted-foreground/30" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm" dir={isAr ? "rtl" : "ltr"}>{tc.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${priorityColors[tc.priority] || priorityColors.Medium}`}>
                          {tc.priority}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${typeColors[tc.testType] || "bg-muted text-muted-foreground"}`}>
                          {tc.testType}
                        </span>
                        {isAr && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-semibold border border-green-200">AR</span>}
                        {isDup && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-semibold border border-amber-200 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> Possible Duplicate</span>}
                        {tc.requirementKey && <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded font-semibold border border-violet-200">{tc.requirementKey}</span>}
                      </div>
                      {tc.module && (
                        <div className="text-xs text-muted-foreground">
                          📁 {tc.module}{tc.feature && ` → ${tc.feature}`}{tc.component && ` → ${tc.component}`}
                        </div>
                      )}
                      {tc.preconditions && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1" dir={isAr ? "rtl" : "ltr"}>
                          <strong>Preconditions:</strong> {tc.preconditions}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedTc(isExpanded ? null : idx)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border shrink-0"
                    >
                      {isExpanded ? "Hide" : `${tc.steps.length} steps`}
                    </button>
                  </div>

                  {/* Expanded Steps */}
                  {isExpanded && (
                    <div className="border-t mx-4 mb-4">
                      <table className="w-full text-xs mt-3">
                        <thead>
                          <tr className="bg-accent/30 rounded-lg">
                            <th className="text-left px-3 py-2 text-muted-foreground font-semibold w-8">#</th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-semibold" dir={isAr ? "rtl" : "ltr"}>
                              {isAr ? "الإجراء" : "Action"}
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-semibold" dir={isAr ? "rtl" : "ltr"}>
                              {isAr ? "النتيجة المتوقعة" : "Expected Result"}
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-semibold" dir={isAr ? "rtl" : "ltr"}>
                              {isAr ? "النتيجة الفعلية" : "Actual Result"}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {tc.steps.map((s, si) => (
                            <tr key={si} className="hover:bg-accent/10">
                              <td className="px-3 py-3 text-muted-foreground font-mono font-semibold">{s.stepNumber}</td>
                              <td className="px-3 py-3 text-foreground" dir={isAr ? "rtl" : "ltr"}>{s.actionDescription}</td>
                              <td className="px-3 py-3 text-muted-foreground" dir={isAr ? "rtl" : "ltr"}>{s.expectedResult}</td>
                              <td className="px-3 py-3 text-muted-foreground/50 text-xs">
                                {isAr ? "— فارغ —" : "— empty —"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep("configure")}>
              <ChevronLeft className="h-4 w-4 mr-2" /> Back to Configure
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isLoading ? <BusyDot /> : <Save className="h-4 w-4 mr-2" />}
              Save {selectedCount} Test Case{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 5: SAVED ────────────────────────────────────────────────────── */}
      {step === "saved" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-semibold">Test Cases Saved!</h3>
            <p className="text-sm text-muted-foreground">
              <strong>{savedCount}</strong> test case{savedCount !== 1 ? "s" : ""} have been saved to your Test Cases Hub.
            </p>
            {savedReqCount > 0 && (
              <p className="text-sm text-muted-foreground">
                <strong>{savedReqCount}</strong> requirement{savedReqCount !== 1 ? "s" : ""} created and linked for traceability.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href={`/projects/${projectId}/test-cases`}>
              <Button className="bg-violet-600 hover:bg-violet-700 text-white">
                <ListChecks className="h-4 w-4 mr-2" /> View Test Cases
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/requirements`}>
              <Button variant="outline">
                <Layers className="h-4 w-4 mr-2" /> View Requirements
              </Button>
            </Link>
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Generate from Another File
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
