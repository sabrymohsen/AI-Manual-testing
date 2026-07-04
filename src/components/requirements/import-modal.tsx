import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, ChevronRight, Check, AlertCircle, FileSpreadsheet, Settings2, Eye, Loader2, ArrowLeft } from "lucide-react"
import * as XLSX from "xlsx"

interface ImportModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onImportSuccess: () => void
}

interface ColumnMapping {
  requirementKey: string
  title: string
  description: string
  acceptanceCriteria: string
  epic: string
  module: string
  feature: string
  component: string
  priority: string
  status: string
  figmaUrl: string
  externalUrl: string
  externalSystem: string
}

const SCHEMA_FIELDS = [
  { key: "requirementKey", label: "Requirement Key *", required: true, desc: "Unique identifier, e.g. REQ-AUTH-001." },
  { key: "title", label: "Title *", required: true, desc: "Brief summary of the requirement." },
  { key: "description", label: "Description", required: false, desc: "Detailed information about the requirement." },
  { key: "acceptanceCriteria", label: "Acceptance Criteria", required: false, desc: "Conditions to meet for compliance." },
  { key: "epic", label: "Parent Epic", required: false, desc: "Epic key or name — unmatched epics are auto-created." },
  { key: "module", label: "Module Name", required: false, desc: "Top-level module hierarchy path." },
  { key: "feature", label: "Feature Name", required: false, desc: "Mid-level feature hierarchy path." },
  { key: "component", label: "Component Name", required: false, desc: "Leaf-level component hierarchy path." },
  { key: "priority", label: "Priority", required: false, desc: "Low, Medium, High, Critical." },
  { key: "status", label: "Status", required: false, desc: "Draft, ReadyForTesting, InTesting, Deprecated." },
  { key: "figmaUrl", label: "Figma Link", required: false, desc: "URL link to Figma frames." },
  { key: "externalUrl", label: "External URL", required: false, desc: "Link to Jira, Azure DevOps, GitHub, etc." },
  { key: "externalSystem", label: "External System", required: false, desc: "Jira, AzureDevOps, GitHub, Manual, Other." }
]

export function ImportRequirementsModal({ projectId, isOpen, onClose, onImportSuccess }: ImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({
    requirementKey: "",
    title: "",
    description: "",
    acceptanceCriteria: "",
    epic: "",
    module: "",
    feature: "",
    component: "",
    priority: "",
    status: "",
    figmaUrl: "",
    externalUrl: "",
    externalSystem: ""
  })
  
  const [previewData, setPreviewData] = useState<any>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

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
        const rawJson = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })

        if (rawJson.length === 0) {
          setErrorMsg("The selected spreadsheet is empty.")
          return
        }

        const sheetHeaders = (rawJson[0] as string[]).map((h) => String(h).trim())
        setHeaders(sheetHeaders)
        
        const dataRows = rawJson.slice(1) as any[][]
        setRows(dataRows)

        // Auto guessing mappings
        const autoMapping = { ...mapping }
        sheetHeaders.forEach((header, index) => {
          const colIndex = String(index)
          const lowerHeader = header.toLowerCase()

          // Check "epic" before "key" so an "Epic Key" column maps to epic
          if (lowerHeader.includes("epic") || lowerHeader.includes("ملحمة")) {
            autoMapping.epic = colIndex
          } else if (lowerHeader.includes("key") || lowerHeader === "id" || lowerHeader.includes("رمز") || lowerHeader.includes("معرف")) {
            autoMapping.requirementKey = colIndex
          } else if (lowerHeader.includes("title") || lowerHeader === "name" || lowerHeader.includes("عنوان") || lowerHeader.includes("اسم")) {
            autoMapping.title = colIndex
          } else if (lowerHeader.includes("desc") || lowerHeader.includes("وصف")) {
            autoMapping.description = colIndex
          } else if (lowerHeader.includes("criteria") || lowerHeader.includes("acceptance") || lowerHeader.includes("معايير") || lowerHeader.includes("شروط")) {
            autoMapping.acceptanceCriteria = colIndex
          } else if (lowerHeader.includes("module") || lowerHeader.includes("قسم") || lowerHeader.includes("موديل")) {
            autoMapping.module = colIndex
          } else if (lowerHeader.includes("feature") || lowerHeader.includes("خاصية") || lowerHeader.includes("ميزة")) {
            autoMapping.feature = colIndex
          } else if (lowerHeader.includes("component") || lowerHeader.includes("مكون")) {
            autoMapping.component = colIndex
          } else if (lowerHeader.includes("priority") || lowerHeader.includes("أولوية") || lowerHeader.includes("اولوية")) {
            autoMapping.priority = colIndex
          } else if (lowerHeader.includes("status") || lowerHeader.includes("حالة") || lowerHeader.includes("حاله")) {
            autoMapping.status = colIndex
          } else if (lowerHeader.includes("figma") || lowerHeader.includes("فيجما")) {
            autoMapping.figmaUrl = colIndex
          } else if (lowerHeader.includes("external url") || lowerHeader.includes("link") || lowerHeader.includes("رابط")) {
            autoMapping.externalUrl = colIndex
          } else if (lowerHeader.includes("system") || lowerHeader.includes("jira") || lowerHeader.includes("devops") || lowerHeader.includes("github")) {
            autoMapping.externalSystem = colIndex
          }
        })
        
        setMapping(autoMapping)
        setStep(2)
      } catch (err) {
        console.error("Error reading file:", err)
        setErrorMsg("Failed to parse the file. Ensure it is a valid Excel file.")
      }
    }
    reader.readAsArrayBuffer(selectedFile)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  async function handleGeneratePreview() {
    if (!mapping.requirementKey) {
      alert("Mapping for 'Requirement Key' is required.")
      return
    }
    if (!mapping.title) {
      alert("Mapping for 'Title' is required.")
      return
    }

    setIsImporting(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to generate preview")
      }

      const data = await res.json()
      setPreviewData(data)
      setStep(3)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsImporting(false)
    }
  }

  async function handleConfirmImport() {
    if (!previewData || !previewData.previewRows) return
    setIsImporting(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewRows: previewData.previewRows })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to import requirements")
      }

      onImportSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="text-blue-600 h-5 w-5" /> Import Requirements
            </h2>
            <p className="text-xs text-slate-500 mt-1">Upload requirement maps and criteria documents directly.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1">&times;</button>
        </div>

        {/* Steps Breadcrumb */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2.5 flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span className={step === 1 ? "text-blue-600" : "text-slate-500"}>1. Upload spreadsheet</span>
          <ChevronRight size={14} />
          <span className={step === 2 ? "text-blue-600" : "text-slate-500"}>2. Map columns</span>
          <ChevronRight size={14} />
          <span className={step === 3 ? "text-blue-600" : "text-slate-500"}>3. Review & save</span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Import Error</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* STEP 1: Upload File */}
          {step === 1 && (
            <div className="space-y-6 py-8">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-blue-500 hover:bg-blue-50/10 rounded-2xl p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center bg-slate-50/50 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                  <Upload size={24} />
                </div>
                <span className="text-sm font-semibold text-slate-700 block">Drag & drop your requirement sheet</span>
                <span className="text-xs text-slate-400 mt-1 block">Supports XLSX, XLS or CSV files</span>
                <Button type="button" className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 rounded-lg">
                  Browse file
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Map Columns */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-2.5 items-start text-xs text-blue-800">
                <Settings2 className="shrink-0 text-blue-600 mt-0.5" size={16} />
                <div>
                  <p className="font-bold">Match Excel Columns to Requirement Fields</p>
                  <p className="mt-0.5 opacity-90">We guessed mappings based on headers. Review dropdown selections before generating the import preview.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SCHEMA_FIELDS.map((field) => (
                  <div key={field.key} className="border border-slate-150 rounded-xl p-4 bg-slate-50/35 hover:shadow-sm transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <Label className="text-xs font-bold text-slate-700">
                        {field.label}
                      </Label>
                      {field.required && (
                        <span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mb-3">{field.desc}</p>
                    <select
                      value={mapping[field.key as keyof ColumnMapping] || ""}
                      onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs focus:outline-none text-slate-700"
                    >
                      <option value="">-- Do Not Import / Skip --</option>
                      {headers.map((h, i) => (
                        <option key={i} value={String(i)}>
                          Column {i + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Review Import Preview */}
          {step === 3 && previewData && (
            <div className="space-y-6">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="border border-slate-100 p-4 bg-slate-50/50 rounded-xl text-center">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Rows parsed</span>
                  <span className="text-2xl font-bold text-slate-800 mt-1 block">{previewData.summary.totalRows}</span>
                </div>
                <div className="border border-slate-100 p-4 bg-green-50/30 rounded-xl text-center border-green-100/30">
                  <span className="text-[10px] font-bold text-green-600 block uppercase">Requirements to Create</span>
                  <span className="text-2xl font-bold text-green-700 mt-1 block">{previewData.summary.createdRequirements}</span>
                </div>
                <div className="border border-slate-100 p-4 bg-blue-50/30 rounded-xl text-center border-blue-100/30">
                  <span className="text-[10px] font-bold text-blue-600 block uppercase">Requirements to Update</span>
                  <span className="text-2xl font-bold text-blue-700 mt-1 block">{previewData.summary.updatedRequirements}</span>
                </div>
                <div className="border border-slate-100 p-4 bg-amber-50/30 rounded-xl text-center border-amber-100/30">
                  <span className="text-[10px] font-bold text-amber-600 block uppercase">Structure folders to create</span>
                  <span className="text-2xl font-bold text-amber-700 mt-1 block">
                    {previewData.summary.createdModules + previewData.summary.createdFeatures + previewData.summary.createdComponents + (previewData.summary.createdEpics || 0)}
                  </span>
                </div>
              </div>

              {/* Proposed Hierarchy Changes */}
              {((previewData.newStructures.epics?.length || 0) > 0 || previewData.newStructures.modules.length > 0 || previewData.newStructures.features.length > 0 || previewData.newStructures.components.length > 0) && (
                <div className="border border-amber-100 bg-amber-50/15 p-4 rounded-xl space-y-2.5">
                  <span className="text-xs font-bold text-amber-800 block">Proposed project structure changes:</span>
                  <div className="text-[11px] text-amber-700 space-y-1">
                    {(previewData.newStructures.epics || []).map((e: string, i: number) => (
                      <div key={`ep-${i}`}>• Create Epic: <span className="font-semibold">{e}</span></div>
                    ))}
                    {previewData.newStructures.modules.map((m: string, i: number) => (
                      <div key={i}>• Create Module: <span className="font-semibold">{m}</span></div>
                    ))}
                    {previewData.newStructures.features.map((f: string, i: number) => (
                      <div key={i}>• Create Feature: <span className="font-semibold">{f}</span></div>
                    ))}
                    {previewData.newStructures.components.map((c: string, i: number) => (
                      <div key={i}>• Create Component: <span className="font-semibold">{c}</span></div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rows List Grid */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-600 block">Data Preview Rows ({previewData.previewRows.length})</span>
                <div className="border border-slate-100 rounded-xl max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                  {previewData.previewRows.map((r: any, idx: number) => (
                    <div key={idx} className="p-3 bg-white flex items-start gap-4 justify-between text-xs hover:bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{r.requirementKey}</span>
                          <span className="text-slate-400 text-[10px]">({r.priority})</span>
                        </div>
                        <p className="font-medium text-slate-700 mt-0.5">{r.title}</p>
                        {r.epic && (
                          <span className="text-[10px] text-violet-500 block mt-1 font-semibold">
                            Epic: {r.epic}{r.epicAction === "Create" && " (new)"}
                          </span>
                        )}
                        {r.module && (
                          <span className="text-[10px] text-slate-400 block mt-1">
                            Folder: {r.module} {r.feature && ` / ${r.feature}`} {r.component && ` / ${r.component}`}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        r.action === "Create" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {r.action}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0 px-6">
          <div>
            {step > 1 && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center gap-1 hover:bg-slate-100 px-3 py-1.5 rounded-lg"
              >
                <ArrowLeft size={14} /> Back
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose} className="text-xs px-4 py-1.5 h-9 rounded-lg">
              Close
            </Button>
            
            {step === 2 && (
              <Button
                type="button"
                onClick={handleGeneratePreview}
                disabled={isImporting}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 h-9 rounded-lg flex items-center gap-1.5 shadow"
              >
                {isImporting ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : null}
                Generate Import Preview
              </Button>
            )}

            {step === 3 && (
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-5 py-1.5 h-9 rounded-lg flex items-center gap-1.5 shadow"
              >
                {isImporting ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : null}
                Confirm Import & Save
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
