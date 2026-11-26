"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Grid,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  LayoutGrid,
  Loader2,
  ListRestart,
  HelpCircle
} from "@/components/ui/icons"

interface MatrixCell {
  id: string
  testId: string
  browserName: string
  status: string
  duration: number
  errorMessage: string | null
  executionDate: string
}

export default function CrossBrowserMatrixPage() {
  const params = useParams()
  const projectId = params.id as string

  // Grid datasets
  const [results, setResults] = useState<MatrixCell[]>([])
  const [recommendation, setRecommendation] = useState("")
  const [loading, setLoading] = useState(true)

  // Selected cell detail popover
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null)

  // Batch run checkboxes state
  const testOptions = ["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest"]
  const browserOptions = ["Chrome", "Firefox", "Edge", "Safari"]

  const [selectedTests, setSelectedTests] = useState<string[]>(["LoginFlowTest", "ApiCrudTest"])
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>(["Chrome", "Firefox", "Edge"])

  const [runningBatch, setRunningBatch] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)

  useEffect(() => {
    loadMatrixData()
  }, [])

  const loadMatrixData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/crossbrowser")
      if (res.ok) {
        const data = await res.json()
        setResults(data.results || [])
        setRecommendation(data.recommendation || "")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Grouped matrix selector map
  const matrixMap = useMemo(() => {
    const map: Record<string, Record<string, MatrixCell>> = {}
    testOptions.forEach(t => {
      map[t] = {}
      browserOptions.forEach(b => {
        // Find latest execution for this test and browser
        const match = results.find(r => r.testId === t && r.browserName === b)
        if (match) {
          map[t][b] = match
        } else {
          // Placeholder cell
          map[t][b] = {
            id: `empty-${t}-${b}`,
            testId: t,
            browserName: b,
            status: "not_run",
            duration: 0,
            errorMessage: null,
            executionDate: new Date().toISOString()
          }
        }
      })
    })
    return map
  }, [results])

  const handleRunBatchMatrix = async () => {
    if (selectedTests.length === 0 || selectedBrowsers.length === 0) {
      alert("Please select at least one test and one browser to run the matrix!")
      return
    }

    setRunningBatch(true)
    setBatchProgress(0)
    const totalCombinations = selectedTests.length * selectedBrowsers.length
    setBatchTotal(totalCombinations)

    // Simulate progress updates
    const timer = setInterval(() => {
      setBatchProgress(prev => {
        if (prev >= totalCombinations) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, 400)

    try {
      const res = await fetch("/api/autotest/crossbrowser/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tests: selectedTests,
          browsers: selectedBrowsers
        })
      })

      if (res.ok) {
        // Wait for timer to finish before loading results
        setTimeout(() => {
          clearInterval(timer)
          loadMatrixData()
          setRunningBatch(false)
          setBatchProgress(0)
        }, totalCombinations * 400)
      } else {
        setRunningBatch(false)
        clearInterval(timer)
      }
    } catch (err) {
      console.error(err)
      setRunningBatch(false)
      clearInterval(timer)
    }
  }

  const handleReRunSingle = async (cell: MatrixCell) => {
    setSelectedCell(null)
    setRunningBatch(true)
    setBatchTotal(1)
    setBatchProgress(1)
    try {
      const res = await fetch("/api/autotest/crossbrowser/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tests: [cell.testId],
          browsers: [cell.browserName]
        })
      })
      if (res.ok) {
        await loadMatrixData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setRunningBatch(false)
      setBatchProgress(0)
    }
  }

  const toggleTestSelection = (t: string) => {
    setSelectedTests(prev => prev.includes(t) ? prev.filter(item => item !== t) : [...prev, t])
  }

  const toggleBrowserSelection = (b: string) => {
    setSelectedBrowsers(prev => prev.includes(b) ? prev.filter(item => item !== b) : [...prev, b])
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-foreground">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutGrid className="text-indigo-650 animate-pulse h-5 w-5" /> CrossBrowser Matrix
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Browse automation test execution behaviors across multiple browser instances simultaneously.
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
          <span>Arguments: -DtargetBrowserName=chrome|firefox|edge</span>
        </div>
      </div>

      {/* Primary Content Rows */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground border bg-card rounded-xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Generating matrix grid data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: CrossBrowser Grid Map */}
          <div className="lg:col-span-8 space-y-6">
            
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-xs font-medium text-slate-450 block border-b pb-2">Matrix Results Overview</span>
              
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs font-medium text-slate-450 text-left">
                      <th className="p-3 text-left w-52">Test Case Class</th>
                      {browserOptions.map(b => (
                        <th key={b} className="p-3 text-center">{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650 text-left">
                    {testOptions.map(t => (
                      <tr key={t} className="hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-semibold text-foreground text-left truncate w-52">{t}</td>
                        {browserOptions.map(b => {
                          const cell = matrixMap[t][b]
                          let iconColor = "text-slate-300"
                          let Icon = HelpCircle

                          if (cell.status === "pass") {
                            iconColor = "text-emerald-500 hover:text-emerald-600 fill-emerald-500/10"
                            Icon = CheckCircle2
                          } else if (cell.status === "fail") {
                            iconColor = "text-rose-500 hover:text-rose-600 fill-rose-500/10 animate-pulse"
                            Icon = XCircle
                          } else if (cell.status === "flaky") {
                            iconColor = "text-amber-500 hover:text-amber-600 fill-amber-500/10"
                            Icon = AlertTriangle
                          }

                          return (
                            <td key={b} className="p-3 text-center">
                              <button
                                onClick={() => cell.status !== "not_run" && setSelectedCell(cell)}
                                disabled={cell.status === "not_run"}
                                className={`inline-flex flex-col items-center gap-1 transition-all ${
                                  cell.status !== "not_run" ? "cursor-pointer" : "opacity-40"
                                }`}
                              >
                                <Icon className={`h-6 w-6 ${iconColor}`} />
                                <span className="text-xs text-muted-foreground font-mono font-medium block">
                                  {cell.status !== "not_run" 
                                    ? new Date(cell.executionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : "Not Run"
                                  }
                                </span>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recommendation panel */}
            {recommendation && (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-1 border-b pb-2 text-primary">
                  <Sparkles size={13} />
                  <span className="text-xs font-medium">Cross-Browser Optimization Advice</span>
                </div>
                <div className="flex items-start gap-3 bg-primary/10 border border-primary/25 p-3 rounded-xl">
                  <Info className="text-primary shrink-0 mt-0.5" size={15} />
                  <p className="text-slate-650 leading-relaxed font-medium">
                    {recommendation}
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Batch Runner Control & Legend */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Batch Run Panel */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-xs font-medium text-slate-450 block border-b pb-2">Batch Run Controls</span>
              
              <div className="space-y-4">
                
                {/* Select tests */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-450 block uppercase">1. Select Tests</label>
                  <div className="space-y-1">
                    {testOptions.map(t => (
                      <div key={t} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTests.includes(t)}
                          onChange={() => toggleTestSelection(t)}
                          className="h-3.5 w-3.5 rounded border-border text-indigo-650 focus:ring-primary cursor-pointer"
                        />
                        <span className="text-foreground font-semibold font-mono text-xs">{t}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Select browsers */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-450 block uppercase">2. Select Target Browsers</label>
                  <div className="space-y-1">
                    {browserOptions.map(b => (
                      <div key={b} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedBrowsers.includes(b)}
                          onChange={() => toggleBrowserSelection(b)}
                          className="h-3.5 w-3.5 rounded border-border text-indigo-650 focus:ring-primary cursor-pointer"
                        />
                        <span className="text-foreground font-semibold font-mono text-xs">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {runningBatch ? (
                  <div className="space-y-2 text-center py-3">
                    <Loader2 size={18} className="animate-spin text-indigo-650 mx-auto" />
                    <span className="text-xs text-primary font-semibold">
                      Running {batchProgress} of {batchTotal} combinations...
                    </span>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-650 h-full transition-all duration-300" style={{ width: `${(batchProgress / batchTotal) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handleRunBatchMatrix}
                    className="bg-indigo-650 hover:bg-primary/90 text-white rounded-xl w-full h-9.5 font-semibold text-xs shadow-xs flex items-center justify-center gap-2"
                  >
                    <Play size={12} className="fill-current" /> Execute Matrix Suite
                  </Button>
                )}

              </div>
            </div>

            {/* Legend guide */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-3">
              <span className="text-xs font-medium text-slate-450 block border-b pb-2">Status Legend Guide</span>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-650">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500 h-4.5 w-4.5" />
                  <span>Pass</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="text-rose-500 h-4.5 w-4.5" />
                  <span>Fail</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-500 h-4.5 w-4.5" />
                  <span>Flaky</span>
                </div>
                <div className="flex items-center gap-2 opacity-55">
                  <HelpCircle className="text-slate-350 h-4.5 w-4.5" />
                  <span>Not Run</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ---- MODAL: CELL RESULT DETAIL POPUP ---- */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-semibold text-foreground">Execution Diagnostics Overview</h3>
              <button 
                onClick={() => setSelectedCell(null)} 
                className="text-muted-foreground hover:text-muted-foreground font-semibold"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-3 text-xs border-b pb-2 gap-2">
                <span className="text-muted-foreground font-semibold uppercase">Test Class</span>
                <span className="col-span-2 font-mono font-semibold text-slate-850">{selectedCell.testId}</span>
              </div>

              <div className="grid grid-cols-3 text-xs border-b pb-2 gap-2">
                <span className="text-muted-foreground font-semibold uppercase">Target Browser</span>
                <span className="col-span-2 font-mono font-semibold text-slate-850">{selectedCell.browserName}</span>
              </div>

              <div className="grid grid-cols-3 text-xs border-b pb-2 gap-2">
                <span className="text-muted-foreground font-semibold uppercase">Status</span>
                <span className={`col-span-2 font-mono font-semibold uppercase ${
                  selectedCell.status === "pass" ? "text-emerald-600" : selectedCell.status === "fail" ? "text-rose-600 animate-pulse" : "text-amber-600"
                }`}>
                  {selectedCell.status}
                </span>
              </div>

              <div className="grid grid-cols-3 text-xs border-b pb-2 gap-2">
                <span className="text-muted-foreground font-semibold uppercase">Duration</span>
                <span className="col-span-2 font-mono font-semibold text-slate-850 flex items-center gap-1">
                  <Clock size={11} className="text-muted-foreground" /> {selectedCell.duration}ms
                </span>
              </div>

              {selectedCell.errorMessage && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Error Message log</span>
                  <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl font-mono text-xs text-rose-700 select-all block break-all font-semibold">
                    {selectedCell.errorMessage}
                  </div>
                </div>
              )}

              {/* Triage Screenshot Placeholder */}
              <div className="aspect-video bg-muted/50 border rounded-xl overflow-hidden flex items-center justify-center relative select-none">
                <div className="absolute inset-0 [background-size:12px_12px] flex flex-col justify-center items-center text-center p-2">
                  <span className="text-xs font-semibold text-slate-450 uppercase">{selectedCell.browserName} rendering mock</span>
                  <span className="text-xs text-muted-foreground font-mono mt-0.5">Triage evidence screenshot</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedCell(null)}
                className="border-border text-muted-foreground rounded-xl flex-1 text-xs h-9 font-semibold"
              >
                Close
              </Button>
              <Button
                onClick={() => handleReRunSingle(selectedCell)}
                className="bg-indigo-650 text-white hover:bg-primary/90 rounded-xl flex-1 text-xs h-9 font-semibold flex items-center justify-center gap-1"
              >
                <ListRestart size={12} /> Re-run Result
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
