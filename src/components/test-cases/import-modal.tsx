"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, ChevronRight, Check, AlertCircle, FileSpreadsheet, Settings2, Eye, Loader2, ArrowLeft, Download } from "lucide-react"
import * as XLSX from "xlsx"

interface ImportModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onImportSuccess: () => void
}

interface ColumnMapping {
  title: string
  module: string
  featureName: string
  componentName: string
  priority: string
  preconditions: string
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: string
  requirementKeys: string
}

const SCHEMA_FIELDS = [
  { key: "title", label: "Test Case Title *", required: true, desc: "Identifies the test case. Consecutive rows with the same or empty title are grouped as steps." },
  { key: "module", label: "Module Name", required: false, desc: "Top-level module name (e.g. Authentication)." },
  { key: "featureName", label: "Feature Name", required: false, desc: "Mid-level feature name (e.g. User Login)." },
  { key: "componentName", label: "Component Name", required: false, desc: "Leaf-level component name (e.g. Login Form)." },
  { key: "priority", label: "Priority", required: false, desc: "Priority of the test case: Low, Medium, High, Critical." },
  { key: "preconditions", label: "Preconditions", required: false, desc: "Steps to complete before executing the test." },
  { key: "requirementKeys", label: "Requirement Keys", required: false, desc: "Comma-separated list of requirement keys (e.g., REQ-001, REQ-002) to link." },
  { key: "actionDescription", label: "Step Action Description *", required: true, desc: "The action to perform in this step." },
  { key: "expectedResult", label: "Step Expected Result *", required: true, desc: "What should happen after this step." },
  { key: "actionType", label: "Step Action Type", required: false, desc: "E.g., click, fill, open_url, assert_visible." },
  { key: "targetType", label: "Step Target Type", required: false, desc: "E.g., css, xpath, test_id, text." },
  { key: "targetValue", label: "Step Target Value", required: false, desc: "Selector path, ID, or value." },
  { key: "inputValue", label: "Step Input Value", required: false, desc: "Text to enter, select, or URL to navigate." },
  { key: "timeoutMs", label: "Step Timeout (ms)", required: false, desc: "Wait limit before failing (default: 10000)." }
]

export function ImportModal({ projectId, isOpen, onClose, onImportSuccess }: ImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({
    title: "",
    module: "",
    featureName: "",
    componentName: "",
    priority: "",
    preconditions: "",
    actionDescription: "",
    expectedResult: "",
    actionType: "",
    targetType: "",
    targetValue: "",
    inputValue: "",
    timeoutMs: "",
    requirementKeys: ""
  })
  
  const [parsedTestCases, setParsedTestCases] = useState<any[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  // Step 1: Handle File Selection & Parse Headers
  function handleFileSelect(selectedFile: File) {
    if (!selectedFile) return
    setErrorMsg(null)
    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        // defval:"" ensures empty cells don't become undefined in rows
        const rawJson = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" })

        if (rawJson.length === 0) {
          setErrorMsg("The selected spreadsheet is empty.")
          return
        }

        const sheetHeaders = (rawJson[0] as string[]).map((h) => String(h).trim())
        setHeaders(sheetHeaders)
        
        // Remove header row
        const dataRows = rawJson.slice(1) as any[][]
        setRows(dataRows)

        // Premium UX: Guess column mapping based on keywords (English & Arabic support)
        // Process in order of specificity — more specific patterns first to avoid overwriting
        const autoMapping = { ...mapping }
        sheetHeaders.forEach((header, index) => {
          const colIndex = String(index)
          const lowerHeader = header.toLowerCase().trim()

          // ── Title ──────────────────────────────────────────────────────────
          if (
            lowerHeader === "test case title" ||
            lowerHeader === "title" ||
            lowerHeader === "test case name" ||
            lowerHeader === "tc" ||
            lowerHeader.includes("عنوان حالة") ||
            lowerHeader.includes("عنوان الاختبار") ||
            lowerHeader.includes("عنوان") ||
            lowerHeader.includes("اسم حالة") ||
            lowerHeader.includes("سيناريو")
          ) {
            autoMapping.title = colIndex

          // ── Module ─────────────────────────────────────────────────────────
          } else if (
            lowerHeader === "module name" ||
            lowerHeader === "module" ||
            lowerHeader.includes("module name") ||
            lowerHeader.includes("قسم") ||
            lowerHeader.includes("الوحدة") ||
            lowerHeader.includes("موديل")
          ) {
            autoMapping.module = colIndex

          // ── Feature ────────────────────────────────────────────────────────
          } else if (
            lowerHeader === "feature name" ||
            lowerHeader === "feature" ||
            lowerHeader.includes("feature name") ||
            lowerHeader.includes("الميزة") ||
            lowerHeader.includes("فيتشر") ||
            lowerHeader.includes("خاصية")
          ) {
            autoMapping.featureName = colIndex

          // ── Component ──────────────────────────────────────────────────────
          } else if (
            lowerHeader === "component name" ||
            lowerHeader === "component" ||
            lowerHeader.includes("component name") ||
            lowerHeader.includes("مكون") ||
            lowerHeader.includes("عنصر")
          ) {
            autoMapping.componentName = colIndex

          // ── Priority ───────────────────────────────────────────────────────
          } else if (
            lowerHeader === "priority" ||
            lowerHeader.includes("priority") ||
            lowerHeader.includes("severity") ||
            lowerHeader.includes("أولوية") ||
            lowerHeader.includes("اولوية")
          ) {
            autoMapping.priority = colIndex

          // ── Preconditions ──────────────────────────────────────────────────
          } else if (
            lowerHeader.includes("precondition") ||
            lowerHeader.includes("prereq") ||
            lowerHeader.includes("شروط مسبقة") ||
            lowerHeader.includes("شرط مسبق") ||
            lowerHeader.includes("شروط مسبقه")
          ) {
            autoMapping.preconditions = colIndex

          // ── Requirement Keys ───────────────────────────────────────────────
          } else if (
            lowerHeader.includes("requirement key") ||
            lowerHeader.includes("req key") ||
            lowerHeader === "requirement keys" ||
            lowerHeader.includes("متطلب") ||
            lowerHeader.includes("متطلبات")
          ) {
            autoMapping.requirementKeys = colIndex

          // ── Step Action Type (MUST come before actionDescription) ──────────
          } else if (
            lowerHeader === "step action type" ||
            lowerHeader === "action type" ||
            lowerHeader.includes("action type") ||
            lowerHeader.includes("نوع الإجراء") ||
            lowerHeader.includes("نوع الخطوة")
          ) {
            autoMapping.actionType = colIndex

          // ── Step Action Description ────────────────────────────────────────
          } else if (
            lowerHeader === "step action description" ||
            lowerHeader === "action description" ||
            lowerHeader === "step description" ||
            lowerHeader === "action" ||
            lowerHeader === "step" ||
            lowerHeader.includes("action description") ||
            lowerHeader.includes("step action desc") ||
            lowerHeader.includes("خطوات") ||
            lowerHeader.includes("خطوه") ||
            lowerHeader.includes("الإجراء") ||
            lowerHeader.includes("إجراء") ||
            lowerHeader.includes("اجراء")
          ) {
            autoMapping.actionDescription = colIndex

          // ── Step Expected Result ───────────────────────────────────────────
          } else if (
            lowerHeader === "step expected result" ||
            lowerHeader === "expected result" ||
            lowerHeader === "expected" ||
            lowerHeader === "outcome" ||
            lowerHeader.includes("expected result") ||
            lowerHeader.includes("نتيجة متوقعة") ||
            lowerHeader.includes("النتيجة المتوقعة") ||
            lowerHeader.includes("نتيجه متوقعه") ||
            lowerHeader.includes("نتيجة") ||
            lowerHeader.includes("النتائج")
          ) {
            autoMapping.expectedResult = colIndex

          // ── Target Type ────────────────────────────────────────────────────
          } else if (
            lowerHeader.includes("target type") ||
            lowerHeader.includes("selector type")
          ) {
            autoMapping.targetType = colIndex

          // ── Target Value ───────────────────────────────────────────────────
          } else if (
            lowerHeader.includes("target value") ||
            lowerHeader.includes("selector value") ||
            lowerHeader === "selector" ||
            lowerHeader === "value"
          ) {
            autoMapping.targetValue = colIndex

          // ── Input Value ────────────────────────────────────────────────────
          } else if (
            lowerHeader.includes("input value") ||
            lowerHeader.includes("input") ||
            lowerHeader.includes("text to type")
          ) {
            autoMapping.inputValue = colIndex

          // ── Timeout ────────────────────────────────────────────────────────
          } else if (
            lowerHeader.includes("timeout") ||
            lowerHeader.includes("wait")
          ) {
            autoMapping.timeoutMs = colIndex
          }
        })
        
        setMapping(autoMapping)
        setStep(2)
      } catch (err) {
        console.error("Error reading spreadsheet:", err)
        setErrorMsg("Failed to parse the file. Ensure it is a valid Excel file.")
      }
    }
    reader.readAsArrayBuffer(selectedFile)
  }

  // Drag and Drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  // Handle file drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Step 2: Handle Mapped Headers and Parse test cases + steps
  function handleGeneratePreview() {
    // Validate required fields
    if (!mapping.title) {
      alert("Mapping for 'Test Case Title' is required.")
      return
    }
    if (!mapping.actionDescription) {
      alert("Mapping for 'Step Action Description' is required.")
      return
    }
    if (!mapping.expectedResult) {
      alert("Mapping for 'Step Expected Result' is required.")
      return
    }

    const testCasesMap: any[] = []
    let currentTestCase: any = null

    rows.forEach((row, rowIndex) => {
      // Extract values using mapping indices
      const titleVal = mapping.title ? String(row[Number(mapping.title)] || "").trim() : ""
      const moduleVal = mapping.module ? String(row[Number(mapping.module)] || "").trim() : "General"
      const featureNameVal = mapping.featureName ? String(row[Number(mapping.featureName)] || "").trim() : ""
      const componentNameVal = mapping.componentName ? String(row[Number(mapping.componentName)] || "").trim() : ""
      const priorityVal = mapping.priority ? String(row[Number(mapping.priority)] || "").trim() : "Medium"
      const preconditionsVal = mapping.preconditions ? String(row[Number(mapping.preconditions)] || "").trim() : ""
      const reqKeysVal = mapping.requirementKeys ? String(row[Number(mapping.requirementKeys)] || "").trim() : ""
      
      const stepDesc = mapping.actionDescription ? String(row[Number(mapping.actionDescription)] || "").trim() : ""
      const expectedRes = mapping.expectedResult ? String(row[Number(mapping.expectedResult)] || "").trim() : ""
      const actionTypeVal = mapping.actionType ? String(row[Number(mapping.actionType)] || "").trim() : "custom_instruction"
      const targetTypeVal = mapping.targetType ? String(row[Number(mapping.targetType)] || "").trim() : "none"
      const targetValueVal = mapping.targetValue ? String(row[Number(mapping.targetValue)] || "").trim() : ""
      const inputValueVal = mapping.inputValue ? String(row[Number(mapping.inputValue)] || "").trim() : ""
      const timeoutMsVal = mapping.timeoutMs ? parseInt(row[Number(mapping.timeoutMs)]) || 10000 : 10000

      // Skip row if it has absolutely no details
      if (!titleVal && !stepDesc && !expectedRes) return

      // Translate Arabic priority
      let cleanPriority = "Medium"
      const normPriority = priorityVal.toLowerCase()
      if (normPriority.includes("عالية") || normPriority.includes("عاليه") || normPriority.includes("high")) {
        cleanPriority = "High"
      } else if (normPriority.includes("حرجة") || normPriority.includes("حرج") || normPriority.includes("عاجلة") || normPriority.includes("عاجله") || normPriority.includes("critical")) {
        cleanPriority = "Critical"
      } else if (normPriority.includes("متوسطة") || normPriority.includes("متوسطه") || normPriority.includes("medium")) {
        cleanPriority = "Medium"
      } else if (normPriority.includes("منخفضة") || normPriority.includes("منخفضه") || normPriority.includes("low")) {
        cleanPriority = "Low"
      }

      // If we see a new non-empty title, start a new test case
      if (titleVal && (!currentTestCase || currentTestCase.title !== titleVal)) {
        const requirementKeys = reqKeysVal ? reqKeysVal.split(",").map(k => k.trim()).filter(Boolean) : []
        currentTestCase = {
          title: titleVal,
          module: moduleVal || "General",
          featureName: featureNameVal || null,
          componentName: componentNameVal || null,
          priority: cleanPriority,
          preconditions: preconditionsVal || null,
          source: "Imported",
          executionType: "Manual",
          requirementKeys,
          steps: []
        }
        testCasesMap.push(currentTestCase)
      }

      // Parse multi-line steps and expected results
      if (currentTestCase) {
        // Splits a cell value into individual step lines.
        // Handles: \n, \r\n, and inline numbered lists "1. x\n2. y" or "1. x 2. y"
        function splitLines(raw: string): string[] {
          if (!raw || !raw.trim()) return []

          // Normalize all newline variants
          const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

          // Split on real newlines first
          let parts = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0)

          // If still just 1 part, try splitting on inline numbered list pattern
          // e.g. "1. step one 2. step two 3. step three"
          if (parts.length === 1) {
            // Split before each "number. " or "number) " pattern
            const inlineParts = normalized
              .split(/(?=\d+[\.\)]\s)/)
              .map(l => l.trim())
              .filter(l => l.length > 0)
            if (inlineParts.length > 1) parts = inlineParts
          }

          return parts
        }

        // Strip numbered prefix (1. / 1) / 1- ) or bullet (- * • +)
        const cleanPrefix = (str: string) =>
          str.replace(/^\d+[\.\)\-]\s+/, "").replace(/^[\-\*•\+]\s+/, "").trim()

        const stepLines = splitLines(stepDesc)
        const expectedLines = splitLines(expectedRes)

        if (stepLines.length > 0) {
          stepLines.forEach((line, i) => {
            const cleanStep = cleanPrefix(line)
            if (!cleanStep) return // skip blank lines

            // Match each step to its corresponding expected result.
            // If steps > expected results, reuse the last expected result.
            let cleanExpected = "Expected result satisfied"
            if (expectedLines.length > 0) {
              const rawExpected = i < expectedLines.length
                ? expectedLines[i]
                : expectedLines[expectedLines.length - 1]
              cleanExpected = cleanPrefix(rawExpected)
            } else if (expectedRes.trim()) {
              cleanExpected = cleanPrefix(expectedRes.trim())
            }

            currentTestCase.steps.push({
              actionDescription: cleanStep,
              expectedResult: cleanExpected,
              actionType: actionTypeVal || "custom_instruction",
              targetType: targetTypeVal || "none",
              targetValue: targetValueVal || null,
              inputValue: inputValueVal || null,
              timeoutMs: timeoutMsVal || 10000,
            })
          })
        } else if (stepDesc.trim() || expectedRes.trim()) {
          // Fallback: single step
          currentTestCase.steps.push({
            actionDescription: stepDesc.trim() || "No description provided",
            expectedResult: expectedRes.trim() || "No expected result",
            actionType: actionTypeVal || "custom_instruction",
            targetType: targetTypeVal || "none",
            targetValue: targetValueVal || null,
            inputValue: inputValueVal || null,
            timeoutMs: timeoutMsVal || 10000,
          })
        }
      }
    })

    setParsedTestCases(testCasesMap)
    setStep(3)
  }

  // Step 3: Send bulk request to database
  async function handleConfirmImport() {
    if (parsedTestCases.length === 0) {
      alert("No valid test cases parsed to import.")
      return
    }

    setIsImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk",
          testCases: parsedTestCases
        })
      })

      if (res.ok) {
        onImportSuccess()
        onClose()
      } else {
        const errorData = await res.json()
        alert(errorData.error || "Failed to import test cases.")
      }
    } catch {
      alert("Network error trying to import test cases.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.08)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
          <div>
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-500" /> Excel Test Case Importer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Easily import your manual test cases into the workspace
            </p>
          </div>
          
          {/* Progress Indicators */}
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className={`px-2.5 py-1 rounded-full ${step === 1 ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>1. Upload</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`px-2.5 py-1 rounded-full ${step === 2 ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>2. Map Columns</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`px-2.5 py-1 rounded-full ${step === 3 ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>3. Preview</span>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[300px]">
          
          {/* STEP 1: UPLOAD FILE */}
          {step === 1 && (
            <div className="space-y-6 py-4">
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-xl p-12 text-center bg-accent/5 hover:bg-accent/15 cursor-pointer transition-all flex flex-col items-center justify-center group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                  accept=".xlsx, .xls"
                  className="hidden" 
                />
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform mb-4">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <h4 className="font-semibold text-lg">Drag & Drop Excel File here</h4>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                  Support formats: .xlsx or .xls files. Make sure the first row contains column headings.
                </p>
                <Button variant="outline" size="sm" className="mt-5 bg-background">
                  Browse Files
                </Button>
              </div>

              {errorMsg && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2.5 animate-shake">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Template Download */}
              <div className="p-4 bg-accent/10 border border-dashed rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Don&apos;t have a file yet?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Download our ready-made template with sample data, instructions, and valid value references.
                    </p>
                  </div>
                </div>
                <a
                  href="/api/test-cases/template"
                  download="test-cases-template.xlsx"
                  className="shrink-0"
                >
                  <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap">
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* STEP 2: DYNAMIC HEADER MAPPING */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 bg-accent/15 rounded-xl border flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-primary" />
                <div className="text-xs">
                  <strong className="text-foreground">Map Spreadsheet Columns:</strong> Connect headings found in <span className="font-semibold">{file?.name}</span> with database test case fields.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {SCHEMA_FIELDS.map((field) => (
                  <div key={field.key} className="p-4 border rounded-xl bg-card space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold text-sm flex items-center gap-1.5">
                        {field.label}
                      </Label>
                      {mapping[field.key as keyof ColumnMapping] && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                          <Check className="h-3 w-3" /> Auto-Mapped
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">{field.desc}</p>
                    <select
                      value={mapping[field.key as keyof ColumnMapping]}
                      onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">-- Do Not Map --</option>
                      {headers.map((h, i) => (
                        <option key={i} value={String(i)}>
                          Column {XLSX.utils.encode_col(i)}: {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW AND CONFIRM */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 dark:bg-green-950/15 border border-green-200 dark:border-green-900/50 rounded-xl flex items-center gap-3">
                <Eye className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div className="text-xs text-green-800 dark:text-green-300">
                  <span className="font-semibold">Parsing Completed:</span> Successfully loaded <span className="font-semibold">{parsedTestCases.length} Test Cases</span> from the file. Please review the details below.
                </div>
              </div>

              <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                {parsedTestCases.map((tc, index) => (
                  <div key={index} className="border rounded-xl p-4 bg-card/40 hover:bg-card/75 transition-colors space-y-3">
                    <div className="flex items-start justify-between border-b pb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-md text-foreground break-words" dir="auto">{tc.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Hierarchy: <span className="font-semibold text-foreground" dir="auto">
                            {tc.module}
                            {tc.featureName && ` → ${tc.featureName}`}
                            {tc.componentName && ` → ${tc.componentName}`}
                          </span> · Steps Count: <span className="font-medium text-foreground">{tc.steps.length}</span>
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded font-bold uppercase shrink-0 ml-2 ${
                        tc.priority === "Critical" ? "bg-red-100 text-red-700" :
                        tc.priority === "High" ? "bg-orange-100 text-orange-700" :
                        tc.priority === "Medium" ? "bg-blue-100 text-blue-700" :
                        "bg-muted text-foreground"
                      }`}>
                        {tc.priority}
                      </span>
                    </div>

                    {tc.preconditions && (
                      <div className="text-xs text-muted-foreground bg-accent/20 p-2.5 rounded-lg border" dir="auto">
                        <strong className="text-foreground">Preconditions:</strong> {tc.preconditions}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-muted-foreground">Steps Checklist</div>
                      <ol className="list-decimal list-inside divide-y border rounded-lg bg-background/50 overflow-hidden">
                        {tc.steps.map((step: any, stepIdx: number) => (
                          <li key={stepIdx} className="p-3 text-xs flex flex-col md:flex-row gap-2 items-start justify-between hover:bg-accent/10 transition-colors">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="font-medium text-foreground break-words" dir="auto">{step.actionDescription}</div>
                              <div className="text-[11px] text-muted-foreground break-words" dir="auto"><strong className="font-semibold">Expected:</strong> {step.expectedResult}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2 md:mt-0 items-center justify-end shrink-0">
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary border font-medium">{step.actionType}</span>
                              {step.targetValue && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 border font-mono truncate max-w-[150px]" title={`${step.targetType}: ${step.targetValue}`}>
                                  {step.targetType}: {step.targetValue}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-accent/10">
          <div>
            {step > 1 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                disabled={isImporting}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isImporting}>
              Cancel
            </Button>
            
            {step === 2 && (
              <Button 
                onClick={handleGeneratePreview}
                className="bg-primary hover:bg-primary/95 flex items-center gap-1.5"
              >
                Preview & Verify <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            {step === 3 && (
              <Button 
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Import {parsedTestCases.length} Test Cases
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
