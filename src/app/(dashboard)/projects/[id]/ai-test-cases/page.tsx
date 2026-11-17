"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Upload,
  FileText,
  Sparkles,
  Save,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  BrainCircuit,
  Settings,
  Eye,
  ListChecks,
  Tag,
  X,
  CheckCircle2,
  Circle,
  Wand2,
  Database,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface ExtractedDocument {
  importId: string
  fileName: string
  fileType: string
  pageCount?: number
  wordCount: number
  sectionCount: number
  requirementCount: number
  requirements: RequirementItem[]
  summary: { total: number; byType: Record<string, number> }
  text: string
}

interface RequirementItem {
  id: string
  title: string
  description: string
  type: string
  priority: string
  lineNumber: number
}

interface GeneratedTestCase {
  title: string
  description: string
  priority: "Low" | "Medium" | "High" | "Critical"
  preconditions?: string
  steps: GeneratedStep[]
  tags: string[]
  selected?: boolean
}

interface GeneratedStep {
  stepNumber: number
  actionDescription: string
  expectedResult: string
  actionType?: string
  targetType?: string
  targetValue?: string
  inputValue?: string
}

interface AIStatus {
  ollama: { available: boolean; models: string[]; url: string }
  huggingface: { available: boolean; hasToken: boolean }
  recommended: string | null
}

type Step = "upload" | "preview" | "configure" | "generate" | "review" | "saved"

export default function AITestCasesPage() {
  const params = useParams()
  const projectId = params.id as string

  const [currentStep, setCurrentStep] = useState<Step>("upload")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDocument | null>(null)

  // AI configuration
  const [provider, setProvider] = useState<"ollama" | "huggingface">("ollama")
  const [model, setModel] = useState("")
  const [language, setLanguage] = useState<"en" | "ar">("en")
  const [testCaseCount, setTestCaseCount] = useState(10)
  const [includeNegative, setIncludeNegative] = useState(true)
  const [includeEdge, setIncludeEdge] = useState(true)
  const [includeExploratory, setIncludeExploratory] = useState(false)

  // Generated test cases
  const [generatedTestCases, setGeneratedTestCases] = useState<GeneratedTestCase[]>([])
  const [selectedCount, setSelectedCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)

  // Check AI status on load
  useEffect(() => {
    checkAIStatus()
  }, [])

  const checkAIStatus = async () => {
    try {
      const res = await fetch("/api/ai/status")
      const data = await res.json()
      setAiStatus(data)
      if (data.recommended) {
        setProvider(data.recommended as "ollama" | "huggingface")
      }
      if (data.ollama?.models?.length > 0) {
        setModel(data.ollama.models[0])
      }
    } catch (err) {
      console.error("Failed to check AI status:", err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadedFile(file)
    setIsLoading(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/projects/${projectId}/brd-extract`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to extract document")
      }

      setExtractedDoc(data)
      setCurrentStep("preview")
    } catch (err: any) {
      setError(err.message || "Failed to upload and extract document")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!extractedDoc) return

    setIsLoading(true)
    setError("")
    setCurrentStep("generate")

    try {
      const textToUse = extractedDoc.text

      const res = await fetch(`/api/projects/${projectId}/ai-generate-testcases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToUse,
          importId: extractedDoc.importId,
          provider,
          model: model || undefined,
          language,
          testCaseCount,
          includeNegativeCases: includeNegative,
          includeEdgeCases: includeEdge,
          includeExploratory: includeExploratory,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate test cases")
      }

      const testCases = (data.testCases || []).map((tc: any) => ({ ...tc, selected: true }))
      setGeneratedTestCases(testCases)
      setSelectedCount(testCases.length)
      setCurrentStep("review")
    } catch (err: any) {
      setError(err.message || "Failed to generate test cases")
      setCurrentStep("configure")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    const selected = generatedTestCases.filter((tc) => tc.selected)
    if (selected.length === 0) {
      setError("Please select at least one test case to save")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-testcases/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCases: selected,
          importId: extractedDoc?.importId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save test cases")
      }

      setSavedCount(data.count || 0)
      setCurrentStep("saved")
    } catch (err: any) {
      setError(err.message || "Failed to save test cases")
    } finally {
      setIsLoading(false)
    }
  }

  const toggleTestCase = (index: number) => {
    setGeneratedTestCases((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], selected: !updated[index].selected }
      const count = updated.filter((tc) => tc.selected).length
      setSelectedCount(count)
      return updated
    })
  }

  const selectAll = () => {
    setGeneratedTestCases((prev) => prev.map((tc) => ({ ...tc, selected: true })))
    setSelectedCount(generatedTestCases.length)
  }

  const deselectAll = () => {
    setGeneratedTestCases((prev) => prev.map((tc) => ({ ...tc, selected: false })))
    setSelectedCount(0)
  }

  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: "upload", label: "Upload", icon: <Upload className="h-4 w-4" /> },
    { key: "preview", label: "Preview", icon: <Eye className="h-4 w-4" /> },
    { key: "configure", label: "Configure", icon: <Settings className="h-4 w-4" /> },
    { key: "generate", label: "Generate", icon: <Wand2 className="h-4 w-4" /> },
    { key: "review", label: "Review", icon: <ListChecks className="h-4 w-4" /> },
    { key: "saved", label: "Saved", icon: <CheckCircle2 className="h-4 w-4" /> },
  ]

  const getStepIndex = (step: Step) => steps.findIndex((s) => s.key === step)
  const currentStepIndex = getStepIndex(currentStep)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Test Case Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a BRD/PRD document and let AI generate structured test cases automatically
          </p>
        </div>
        <Link href={`/projects/${projectId}`}>
          <Button variant="outline" size="sm">
            Back to Project
          </Button>
        </Link>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border rounded-xl p-3">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                idx === currentStepIndex
                  ? "bg-primary text-white"
                  : idx < currentStepIndex
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {step.icon}
              {step.label}
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-slate-300 dark:text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {currentStep === "upload" && (
        <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 text-center space-y-6 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="mx-auto w-16 h-16 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground dark:text-slate-100">Upload Requirements Document</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Upload a Business Requirements Document (BRD), Product Requirements Document (PRD), or any text file containing your requirements.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileUpload}
                disabled={isLoading}
                className="hidden"
              />
              <Button disabled={isLoading} className="bg-primary hover:bg-primary/90">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Choose File
                  </>
                )}
              </Button>
            </label>
            <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, TXT, MD</p>
          </div>

          {/* AI Status */}
          {aiStatus && (
            <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border text-left max-w-md mx-auto">
              <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                <BrainCircuit className="h-3.5 w-3.5" /> AI Providers
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground dark:text-slate-300">Ollama (Local)</span>
                  <span className={`font-semibold ${aiStatus.ollama.available ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {aiStatus.ollama.available ? "Available" : "Not Available"}
                  </span>
                </div>
                {aiStatus.ollama.available && aiStatus.ollama.models.length > 0 && (
                  <div className="text-muted-foreground pl-4">Models: {aiStatus.ollama.models.slice(0, 3).join(", ")}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground dark:text-slate-300">Hugging Face</span>
                  <span className={`font-semibold ${aiStatus.huggingface.available ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {aiStatus.huggingface.available ? "Available" : "Not Available"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t dark:border-slate-700">
                  <span className="text-muted-foreground dark:text-slate-300 font-semibold">Recommended</span>
                  <span className="font-semibold text-primary">
                    {aiStatus.recommended || "None — install Ollama or set HF token"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {currentStep === "preview" && extractedDoc && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 border rounded-xl p-4 text-center">
              <div className="text-2xl font-semibold text-primary">{extractedDoc.wordCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground font-medium">Words</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border rounded-xl p-4 text-center">
              <div className="text-2xl font-semibold text-primary">{extractedDoc.requirementCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Requirements Found</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border rounded-xl p-4 text-center">
              <div className="text-2xl font-semibold text-primary">{extractedDoc.pageCount || "N/A"}</div>
              <div className="text-xs text-muted-foreground font-medium">Pages</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border rounded-xl p-4 text-center">
              <div className="text-2xl font-semibold text-primary">{extractedDoc.sectionCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Sections</div>
            </div>
          </div>

          {/* Extracted Requirements */}
          {extractedDoc.requirements.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border rounded-xl p-5">
              <h3 className="font-semibold text-foreground dark:text-slate-100 mb-4 flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                Extracted Requirements ({extractedDoc.requirements.length})
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {extractedDoc.requirements.map((req, idx) => (
                  <div key={idx} className="border border-border dark:border-slate-700 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded">{req.id}</span>
                      <span className="font-semibold text-foreground dark:text-slate-200">{req.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ml-auto ${
                        req.priority === "Critical" ? "bg-red-50 text-red-600" :
                        req.priority === "High" ? "bg-orange-50 text-orange-600" :
                        req.priority === "Low" ? "bg-muted/50 text-muted-foreground" :
                        "bg-blue-50 text-blue-600"
                      }`}>{req.priority}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{req.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text Preview */}
          <div className="bg-white dark:bg-slate-800 border rounded-xl p-5">
            <h3 className="font-semibold text-foreground dark:text-slate-100 mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Document Preview
            </h3>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-xs text-slate-600 dark:text-slate-300 max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
              {extractedDoc.text}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCurrentStep("upload")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setCurrentStep("configure")} className="bg-primary hover:bg-primary/90">
              Next: Configure AI <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Configure AI */}
      {currentStep === "configure" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 border rounded-xl p-6 space-y-6">
            <h3 className="font-semibold text-foreground dark:text-slate-100 flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              AI Generation Settings
            </h3>

            <div className="grid grid-cols-2 gap-6">
              {/* Provider */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground dark:text-slate-300">AI Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as "ollama" | "huggingface")}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="ollama">Ollama (Local — Free)</option>
                  <option value="huggingface">Hugging Face (Cloud — Free)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {provider === "ollama" ? "Runs on your machine. Install Ollama and pull a model (e.g., llama3.2)." : "Cloud API. No local setup needed but rate-limited."}
                </p>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground dark:text-slate-300">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={provider === "ollama" ? "llama3.2" : "mistralai/Mistral-7B-Instruct-v0.2"}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-xs text-muted-foreground">Leave empty to use default model</p>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground dark:text-slate-300">Document Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "ar")}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>

              {/* Test Case Count */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground dark:text-slate-300">Test Case Count</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={testCaseCount}
                  onChange={(e) => setTestCaseCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNegative}
                  onChange={(e) => setIncludeNegative(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground dark:text-slate-300">Include Negative Tests</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEdge}
                  onChange={(e) => setIncludeEdge(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground dark:text-slate-300">Include Edge Cases</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExploratory}
                  onChange={(e) => setIncludeExploratory(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground dark:text-slate-300">Include Exploratory Tests</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCurrentStep("preview")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Test Cases
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Generating (loading) */}
      {currentStep === "generate" && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="relative">
            <BrainCircuit className="h-16 w-16 text-primary animate-pulse" />
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold text-foreground dark:text-slate-100">Generating Test Cases...</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The AI is analyzing your requirements and generating comprehensive test cases with steps, expected results, and locators. This may take 30-120 seconds.
          </p>
          <div className="w-64 h-2 bg-muted dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[shimmer_2s_infinite]" style={{ width: "60%" }} />
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {currentStep === "review" && generatedTestCases.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 border rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-semibold text-primary">{generatedTestCases.length}</div>
              <div>
                <div className="text-sm font-semibold text-foreground dark:text-slate-100">Test Cases Generated</div>
                <div className="text-xs text-muted-foreground">{selectedCount} selected to save</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                <Check className="h-3.5 w-3.5 mr-1" /> Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                <X className="h-3.5 w-3.5 mr-1" /> Deselect All
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {generatedTestCases.map((tc, idx) => (
              <div
                key={idx}
                className={`border rounded-xl p-5 transition-all ${
                  tc.selected
                    ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/10"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleTestCase(idx)}
                    className="mt-0.5 shrink-0"
                  >
                    {tc.selected ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-foreground dark:text-slate-100 text-sm">{tc.title}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        tc.priority === "Critical" ? "bg-red-50 text-red-600" :
                        tc.priority === "High" ? "bg-orange-50 text-orange-600" :
                        tc.priority === "Low" ? "bg-muted/50 text-muted-foreground" :
                        "bg-blue-50 text-blue-600"
                      }`}>{tc.priority}</span>
                      {tc.tags?.map((tag, tIdx) => (
                        <span key={tIdx} className="text-[10px] px-2 py-0.5 rounded bg-muted dark:bg-slate-700 text-muted-foreground dark:text-muted-foreground flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" /> {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{tc.description}</p>
                    {tc.preconditions && (
                      <p className="text-xs text-muted-foreground mb-3">
                        <span className="font-semibold">Preconditions:</span> {tc.preconditions}
                      </p>
                    )}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-700">
                            <th className="text-left px-3 py-2 w-12 font-semibold text-muted-foreground">#</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Action</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Expected Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tc.steps.map((step, sIdx) => (
                            <tr key={sIdx} className="border-b dark:border-slate-700 last:border-0">
                              <td className="px-3 py-2 text-muted-foreground font-mono">{step.stepNumber}</td>
                              <td className="px-3 py-2 text-foreground dark:text-slate-300">{step.actionDescription}</td>
                              <td className="px-3 py-2 text-muted-foreground dark:text-muted-foreground">{step.expectedResult}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCurrentStep("configure")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || selectedCount === 0}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save {selectedCount} Test Case{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Saved */}
      {currentStep === "saved" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold text-foreground dark:text-slate-100">Test Cases Saved!</h3>
            <p className="text-sm text-muted-foreground">
              {savedCount} test case{savedCount !== 1 ? "s" : ""} with requirements and steps have been saved to your project.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href={`/projects/${projectId}/test-cases`}>
              <Button className="bg-primary hover:bg-primary/90">
                <ListChecks className="h-4 w-4 mr-2" />
                View Test Cases
              </Button>
            </Link>
            <Button variant="outline" onClick={() => {
              setCurrentStep("upload")
              setUploadedFile(null)
              setExtractedDoc(null)
              setGeneratedTestCases([])
              setSelectedCount(0)
              setSavedCount(0)
              setError("")
            }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate More
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
