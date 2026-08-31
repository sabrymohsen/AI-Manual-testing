"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Camera,
  Play,
  Square,
  Save,
  Download,
  Copy,
  Plus,
  Trash2,
  Tv,
  Loader2,
  Eye,
  ShieldCheck,
  CheckCircle2,
  Wrench,
  Smartphone,
  Laptop
} from "lucide-react"
import Editor from "@monaco-editor/react"

interface ActionStep {
  step: number
  action: string
  element: string
  locator: string
  value?: string
  status: string
}

export default function TestRecorderProPage() {
  const params = useParams()
  const projectId = params.id as string

  // Setup inputs
  const [targetUrl, setTargetUrl] = useState("https://example.com/login")
  const [selectedBrowser, setSelectedBrowser] = useState("Chrome")
  const [selectedDevice, setSelectedDevice] = useState("Desktop")

  // Recording states
  const [recording, setRecording] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  
  // Monaco editor state
  const [generatedCode, setGeneratedCode] = useState("")

  // Recorded actions list
  const [actionsLog, setActionsLog] = useState<ActionStep[]>([])

  const [savingScript, setSavingScript] = useState(false)
  const [copied, setCopied] = useState(false)

  // Simulation steps for clicks in our browser mockup
  const handleMockAction = (type: "click" | "type", name: string, selector: string, val?: string) => {
    if (!recording) return

    const stepNum = actionsLog.length + 1
    const newStep: ActionStep = {
      step: stepNum,
      action: type,
      element: name,
      locator: selector,
      value: val,
      status: "Recorded"
    }

    setActionsLog(prev => [...prev, newStep])

    // Dynamically update generated code preview in real-time
    let stepCode = ""
    let redactedVal = val || ""
    if (type === "type" && (name.toLowerCase().includes("pass") || name.toLowerCase().includes("key") || name.toLowerCase().includes("token"))) {
      redactedVal = "[REDACTED]"
    }

    if (type === "click") {
      stepCode = `\n        driver.element().click(${selector});`
    } else if (type === "type") {
      stepCode = `\n        driver.element().type(${selector}, "${redactedVal}");`
    }

    setGeneratedCode(prev => {
      // Find the last line before "    }\n}" to insert stepCode
      const lines = prev.split("\n")
      const insertIdx = lines.findIndex(l => l.trim() === "}")
      if (insertIdx !== -1) {
        lines.splice(insertIdx, 0, `        // Step #${stepNum}: ${type} on ${name}${stepCode}`)
        return lines.join("\n")
      }
      return prev + stepCode
    })
  }

  const handleStartRecording = async () => {
    setRecording(true)
    setSessionCompleted(false)
    setActionsLog([])
    
    // Initialize base generated code
    setGeneratedCode(`package com.ourcompany.tests;

import org.testng.annotations.Test;

public class RecordedFlowTest extends BaseTest {
    @Test(description = "Automated test flow recorded using Test Recorder Pro")
    public void testRecordedSteps() {
        navigateTo("${targetUrl}");
    }
}`)

    try {
      const res = await fetch("/api/autotest/recorder/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          browser: selectedBrowser,
          device: selectedDevice
        })
      })
      if (res.ok) {
        const data = await res.json()
        setActiveSessionId(data.session.id)
        
        // Push initial navigation step
        setActionsLog([{
          step: 1,
          action: "navigate",
          element: "Browser URL",
          locator: `"${targetUrl}"`,
          value: targetUrl,
          status: "Success"
        }])
      }
    } catch (err) {
      console.error("Start recording error:", err)
    }
  }

  const handleStopRecording = async () => {
    if (!activeSessionId) return
    setRecording(false)
    setSessionCompleted(true)
    
    try {
      const res = await fetch("/api/autotest/recorder/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          actionsLog
        })
      })
      if (res.ok) {
        const data = await res.json()
        setGeneratedCode(data.session.code)
      }
    } catch (err) {
      console.error("Stop recording error:", err)
    }
  }

  const handleSaveToLibrary = async () => {
    setSavingScript(true)
    try {
      const res = await fetch("/api/autotest/recorder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "RecordedFlowTest",
          code: generatedCode,
          type: "Web"
        })
      })
      if (res.ok) {
        alert("Recorded test script saved to AutoTest Engine library successfully!")
        setSessionCompleted(false)
        setActiveSessionId(null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSavingScript(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadJava = () => {
    const blob = new Blob([generatedCode], { type: "text/plain;charset=utf-8" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "RecordedFlowTest.java"
    link.click()
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-slate-800">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <Camera className="text-indigo-650 animate-pulse h-5 w-5" /> Test Recorder Pro
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Upgraded recording studio to automatically translate browser GUI actions into standard Playwright TypeScript test codes.
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
          <span>Integrated with: Playwright codegen</span>
        </div>
      </div>

      {/* Recording settings panel */}
      {!recording && !sessionCompleted && (
        <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
          <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Launch Studio Options</span>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-450 block">Target Application URL</label>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/login"
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-450 block">Target Browser</label>
              <select
                value={selectedBrowser}
                onChange={(e) => setSelectedBrowser(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-indigo-500"
              >
                <option value="Chrome">Google Chrome</option>
                <option value="Edge">Microsoft Edge</option>
              </select>
            </div>

            <Button
              onClick={handleStartRecording}
              className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl h-9.5 text-xs font-black shadow-xs flex items-center justify-center gap-1.5"
            >
              <Play size={12} className="fill-current" /> Start Recording Studio
            </Button>
          </div>
        </div>
      )}

      {/* Primary columns row */}
      {(recording || sessionCompleted) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[520px]">
          
          {/* Left / Center Grid: Mock Browser & Monaco Preview */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Mock Web Application Screen View */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b pb-2 flex-wrap gap-2">
                <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Live Capture Screen View Mockup</span>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-[10px] text-rose-500 font-black tracking-wider uppercase">Recording...</span>
                </div>
              </div>

              {/* simulated application interactive canvas mockup */}
              <div className="border bg-slate-100 rounded-2xl overflow-hidden shadow-2xs min-h-[290px] flex flex-col justify-between">
                <div className="bg-white border-b p-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-450 block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-450 block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-450 block" />
                  </div>
                  <div className="bg-slate-50 border rounded-lg px-3 py-1 flex-1 text-[10px] font-mono select-all truncate text-slate-500">
                    {targetUrl}
                  </div>
                </div>

                {/* Interactive login form simulation */}
                <div className="p-8 max-w-sm mx-auto w-full bg-white border rounded-2xl my-4 shadow-2xs space-y-4 select-none">
                  <h3 className="text-center font-extrabold text-slate-800">Mock App Login Workspace</h3>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 block uppercase">Username email field</label>
                    <button
                      onClick={() => handleMockAction("type", "Username field", "By.id(\"username\")", "tester@example.com")}
                      disabled={!recording}
                      className="w-full text-left h-8.5 px-3 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/10 rounded-xl text-slate-650 transition-colors block text-[10px] font-medium"
                    >
                      Click to type "tester@example.com"
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 block uppercase">Password credentials field</label>
                    <button
                      onClick={() => handleMockAction("type", "Password field", "By.xpath(\"//input[@type='password']\")", "tester123")}
                      disabled={!recording}
                      className="w-full text-left h-8.5 px-3 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/10 rounded-xl text-slate-650 transition-colors block text-[10px] font-medium"
                    >
                      Click to type "tester123"
                    </button>
                  </div>

                  <button
                    onClick={() => handleMockAction("click", "Submit Button", "By.xpath(\"//button[@type='submit']\")")}
                    disabled={!recording}
                    className="w-full h-9 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-xs block transition-colors"
                  >
                    Click to submit login form
                  </button>
                </div>

                <div className="bg-slate-50 p-2 text-center text-slate-400 text-[9.5px]">
                  Click the form buttons inside the mock app to record steps into SHAFT automation Java code.
                </div>
              </div>
            </div>

            {/* Monaco code preview block */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden flex flex-col shadow-md">
              <div className="bg-slate-950 p-3.5 border-b border-slate-850 flex items-center justify-between text-xs flex-wrap gap-2 text-slate-300 font-mono">
                <span className="font-black text-slate-200">Generated Playwright Code Preview</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                  <ShieldCheck size={11} className="fill-current" /> Privacy Redaction Active
                </span>
              </div>
              <div className="min-h-[290px] bg-slate-900">
                <Editor
                  height="340px"
                  defaultLanguage="java"
                  theme="vs-dark"
                  value={generatedCode}
                  onChange={(val) => setGeneratedCode(val || "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 10.5,
                    fontFamily: "monospace",
                    lineHeight: 18,
                    automaticLayout: true
                  }}
                />
              </div>
            </div>

          </div>

          {/* Right Column: Steps logs list & controls */}
          <div className="lg:col-span-4 space-y-6 flex flex-col justify-between">
            
            {/* Live Recorded steps */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3.5">
                <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Recorded Action Log</span>
                
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {actionsLog.map(act => (
                    <div key={act.step} className="p-3 border rounded-xl space-y-1.5 bg-slate-50/50">
                      <div className="flex justify-between items-center text-[10px] border-b pb-1">
                        <span className="font-extrabold text-slate-800">Step #{act.step}</span>
                        <span className="text-[8px] bg-indigo-50 border text-indigo-700 px-1.5 py-0.2 rounded font-black uppercase">{act.action}</span>
                      </div>
                      <div className="space-y-1 text-[9.5px]">
                        <div>
                          <span className="text-slate-400 font-bold block">Target Element</span>
                          <span className="text-slate-800 font-extrabold">{act.element}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block">Smart Locator</span>
                          <code className="font-mono text-[9px] text-slate-600 select-all block break-all font-bold">{act.locator}</code>
                        </div>
                        {act.value && (
                          <div>
                            <span className="text-slate-400 font-bold block">Value Entered</span>
                            <span className="text-slate-700 font-mono select-all font-bold">
                              {(act.element.toLowerCase().includes("pass") || act.element.toLowerCase().includes("key")) ? "[REDACTED]" : act.value}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {actionsLog.length === 0 && (
                    <p className="text-slate-400 italic text-center py-12">No steps recorded yet. Click buttons inside login form above to generate steps.</p>
                  )}
                </div>
              </div>

              {/* Live recording controller action buttons */}
              <div className="pt-4 border-t space-y-2.5">
                {recording ? (
                  <Button
                    onClick={handleStopRecording}
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-10 w-full text-xs font-black shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Square size={12} className="fill-current" /> Stop Recording Studio
                  </Button>
                ) : (
                  sessionCompleted && (
                    <div className="space-y-2.5">
                      <Button
                        onClick={handleSaveToLibrary}
                        disabled={savingScript}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl h-9.5 w-full text-xs font-black shadow-xs flex items-center justify-center gap-1.5"
                      >
                        {savingScript ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Save to AutoTest Engine
                      </Button>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCopyCode}
                          className="border-slate-200 text-slate-700 rounded-xl h-8.5 text-[10px] font-bold flex items-center justify-center gap-1 shadow-2xs bg-white"
                        >
                          <Copy size={11} /> {copied ? "Copied!" : "Copy Code"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleDownloadJava}
                          className="border-slate-200 text-slate-700 rounded-xl h-8.5 text-[10px] font-bold flex items-center justify-center gap-1 shadow-2xs bg-white"
                        >
                          <Download size={11} /> Download .java
                        </Button>
                      </div>
                      
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSessionCompleted(false)
                          setActiveSessionId(null)
                        }}
                        className="text-slate-400 hover:text-slate-600 rounded-xl w-full h-8 text-[10px] font-bold"
                      >
                        Clear Session / Start New
                      </Button>
                    </div>
                  )
                )}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
