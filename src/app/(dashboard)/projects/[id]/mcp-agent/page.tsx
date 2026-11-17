"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  Bot,
  Send,
  Sliders,
  Settings,
  Activity,
  Terminal,
  Play,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  ShieldAlert,
  Server,
  Lock,
  Loader2
} from "lucide-react"

interface McpActivityItem {
  id: string
  action: string
  status: string
  duration: number
  result: string
  createdAt: string
}

export default function McpAgentConsolePage() {
  const params = useParams()
  const projectId = params.id as string

  // UI Tabs: Chat | Config
  const [activeSubTab, setActiveSubTab] = useState<"Chat" | "Config">("Chat")

  // Mcp States
  const [activities, setActivities] = useState<McpActivityItem[]>([])
  const [serverUrl, setServerUrl] = useState("http://localhost:4000")
  const [provider, setProvider] = useState("Gemini")
  const [apiKey, setApiKey] = useState("••••••••••••••••••••")
  const [permissionLevel, setPermissionLevel] = useState("Can Execute Tests")
  const [serverOnline, setServerOnline] = useState(true)

  // Chat message logs
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "agent"; text: string; toolUsed?: string }[]>([
    { role: "agent", text: "Greetings! I am your MCP Agent. Exposing system automation capabilities via MCP. Select one of the quick command buttons or ask me to run tests directly." }
  ])
  const [chatInput, setChatInput] = useState("")

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadMcpData()
  }, [])

  const loadMcpData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/mcp")
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
        if (data.config) {
          setServerUrl(data.config.serverUrl)
          setProvider(data.config.provider)
          setApiKey(data.config.apiKey)
          setPermissionLevel(data.config.permissionLevel)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendPrompt = async (promptText: string) => {
    if (!promptText.trim()) return
    setSending(true)
    setChatMessages(prev => [...prev, { role: "user", text: promptText }])
    
    // Reset manual input
    if (promptText === chatInput) {
      setChatInput("")
    }

    try {
      const res = await fetch("/api/autotest/mcp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText })
      })

      if (res.ok) {
        const data = await res.json()
        setChatMessages(prev => [
          ...prev,
          { role: "agent", text: data.response, toolUsed: data.toolUsed }
        ])
        // Refresh activity log
        loadMcpData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/autotest/mcp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverUrl,
          provider,
          apiKey,
          permissionLevel
        })
      })
      if (res.ok) {
        alert("AI MCP configuration parameters updated and saved successfully!")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // Pre-built Quick Commands list
  const quickCommands = [
    { label: "Run all web tests", prompt: "Run all web tests in Chrome" },
    { label: "Why did payment test fail?", prompt: "Why did payment test fail? Run doctor analyze" },
    { label: "Record new test", prompt: "Record a new test for checkout flow" },
    { label: "Fix broken locators", prompt: "Fix broken locators in search tests using Smart Locators" },
    { label: "Show coverage report", prompt: "Show me the coverage report and Allure logs" }
  ]

  // Available exposed MCP tools palette definition
  const mcpTools = [
    { name: "test_run", desc: "Executes Maven test suites combinations with targeted browser config parameter", args: "-Dtest=[TestClass] -DtargetBrowserName=[browser]" },
    { name: "test_list", desc: "Exposes and lists all com.ourcompany.tests Java classes scripts", args: "none" },
    { name: "capture_start", desc: "Triggers execution video and logs trace recording sessions", args: "projectId=[id]" },
    { name: "doctor_analyze", desc: "Parses doctor-report JSON summaries to diagnose failure causes", args: "executionId=[id]" },
    { name: "browser_navigate", desc: "Launches dynamic GUI chromium browser sessions and navigates to URLs", args: "url=[url]" },
    { name: "api_request", desc: "Performs HTTP RestAssured requests validation checks", args: "method=[GET|POST], path=[path]" },
    { name: "report_get", desc: "Retrieves latest Allure test reports summaries statistics", args: "none" }
  ]

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-foreground">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="text-indigo-650 animate-pulse h-5 w-5" /> AI Agent Console
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Interact with your SHAFT automation suite using natural language prompts linked via Model Context Protocol (MCP).
          </p>
        </div>
        
        {/* Server Status Indicators */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border uppercase transition-colors ${
            serverOnline 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            <Server size={11} /> MCP Server: {serverOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Selector SubTabs Controls */}
      <div className="flex items-center justify-between border-b pb-1.5 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border">
          {[
            { id: "Chat", label: "Agent Playground Chat", icon: Bot },
            { id: "Config", label: "MCP Client Configurations", icon: Sliders }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === tab.id
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

      {/* Primary columns row */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground border bg-card rounded-xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Starting MCP agent console...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left/Center Column: Chat Box or Configurations */}
          <div className="lg:col-span-8 space-y-6">
            
            {activeSubTab === "Chat" ? (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
                <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Conversational Console Terminal</span>
                
                {/* Message Log */}
                <div className="h-96 border rounded-xl bg-muted/50 p-4 overflow-y-auto space-y-3 text-[11px] font-medium leading-relaxed">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex items-start gap-3 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                        msg.role === "user" ? "bg-slate-800 text-white" : "bg-indigo-650 text-white animate-pulse"
                      }`}>
                        {msg.role === "user" ? "U" : "A"}
                      </div>
                      
                      <div className="space-y-1">
                        <div className={`p-3 rounded-2xl ${
                          msg.role === "user" ? "bg-muted text-foreground rounded-tr-none" : "bg-primary/10 border border-primary/25 text-primary rounded-tl-none shadow-3xs"
                        }`}>
                          {msg.text}
                        </div>
                        {msg.toolUsed && (
                          <span className="text-[9px] font-mono text-slate-450 block font-semibold mt-1">
                            Exposed Tool Triggered: {msg.toolUsed}()
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-muted-foreground italic">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Agent is executing command via MCP client protocol...</span>
                    </div>
                  )}
                </div>

                {/* Prompt quick trigger helper labels */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {quickCommands.map(cmd => (
                    <button
                      key={cmd.label}
                      disabled={sending}
                      onClick={() => handleSendPrompt(cmd.prompt)}
                      className="px-2.5 py-1 text-[10px] font-semibold bg-muted hover:bg-muted text-foreground border rounded-lg transition-colors"
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>

                {/* Direct input controls */}
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-450 font-medium block">Command Palette:</span>
                    <select
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) {
                          const matched = mcpTools.find(tool => tool.name === val)
                          if (matched) {
                            setChatInput(`Run ${matched.name} with args: ${matched.args}`)
                          }
                        }
                      }}
                      className="flex h-8 rounded-xl border border-input bg-background px-3 py-1 text-[10.5px] cursor-pointer focus-visible:ring-1 focus-visible:ring-primary w-52"
                    >
                      <option value="">-- Choose MCP Command --</option>
                      {mcpTools.map(t => (
                        <option key={t.name} value={t.name}>{t.name} ({t.args})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendPrompt(chatInput)}
                      placeholder="Ask Agent to run login tests or analyze allure failure triage logs..."
                      className="flex-1 h-9.5 rounded-xl border border-border px-3 text-xs bg-muted/50"
                    />
                    <Button
                      onClick={() => handleSendPrompt(chatInput)}
                      disabled={sending || !chatInput.trim()}
                      className="bg-indigo-650 hover:bg-primary/90 text-white h-9.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Send size={13} /> Send
                    </Button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-5">
                <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">MCP Client Properties Settings</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-450 block">MCP Server Endpoint URL</label>
                    <input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://localhost:4000"
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-450 block">AI LLM Provider Scope</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <option value="Gemini">Google Gemini (Recommended)</option>
                      <option value="OpenAI">OpenAI GPT-4o</option>
                      <option value="Anthropic">Anthropic Claude Sonnet</option>
                      <option value="Ollama">Ollama Local Instance</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-450 block">API Decryption Key token</label>
                    <div className="relative">
                      <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="API Token Key"
                        className="flex h-9 w-full rounded-xl border border-input bg-background pl-8 pr-3 py-1 text-xs select-none focus-visible:ring-1 focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-450 block">Agent Permission Capability</label>
                    <select
                      value={permissionLevel}
                      onChange={(e) => setPermissionLevel(e.target.value)}
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <option value="Read-Only">Read-Only Logs</option>
                      <option value="Can Execute Tests">Execute Test Combinations</option>
                      <option value="Full Control">Full Control (Edit test files & execution)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t flex justify-end">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="bg-indigo-650 hover:bg-primary/90 text-white rounded-xl h-9.5 px-4 font-semibold shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {saving ? <Loader2 className="animate-spin" size={13} /> : <Settings size={13} />}
                    Save Configurations
                  </Button>
                </div>

              </div>
            )}

            {/* Activity Logs Table */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Exposed MCP Activity Audit Log</span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b text-[11px] font-medium text-slate-450">
                      <th className="p-3">Action Tool Call</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Duration (ms)</th>
                      <th className="p-3">Execution Outcome Summary</th>
                      <th className="p-3 text-right">Execution Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650">
                    {activities.map(act => (
                      <tr key={act.id} className="hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-mono font-semibold text-indigo-650">{act.action}()</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold border uppercase ${
                            act.status === "success" 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-semibold">{act.duration}ms</td>
                        <td className="p-3 font-medium text-muted-foreground max-w-[240px] truncate">{act.result}</td>
                        <td className="p-3 text-right text-muted-foreground font-mono text-[9.5px]">
                          {new Date(act.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column: Exposed MCP tools list */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-4">
              <span className="text-[11px] font-medium text-slate-450 block border-b pb-2">Exposed MCP Tools Palette</span>
              <div className="space-y-3">
                {mcpTools.map(tool => (
                  <div key={tool.name} className="p-3 border rounded-xl space-y-1.5 bg-muted/50">
                    <div className="flex justify-between items-center text-[10px] border-b pb-1">
                      <span className="font-mono font-semibold text-primary">{tool.name}()</span>
                      <span className="text-[11px] bg-muted border text-slate-450 font-medium px-1.5 py-0.2 rounded">MCP Tool</span>
                    </div>
                    <p className="text-[9.5px] text-muted-foreground font-medium leading-relaxed">{tool.desc}</p>
                    <div className="font-mono text-[8px] bg-muted text-slate-450 p-1 rounded font-semibold">
                      Args: {tool.args}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  )
}
