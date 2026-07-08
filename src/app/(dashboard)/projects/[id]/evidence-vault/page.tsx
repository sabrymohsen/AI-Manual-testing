"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  FolderOpen,
  Image as ImageIcon,
  Video,
  FileText,
  Search,
  Filter,
  Download,
  Tag,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  XCircle,
  HelpCircle,
  Loader2,
  Calendar
} from "lucide-react"

interface EvidenceItem {
  id: string
  testExecutionId: string
  fileType: string
  filePath: string
  stepNumber: number
  pageUrl: string
  elementLocator: string
  status: string
  tags: string[]
  createdAt: string
}

export default function EvidenceVaultPage() {
  const params = useParams()
  const projectId = params.id as string

  // Datasets
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [selectedFile, setSelectedFile] = useState<EvidenceItem | null>(null)

  // Filters
  const [filterType, setFilterType] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Compare mode
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<EvidenceItem[]>([])

  // Tags input
  const [editingTags, setEditingTags] = useState("")
  const [savingTags, setSavingTags] = useState(false)

  // Timeline step
  const [timelineStep, setTimelineStep] = useState(1)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEvidenceData()
  }, [])

  const loadEvidenceData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/evidence")
      if (res.ok) {
        const data = await res.json()
        setEvidence(data.evidence || [])
        if (data.evidence?.length > 0) {
          setSelectedFile(data.evidence[0])
          setEditingTags(data.evidence[0].tags.join(", "))
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const selectFile = (file: EvidenceItem) => {
    setSelectedFile(file)
    setEditingTags(file.tags.join(", "))
  }

  const handleUpdateTags = async () => {
    if (!selectedFile) return
    setSavingTags(true)
    try {
      const tagsArray = editingTags.split(",").map(t => t.trim()).filter(Boolean)
      const res = await fetch("/api/autotest/evidence/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: selectedFile.id,
          tags: tagsArray
        })
      })
      if (res.ok) {
        const data = await res.json()
        setEvidence(prev => prev.map(f => f.id === selectedFile.id ? data.file : f))
        setSelectedFile(data.file)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSavingTags(false)
    }
  }

  const handleToggleCompare = (file: EvidenceItem) => {
    if (compareSelection.some(item => item.id === file.id)) {
      setCompareSelection(prev => prev.filter(item => item.id !== file.id))
    } else {
      if (compareSelection.length >= 2) {
        setCompareSelection([compareSelection[1], file])
      } else {
        setCompareSelection(prev => [...prev, file])
      }
    }
  }

  // Filtered evidence items list
  const filteredEvidence = useMemo(() => {
    return evidence.filter(item => {
      const matchType = filterType === "all" || item.fileType === filterType
      const matchStatus = filterStatus === "all" || item.status === filterStatus
      const q = searchQuery.toLowerCase()
      const matchQuery = !searchQuery || 
        item.pageUrl.toLowerCase().includes(q) ||
        item.elementLocator.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
      
      return matchType && matchStatus && matchQuery
    })
  }, [evidence, filterType, filterStatus, searchQuery])

  // Mock Timeline Steps Data
  const timelineSteps = [
    { step: 1, action: "Navigate to https://example.com/login", status: "pass", img: "triaged_login_flow" },
    { step: 2, action: "Enter username 'tester@example.com' in email field", status: "pass", img: "login_filled" },
    { step: 3, action: "Enter password 'tester123' in password field", status: "pass", img: "login_filled" },
    { step: 4, action: "Click login submit button", status: "fail", img: "mock-screenshot-login-fail" }
  ]

  const activeTimeline = timelineSteps.find(s => s.step === timelineStep) || timelineSteps[0]

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-slate-800">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <FolderOpen className="text-indigo-650 animate-pulse h-5 w-5" /> Evidence Vault
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Browse and compare test screenshots, videos, and network traces fetched from target/allure-results/.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setCompareMode(!compareMode)
              setCompareSelection([])
            }}
            variant="outline"
            className={`border-indigo-150 text-indigo-700 h-9 text-xs rounded-xl flex items-center gap-1.5 shadow-2xs ${
              compareMode ? "bg-indigo-50 font-black border-indigo-300" : "bg-white"
            }`}
          >
            <ArrowLeftRight size={13} /> {compareMode ? "Exit Compare Mode" : "Side-by-Side Compare"}
          </Button>
        </div>
      </div>

      {/* Main Grid content layout */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400 border bg-white rounded-2xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Syncing Allure artifacts repository...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Masonry gallery grid & filters */}
          <div className="lg:col-span-8 space-y-6">
            
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              
              {/* Filter controls row */}
              <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  
                  {/* Search Bar */}
                  <div className="relative w-44">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-450" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search locator, URL..."
                      className="w-full h-8 pl-8 pr-2 rounded-xl border border-slate-200 text-[10.5px] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50"
                    />
                  </div>

                  {/* Filter by Type */}
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="flex h-8 w-28 rounded-xl border border-input bg-background px-3 py-1 text-[10.5px] focus-visible:ring-1 focus-visible:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="screenshot">Screenshots</option>
                    <option value="video">Videos</option>
                    <option value="log">Logs</option>
                    <option value="har">HAR Traces</option>
                  </select>

                  {/* Filter by Status */}
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="flex h-8 w-28 rounded-xl border border-input bg-background px-3 py-1 text-[10.5px] focus-visible:ring-1 focus-visible:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="pass">Passed</option>
                    <option value="fail">Failed</option>
                    <option value="info">Info</option>
                  </select>

                </div>

                <div className="text-[10px] text-slate-400 font-mono font-bold">
                  {filteredEvidence.length} items found
                </div>
              </div>

              {/* Masonry / Grid display */}
              {compareMode ? (
                <div className="space-y-4">
                  <div className="bg-indigo-50/50 border border-indigo-150 p-3 rounded-xl text-center text-indigo-700">
                    Select 2 screenshots below to compare them side-by-side. 
                    Currently selected: <span className="font-black font-mono">{compareSelection.length} / 2</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {compareSelection.map((item, idx) => (
                      <div key={idx} className="border bg-slate-50 rounded-2xl overflow-hidden p-3 space-y-2">
                        <div className="flex justify-between items-center text-[10px] border-b pb-1">
                          <span className="font-extrabold text-slate-800">{item.pageUrl}</span>
                          <span className={`px-2 py-0.2 border text-[9px] rounded font-black uppercase ${
                            item.status === "pass" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        
                        <div className="aspect-video bg-slate-100 border rounded-xl overflow-hidden flex items-center justify-center relative">
                          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] flex flex-col justify-center items-center text-center">
                            <span className="text-[9px] text-slate-400 uppercase font-black">Comparison Screenshot {idx + 1}</span>
                            <span className="text-[8px] font-mono text-slate-400 mt-1">ID: {item.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {compareSelection.length < 2 && (
                      <div className="border border-dashed p-10 rounded-2xl flex flex-col items-center justify-center text-slate-400 italic gap-2 min-h-[220px]">
                        <ImageIcon size={28} />
                        <span>Select another item below to start comparison</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[380px] overflow-y-auto pr-1">
                  {filteredEvidence.map(item => {
                    const isSelected = selectedFile?.id === item.id
                    return (
                      <div
                        key={item.id}
                        onClick={() => selectFile(item)}
                        className={`border rounded-2xl p-3.5 space-y-3 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-all ${
                          isSelected ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px]">
                          <span className={`px-1.5 py-0.2 border rounded text-[9px] font-black uppercase ${
                            item.fileType === "screenshot" ? "bg-blue-50 text-blue-700 border-blue-100" :
                            item.fileType === "video" ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}>
                            {item.fileType}
                          </span>
                          <span className={`h-2.5 w-2.5 rounded-full ${
                            item.status === "pass" ? "bg-emerald-500" : item.status === "fail" ? "bg-rose-500" : "bg-slate-400"
                          }`} />
                        </div>

                        <div className="aspect-video bg-slate-100 border rounded-xl overflow-hidden flex items-center justify-center relative select-none text-center">
                          <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] flex flex-col justify-center items-center p-1">
                            <span className="text-[7.5px] font-black text-slate-450 block truncate w-32">{item.pageUrl}</span>
                            <span className="text-[7px] text-slate-400 font-mono block mt-0.5">{item.fileType.toUpperCase()} file</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[9px]">
                          <span className="text-slate-450 font-bold font-mono">Step #{item.stepNumber}</span>
                          <span className="text-slate-400 font-medium">{new Date(item.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    )
                  })}
                  {filteredEvidence.length === 0 && (
                    <p className="text-slate-400 italic text-center py-12 col-span-3">No matching evidence items found in Allure attachments.</p>
                  )}
                </div>
              )}

            </div>

            {/* Timeline walkthrough builder */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Chronological Timeline Walkthrough</span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={timelineStep === 1}
                    onClick={() => setTimelineStep(prev => Math.max(1, prev - 1))}
                    className="h-6 w-6 rounded-lg border flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span className="text-[10px] font-bold font-mono">{timelineStep} / {timelineSteps.length}</span>
                  <button
                    disabled={timelineStep === timelineSteps.length}
                    onClick={() => setTimelineStep(prev => Math.min(timelineSteps.length, prev + 1))}
                    className="h-6 w-6 rounded-lg border flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-slate-50 border p-3 rounded-2xl">
                <div className="md:col-span-7 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 bg-indigo-650 text-white rounded-full flex items-center justify-center font-bold text-[9px]">
                      {activeTimeline.step}
                    </span>
                    <span className="font-extrabold text-slate-800 text-[10.5px]">Step Description</span>
                  </div>
                  <p className="text-slate-600 font-medium text-[10.5px] leading-relaxed pl-7">{activeTimeline.action}</p>
                  <div className="pl-7 pt-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase ${
                      activeTimeline.status === "pass" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                        : "bg-rose-50 text-rose-700 border-rose-100"
                    }`}>
                      {activeTimeline.status}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-5 aspect-video bg-white border rounded-xl overflow-hidden flex items-center justify-center relative select-none">
                  <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] flex flex-col justify-center items-center text-center p-2">
                    <span className="text-[8.5px] font-black text-slate-450 uppercase">{activeTimeline.img}</span>
                    <span className="text-[7.5px] text-slate-400 font-mono mt-0.5">Walkthrough Screenshot</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Evidence Detail view metadata */}
          <div className="lg:col-span-4 space-y-6">
            
            {selectedFile ? (
              <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Evidence Inspector</span>
                  {compareMode && (
                    <Button
                      onClick={() => handleToggleCompare(selectedFile)}
                      variant="outline"
                      className={`h-7 px-2.5 text-[9px] font-bold rounded-xl border flex items-center gap-1 ${
                        compareSelection.some(item => item.id === selectedFile.id)
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "border-slate-200 text-slate-700 bg-white"
                      }`}
                    >
                      <ArrowLeftRight size={10} /> Compare Selection
                    </Button>
                  )}
                </div>

                {/* Main preview box */}
                <div className="aspect-video bg-slate-50 border rounded-2xl overflow-hidden flex items-center justify-center relative select-none text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] flex flex-col justify-between p-2.5">
                    <div className="bg-white/80 border text-[8px] p-1 rounded font-mono font-bold truncate">{selectedFile.pageUrl}</div>
                    <div className="text-center text-slate-450 uppercase font-black text-[9px] flex flex-col items-center gap-1">
                      <FolderOpen size={24} className="text-slate-400" />
                      <span>{selectedFile.fileType} artifact preview</span>
                    </div>
                    <div className="bg-slate-800/80 border text-[7.5px] p-1 rounded font-mono text-white text-center">Step #{selectedFile.stepNumber} log details</div>
                  </div>
                </div>

                {/* Metadata info */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 text-[10px] border-b pb-1.5 gap-2">
                    <span className="text-slate-400 font-bold uppercase">Artifact Type</span>
                    <span className="col-span-2 font-mono font-bold text-slate-850 uppercase">{selectedFile.fileType}</span>
                  </div>

                  <div className="grid grid-cols-3 text-[10px] border-b pb-1.5 gap-2">
                    <span className="text-slate-400 font-bold uppercase">Locator Used</span>
                    <span className="col-span-2 font-mono font-bold text-slate-650 break-all select-all">{selectedFile.elementLocator}</span>
                  </div>

                  <div className="grid grid-cols-3 text-[10px] border-b pb-1.5 gap-2">
                    <span className="text-slate-400 font-bold uppercase">Timestamp</span>
                    <span className="col-span-2 font-mono font-bold text-slate-600">{new Date(selectedFile.createdAt).toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-3 text-[10px] border-b pb-1.5 gap-2">
                    <span className="text-slate-400 font-bold uppercase">Execution ID</span>
                    <span className="col-span-2 font-mono font-bold text-slate-500 break-all">{selectedFile.testExecutionId}</span>
                  </div>
                </div>

                {/* Tags block & buttons */}
                <div className="space-y-3.5">
                  
                  {/* Tag editor */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 block uppercase">Modify Tags</label>
                    <div className="flex gap-2">
                      <input
                        value={editingTags}
                        onChange={(e) => setEditingTags(e.target.value)}
                        placeholder="Tags (comma separated)"
                        className="flex-1 h-8 rounded-xl border border-slate-200 px-3 text-xs bg-slate-50/50"
                      />
                      <Button
                        onClick={handleUpdateTags}
                        disabled={savingTags}
                        className="bg-slate-800 text-white hover:bg-slate-900 rounded-xl h-8 text-[10px] font-bold shadow-xs px-3"
                      >
                        {savingTags ? <Loader2 className="animate-spin" size={12} /> : <Tag size={12} />}
                      </Button>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <Button
                    onClick={() => alert("Simulated download triggered for file ID: " + selectedFile.id)}
                    className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl h-9.5 w-full text-xs font-black shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Download size={13} /> Download Test Evidence File
                  </Button>

                </div>

              </div>
            ) : (
              <div className="py-24 text-center text-slate-400 border bg-white rounded-2xl flex flex-col items-center justify-center gap-2">
                <FolderOpen size={32} />
                <span>No evidence item selected.</span>
              </div>
            )}

            {/* API Request Response logger block */}
            {selectedFile?.fileType === "log" && (
              <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">API Request Response Logger</span>
                
                <div className="space-y-2 font-mono text-[9px] leading-relaxed">
                  <div>
                    <span className="text-[8px] font-black text-indigo-600 block uppercase">Request URL & Headers</span>
                    <pre className="bg-slate-50 border p-2 rounded-xl text-slate-650 overflow-x-auto">
                      {`GET https://reqres.in/api/users?page=2\nAccept: application/json\nContent-Type: application/json`}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-rose-600 block uppercase">Response Body payload (Status 429)</span>
                    <pre className="bg-rose-50/20 border border-rose-100 p-2.5 rounded-xl text-rose-700 overflow-x-auto whitespace-pre-wrap select-text">
                      {`{\n  "status": 429,\n  "error": "Too Many Requests",\n  "message": "API rate limiting threshold reached."\n}`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  )
}
