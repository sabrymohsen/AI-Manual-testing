"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Play,
  Code,
  Layers,
  Database,
  Globe,
  Terminal,
  FileText,
  Search,
  Plus,
  Trash2,
  Save,
  Sparkles,
  ClipboardCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Info,
  MousePointerClick
} from "lucide-react"
import Editor from "@monaco-editor/react"

interface TestScriptItem {
  id: string
  name: string
  type: string
  code: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface TestExecutionItem {
  id: string
  status: string
  logOutput: string
  allureLink: string | null
  browser: string | null
  createdAt: string
}

export default function AutoTestEnginePage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Tabs: Web | API | Database
  const [activeTypeTab, setActiveTypeTab] = useState<"Web" | "API" | "Database">("Web")

  // Scripts
  const [scripts, setScripts] = useState<TestScriptItem[]>([])
  const [selectedScript, setSelectedScript] = useState<TestScriptItem | null>(null)
  const [editorCode, setEditorCode] = useState("")
  const [scriptName, setScriptName] = useState("")
  const [scriptTags, setScriptTags] = useState("")

  // Executions
  const [executions, setExecutions] = useState<TestExecutionItem[]>([])
  const [activeExecution, setActiveExecution] = useState<TestExecutionItem | null>(null)
  const [running, setRunning] = useState(false)
  const [selectedBrowser, setSelectedBrowser] = useState("Headless")

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [copiedText, setCopiedText] = useState("")

  // Smart Locator picker state
  const [selectedLocatorElement, setSelectedLocatorElement] = useState<string | null>(null)
  const [generatedLocatorCode, setGeneratedLocatorCode] = useState("")

  useEffect(() => {
    loadTestScripts()
  }, [])

  const loadTestScripts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/scripts")
      if (res.ok) {
        const data = await res.json()
        const items = data.scripts || []
        setScripts(items)
        if (items.length > 0) {
          // Select first script matching current tab
          const firstMatch = items.find((s: any) => s.type === activeTypeTab) || items[0]
          selectScript(firstMatch)
        }
      }
    } catch (err) {
      console.error("Failed to load automation scripts:", err)
    } finally {
      setLoading(false)
    }
  }

  const selectScript = async (script: TestScriptItem) => {
    setSelectedScript(script)
    setEditorCode(script.code)
    setScriptName(script.name)
    setScriptTags(script.tags.join(", "))
    
    // Load executions for this script
    try {
      const res = await fetch(`/api/autotest/scripts/${script.id}`)
      if (res.ok) {
        const data = await res.json()
        setExecutions(data.script?.executions || [])
        if (data.script?.executions?.length > 0) {
          setActiveExecution(data.script.executions[0])
        } else {
          setActiveExecution(null)
        }
      }
    } catch {
      setExecutions([])
      setActiveExecution(null)
    }
  }

  const handleSaveScript = async () => {
    if (!selectedScript) return
    setSaving(true)
    try {
      const tagsArray = scriptTags.split(",").map(t => t.trim()).filter(Boolean)
      const res = await fetch(`/api/autotest/scripts/${selectedScript.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scriptName,
          code: editorCode,
          type: selectedScript.type,
          tags: tagsArray
        })
      })
      if (res.ok) {
        const data = await res.json()
        setScripts(prev => prev.map(s => s.id === selectedScript.id ? data.script : s))
        // Show saved indicator
        const originalName = selectedScript.name
        setSelectedScript(data.script)
      }
    } catch (err) {
      console.error("Save script error:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateScript = async (type: string, name: string) => {
    setShowNewModal(false)
    try {
      const defaultCode = `package com.ourcompany.tests;

import org.testng.annotations.Test;

public class ${name} extends BaseTest {
    test("custom automated run", async ({ page }) => {
    public void testExecution() {
        navigateTo("https://example.com");
        assertPageTitle("Example Domain");
    }
}`
      const res = await fetch("/api/autotest/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          code: defaultCode,
          tags: [type, "New"]
        })
      })
      if (res.ok) {
        const data = await res.json()
        setScripts(prev => [data.script, ...prev])
        selectScript(data.script)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteScript = async () => {
    if (!selectedScript) return
    if (!confirm("Are you sure you want to delete this automation script?")) return
    try {
      const res = await fetch(`/api/autotest/scripts/${selectedScript.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        const remaining = scripts.filter(s => s.id !== selectedScript.id)
        setScripts(remaining)
        if (remaining.length > 0) {
          selectScript(remaining[0])
        } else {
          setSelectedScript(null)
          setEditorCode("")
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleRunTest = async () => {
    if (!selectedScript) return
    setRunning(true)
    setActiveExecution(null)
    try {
      // First save code updates
      await handleSaveScript()
      
      const res = await fetch("/api/autotest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: selectedScript.id,
          browser: selectedBrowser
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        const newExecution = data.execution
        setExecutions(prev => [newExecution, ...prev])
        setActiveExecution(newExecution)
      }
    } catch (err) {
      console.error("Test execution run error:", err)
    } finally {
      setRunning(false)
    }
  }

  const handleCopyLocator = (codeSnippet: string) => {
    navigator.clipboard.writeText(codeSnippet)
    setCopiedText(codeSnippet)
    setTimeout(() => setCopiedText(""), 2000)
  }

  // Filter scripts based on active tab
  const filteredScripts = useMemo(() => {
    return scripts.filter(s => s.type === activeTypeTab)
  }, [scripts, activeTypeTab])

  // Smart Locator coordinates details
  const locatorZones = [
    { name: "Search Input Field", selector: "By.id(\"search-input\")", code: "driver.element().type(By.id(\"search-input\"), \"query\");", x: 120, y: 72, w: 220, h: 32 },
    { name: "Search Submit Button", selector: "By.xpath(\"//button[@type='submit']\")", code: "driver.element().click(By.xpath(\"//button[@type='submit']\"));", x: 350, y: 72, w: 70, h: 32 },
    { name: "User Account Dropdown", selector: "By.cssSelector(\".user-profile-menu\")", code: "driver.element().click(By.cssSelector(\".user-profile-menu\"));", x: 620, y: 66, w: 100, h: 42 },
    { name: "Pro Upgrade Pricing Callout", selector: "By.className(\"pricing-upgrade-card\")", code: "driver.assertThat().element(By.className(\"pricing-upgrade-card\")).exists().perform();", x: 200, y: 190, w: 320, h: 140 }
  ]

  const triggerLocatorSelect = (zone: typeof locatorZones[0]) => {
    setSelectedLocatorElement(zone.name)
    setGeneratedLocatorCode(zone.code)
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-foreground">
      
      {/* Upper header controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Play className="text-indigo-650 animate-pulse fill-current h-5 w-5" /> AutoTest Engine
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Build, execute, and verify Playwright test specs directly from the manual testing dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewModal(true)}
            className="bg-indigo-650 hover:bg-primary/90 text-white rounded-xl h-9 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={13} /> New Script
          </Button>
        </div>
      </div>

      {/* Main Tab Controller */}
      <div className="flex items-center justify-between border-b pb-1.5 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border">
          {[
            { id: "Web", label: "Web Automation", icon: Globe },
            { id: "API", label: "API Testing", icon: Layers },
            { id: "Database", label: "Database Tests", icon: Database }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                const target = tab.id as any
                setActiveTypeTab(target)
                const firstMatch = scripts.find(s => s.type === target)
                if (firstMatch) selectScript(firstMatch)
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTypeTab === tab.id
                  ? "bg-card text-primary shadow-xs border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Layout Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        
        {/* Left Column: Test Scripts Library */}
        <div className="lg:col-span-3 border bg-card rounded-xl p-4 flex flex-col justify-between shadow-2xs space-y-4">
          <div className="space-y-3.5 flex-grow">
            <span className="text-[11px] font-medium text-slate-450 block border-b pb-1.5">Test Library</span>
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-[10px]">Loading tests...</span>
              </div>
            ) : filteredScripts.length === 0 ? (
              <p className="text-muted-foreground italic py-8 text-center text-[10px]">No test templates found for this tab.</p>
            ) : (
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredScripts.map(script => {
                  const isSelected = selectedScript?.id === script.id
                  return (
                    <div
                      key={script.id}
                      onClick={() => selectScript(script)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-primary/10 border-primary/25 shadow-2xs" 
                          : "border-border hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground block truncate">{script.name}.java</span>
                        <span className="text-[8px] bg-muted border text-muted-foreground font-semibold px-1 py-0.2 rounded">
                          {script.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {script.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[8.5px] bg-primary/10 text-primary font-medium px-1.5 py-0.2 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {selectedScript && (
            <Button
              onClick={handleDeleteScript}
              variant="outline"
              className="border-rose-100 text-rose-600 hover:bg-rose-50 rounded-xl w-full flex items-center justify-center gap-1.5 text-xs h-9 font-semibold"
            >
              <Trash2 size={13} /> Delete Script
            </Button>
          )}
        </div>

        {/* Center Column: Monaco Code Editor */}
        <div className="lg:col-span-6 border bg-card rounded-xl shadow-2xs flex flex-col overflow-hidden">
          <div className="p-3 border-b flex items-center justify-between bg-muted/50 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Code size={15} className="text-muted-foreground" />
              <input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="Script class name"
                className="font-mono font-semibold text-xs bg-transparent border-none focus:outline-none focus:ring-0 w-44 text-foreground"
              />
              <span className="text-[10px] text-muted-foreground font-mono">.java</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={scriptTags}
                onChange={(e) => setScriptTags(e.target.value)}
                placeholder="tags (comma separated)"
                className="text-[10px] border border-border rounded-lg px-2 py-1 h-7.5 w-40 font-medium bg-card"
              />
              <Button
                onClick={handleSaveScript}
                disabled={saving || !selectedScript}
                className="bg-slate-800 text-white hover:bg-slate-900 rounded-xl h-7.5 text-[10px] font-semibold flex items-center gap-1 shadow-xs"
              >
                {saving ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Save size={11} />
                )}
                Save
              </Button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 min-h-[360px] bg-slate-900">
            {selectedScript ? (
              <Editor
                height="440px"
                defaultLanguage="java"
                theme="vs-dark"
                value={editorCode}
                onChange={(val) => setEditorCode(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 11,
                  fontFamily: "monospace",
                  lineHeight: 18,
                  fontLigatures: true,
                  automaticLayout: true
                }}
              />
            ) : (
              <div className="py-24 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                <Terminal size={32} />
                <p className="font-mono">Create or select a test script class to start coding...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution Controller & Results */}
        <div className="lg:col-span-3 space-y-6 flex flex-col justify-between">
          
          {/* Quick Run Controller */}
          <div className="border bg-card rounded-xl p-4 shadow-2xs space-y-4">
            <span className="text-[11px] font-medium text-slate-450 block border-b pb-1.5">Runner Console</span>
            <div className="space-y-3">
              <label className="text-[10px] font-semibold text-muted-foreground block">Execution Browser Scope</label>
              <select
                value={selectedBrowser}
                onChange={(e) => setSelectedBrowser(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="Headless">Headless Chrome</option>
                <option value="Chrome">Google Chrome</option>
                <option value="Firefox">Mozilla Firefox</option>
                <option value="Edge">Microsoft Edge</option>
              </select>
            </div>
            
            <Button
              onClick={handleRunTest}
              disabled={running || !selectedScript}
              className="bg-indigo-650 hover:bg-primary/90 text-white rounded-xl h-10 w-full text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5"
            >
              {running ? (
                <>
                  <Loader2 className="animate-spin h-3.5 w-3.5" /> Running Playwright...
                </>
              ) : (
                <>
                  <Play size={13} className="fill-current" /> Run Test Suite
                </>
              )}
            </Button>
          </div>

          {/* Smart Locators Tool Box */}
          <div className="border bg-card rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center gap-1 justify-between border-b pb-1.5">
              <span className="text-[11px] font-medium text-slate-450">Smart Locators Helper</span>
              <Sparkles size={11} className="text-primary animate-bounce" />
            </div>
            
            {/* Simulated Screenshot Node */}
            <div className="relative w-full aspect-video border rounded-xl overflow-hidden shadow-2xs bg-muted select-none">
              <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] flex flex-col justify-between p-2">
                <div className="flex items-center justify-between border-b bg-white/70 backdrop-blur-xs p-1 rounded-md text-[8px] font-mono">
                  <span>http://mywebportal.com/login</span>
                </div>
                
                {/* Visual Picker Interactive zones */}
                <div className="flex justify-between items-center px-4">
                  <div 
                    onClick={() => triggerLocatorSelect(locatorZones[0])}
                    className="h-5 w-24 bg-blue-500/25 hover:bg-blue-500/40 border border-blue-500 rounded cursor-pointer flex items-center justify-center text-[7px] text-blue-700 font-semibold"
                  >
                    search-input
                  </div>
                  <div 
                    onClick={() => triggerLocatorSelect(locatorZones[1])}
                    className="h-5 w-12 bg-primary/25 hover:bg-primary/40 border border-primary rounded cursor-pointer flex items-center justify-center text-[7px] text-primary font-semibold"
                  >
                    submit
                  </div>
                </div>

                <div 
                  onClick={() => triggerLocatorSelect(locatorZones[2])}
                  className="absolute right-2 top-2.5 h-6 w-12 bg-amber-500/25 hover:bg-amber-500/40 border border-amber-500 rounded-md cursor-pointer flex items-center justify-center text-[7px] text-amber-700 font-semibold"
                >
                  profile
                </div>

                <div 
                  onClick={() => triggerLocatorSelect(locatorZones[3])}
                  className="mx-auto h-8 w-44 bg-purple-500/20 hover:bg-purple-500/35 border border-purple-500 rounded-md cursor-pointer flex items-center justify-center text-[7px] text-purple-700 font-semibold"
                >
                  pricing-card
                </div>
              </div>
            </div>

            {selectedLocatorElement ? (
              <div className="bg-muted/50 border p-2.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-[9.5px]">
                  <span className="text-slate-450 font-semibold uppercase">Locator for: {selectedLocatorElement}</span>
                  <button 
                    onClick={() => handleCopyLocator(generatedLocatorCode)}
                    className="text-primary hover:text-primary flex items-center gap-1 font-semibold"
                  >
                    {copiedText ? (
                      <>
                        <ClipboardCheck size={10} /> Copied!
                      </>
                    ) : (
                      <>
                        <ClipboardCheck size={10} /> Copy Code
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[9px] text-indigo-650 bg-primary/10 p-1.5 rounded border border-primary/25 overflow-x-auto whitespace-pre-wrap select-all font-semibold">
                  {generatedLocatorCode}
                </div>
              </div>
            ) : (
              <div className="bg-muted/50 border border-dashed p-3 rounded-xl text-center text-muted-foreground flex items-center gap-1.5 justify-center">
                <MousePointerClick size={12} />
                <span>Click visual zones on the canvas mockup to build Playwright locator snippets</span>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Terminal logs audit log section */}
      {activeExecution && (
        <div className="border bg-slate-950 text-slate-200 rounded-xl shadow-md overflow-hidden font-mono">
          <div className="bg-slate-900 border-b border-slate-800 p-3.5 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3">
              <Terminal size={14} className="text-muted-foreground animate-pulse" />
              <span className="font-semibold text-slate-300">JUnit / TestNG Live Execution Logs Console</span>
              <span className="text-muted-foreground font-semibold font-mono">Run ID: {activeExecution.id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                activeExecution.status === "Passed" 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
                {activeExecution.status === "Passed" ? (
                  <>
                    <CheckCircle2 size={11} className="fill-current" /> Passed
                  </>
                ) : (
                  <>
                    <XCircle size={11} className="fill-current" /> Failed
                  </>
                )}
              </span>
              <a
                href={activeExecution.allureLink || "#"}
                target="_blank"
                rel="noreferrer"
                className="bg-primary hover:bg-primary/90 text-white rounded-lg px-3 py-1 font-semibold text-[10px] transition-colors flex items-center gap-1 shadow-sm"
              >
                Allure Report <ArrowRight size={10} />
              </a>
            </div>
          </div>
          <div className="p-4 max-h-[320px] overflow-y-auto text-[10.5px] leading-relaxed select-text space-y-1 block whitespace-pre-wrap selection:bg-primary/30 selection:text-white">
            {activeExecution.logOutput}
          </div>
        </div>
      )}

      {/* ---- MODAL: NEW SCRIPT TEMPLATE ---- */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-semibold text-foreground">Select Test Template</h3>
              <button onClick={() => setShowNewModal(false)} className="text-muted-foreground hover:text-muted-foreground font-semibold">Close</button>
            </div>
            
            <p className="text-muted-foreground text-xs">
              Load one of the predefined Playwright specs to quickly build your automation suite workflows.
            </p>

            <div className="space-y-2">
              {[
                { name: "LoginFlowTest", desc: "Automated GUI login workflow (Web)", type: "Web" },
                { name: "ApiCrudTest", desc: "API REST endpoint validation using REST Assured (API)", type: "API" },
                { name: "DbQueryTest", desc: "Database JDBC validation querying JDBC targets (Database)", type: "Database" },
                { name: "SearchFlowTest", desc: "Product search user assertion flow (Web)", type: "Web" }
              ].map(tpl => (
                <div
                  key={tpl.name}
                  onClick={() => handleCreateScript(tpl.type, tpl.name)}
                  className="p-3 border rounded-xl hover:bg-primary/10 hover:border-primary/25 transition-all cursor-pointer flex justify-between items-center group"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground block group-hover:text-indigo-650">{tpl.name}.java</span>
                    <span className="text-[10px] text-muted-foreground block">{tpl.desc}</span>
                  </div>
                  <span className="text-[11px] font-medium text-primary">Load</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
