"use client"

import { BusyDot, Skeleton, SkeletonLines } from "@/components/ui/skeleton"
import { useEffect, useState, useRef, Fragment } from "react"
import { Button } from "@/components/ui/button"
import {
  Bot,
  Send,
  Settings,
  Server,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Shield,
  Sparkles,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Lock,
  MessageSquare,
  Terminal,
  BarChart3
} from "@/components/ui/icons"
import { ProvidersPanel, CommandsPanel, UsagePrivacyPanel, SkillsPanel } from "@/components/automation-hub/ai-provider-management"

// ---------- Types ----------

interface AgentAction {
  label: string
  kind: "open_studio" | "open_tab" | "open_url"
  payload: Record<string, string>
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: AgentAction[] | null
  createdAt: string
}

interface McpCallItem {
  id: string
  tool: string
  params: any
  status: string
  result: string
  duration: number
  createdAt: string
}

interface AgentSettingsState {
  provider: string
  model: string
  permission: string
  apiKeyMasked: string
  hasKey: boolean
}

interface McpStatus {
  status: string
  transport: string
  toolCount: number
  providerReachable: boolean | null
}

interface AiAgentSectionProps {
  onNavigate?: (tab: string, testName?: string) => void
}

const WELCOME = `Hello! I'm your QA automation assistant. I can:
- Run tests and show results
- Diagnose why tests failed
- Generate new test code
- Fix broken locators
- Check test coverage

What would you like to do?`

// ---------- Lightweight markdown renderer (bold, inline code, code fences, lists, quotes) ----------

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${keyPrefix}-${i}`} className="font-mono text-xs bg-slate-900/5 border border-slate-900/10 rounded px-1 py-px">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  })
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```(\w*)\n?/)
  // split produces [text, lang, code, text, lang, code, ...]
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    if (i % 3 === 2) {
      nodes.push(
        <pre key={`code-${i}`} className="font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 rounded-xl p-3 overflow-x-auto my-2 whitespace-pre">
          {blocks[i].replace(/\n$/, "")}
        </pre>
      )
    } else if (i % 3 === 0) {
      const lines = blocks[i].split("\n")
      let list: string[] = []
      const flushList = (key: string) => {
        if (list.length === 0) return
        const items = [...list]
        list = []
        nodes.push(
          <ul key={key} className="list-disc pl-6 space-y-0.5 my-1">
            {items.map((item, j) => (
              <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
            ))}
          </ul>
        )
      }
      lines.forEach((line, j) => {
        const key = `l-${i}-${j}`
        if (/^\s*[-*]\s+/.test(line)) {
          list.push(line.replace(/^\s*[-*]\s+/, ""))
          return
        }
        flushList(`ul-${key}`)
        if (line.startsWith("> ")) {
          nodes.push(
            <p key={key} className="border-l-2 border-primary/25 pl-2 text-muted-foreground my-1">
              {renderInline(line.slice(2), key)}
            </p>
          )
        } else if (/^#{1,4}\s/.test(line)) {
          nodes.push(
            <p key={key} className="font-semibold text-foreground mt-2">
              {renderInline(line.replace(/^#{1,4}\s/, ""), key)}
            </p>
          )
        } else if (line.trim() === "---") {
          nodes.push(<hr key={key} className="my-2 border-border" />)
        } else if (line.trim()) {
          nodes.push(<p key={key}>{renderInline(line, key)}</p>)
        }
      })
      flushList(`ul-tail-${i}`)
    }
  }
  return <div className="space-y-1">{nodes}</div>
}

// ---------- Component ----------

export default function AiAgentSection({ onNavigate, projectId }: AiAgentSectionProps & { projectId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [mcpCalls, setMcpCalls] = useState<McpCallItem[]>([])

  const [settings, setSettings] = useState<AgentSettingsState>({
    provider: "Anthropic",
    model: "claude-opus-4-8",
    permission: "Execute Tests",
    apiKeyMasked: "",
    hasKey: false
  })
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [providers, setProviders] = useState<string[]>(["Anthropic", "OpenAI", "Gemini", "Ollama"])
  const [permissions, setPermissions] = useState<string[]>(["Read-Only", "Execute Tests", "Full Control"])
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({})
  const [mcp, setMcp] = useState<McpStatus | null>(null)

  const [inputVal, setInputVal] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  // Section 11 sub-tabs: chat vs. the provider/command/usage management panels.
  const [view, setView] = useState<"chat" | "commands" | "skills" | "providers" | "usage">("chat")

  // Custom Toast State
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Custom Confirm Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null)
  const [confirmTitle, setConfirmTitle] = useState("")
  const triggerConfirm = (title: string, callback: () => void) => {
    setConfirmTitle(title)
    setConfirmCallback(() => callback)
    setConfirmOpen(true)
  }

  // ↑/↓ input history recall
  const [historyIndex, setHistoryIndex] = useState(-1)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAgentData()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, sending])

  const loadAgentData = async () => {
    try {
      const [historyRes, logsRes, settingsRes] = await Promise.all([
        fetch("/api/hub/agent/history"),
        fetch("/api/hub/agent/mcp-log"),
        fetch("/api/hub/agent/settings")
      ])

      if (historyRes.ok) {
        const d = await historyRes.json()
        setMessages(d.messages || [])
      }
      if (logsRes.ok) {
        const d = await logsRes.json()
        setMcpCalls(d.calls || [])
      }
      if (settingsRes.ok) {
        const d = await settingsRes.json()
        if (d.settings) setSettings(d.settings)
        if (d.providers) setProviders(d.providers)
        if (d.permissions) setPermissions(d.permissions)
        if (d.models) setModelOptions(d.models)
        if (d.mcp) setMcp(d.mcp)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || sending) return
    setSending(true)
    setHistoryIndex(-1)

    const userMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    }
    setMessages((prev) => [...prev, userMsg])
    setInputVal("")

    try {
      const res = await fetch("/api/hub/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, projectId })
      })

      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [...prev, data.message])
        // refresh the MCP audit log with the tools this turn used
        fetch("/api/hub/agent/mcp-log")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setMcpCalls(d.calls || []))
          .catch(() => {})
      } else {
        showToast(data.error || "Agent request failed", "error")
      }
    } catch (err) {
      console.error(err)
      showToast("Network error talking to the agent", "error")
    } finally {
      setSending(false)
    }
  }

  const handleClearHistory = () => {
    triggerConfirm("Clear the conversation history permanently? The MCP audit log is kept.", async () => {
      try {
        const res = await fetch("/api/hub/agent/history", { method: "DELETE" })
        if (res.ok) {
          setMessages([])
          showToast("Chat history cleared")
        }
      } catch (err) {
        console.error(err)
      }
    })
  }

  const handleSaveSettings = async () => {
    try {
      const res = await fetch("/api/hub/agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model,
          permission: settings.permission,
          ...(apiKeyInput ? { apiKey: apiKeyInput } : {})
        })
      })
      if (res.ok) {
        showToast("Agent settings updated!")
        setShowSettings(false)
        setApiKeyInput("")
        loadAgentData()
      } else {
        const d = await res.json()
        showToast(d.error || "Failed to save settings", "error")
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const userMsgs = messages.filter((m) => m.role === "user")
    if (e.key === "Enter") {
      handleSendMessage(inputVal)
    } else if (e.key === "ArrowUp") {
      if (userMsgs.length > 0) {
        e.preventDefault()
        const nextIdx = historyIndex === -1 ? userMsgs.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(nextIdx)
        setInputVal(userMsgs[nextIdx].content)
      }
    } else if (e.key === "ArrowDown" && historyIndex !== -1) {
      e.preventDefault()
      const nextIdx = historyIndex + 1
      if (nextIdx >= userMsgs.length) {
        setHistoryIndex(-1)
        setInputVal("")
      } else {
        setHistoryIndex(nextIdx)
        setInputVal(userMsgs[nextIdx].content)
      }
    }
  }

  const handleAction = (action: AgentAction) => {
    if (action.kind === "open_url" && action.payload.url) {
      window.open(action.payload.url, "_blank")
    } else if (action.kind === "open_studio") {
      onNavigate?.("Studio", action.payload.test)
    } else if (action.kind === "open_tab" && action.payload.tab) {
      onNavigate?.(action.payload.tab)
    }
  }

  const quickActions = [
    { label: "▶ Run All Web Tests", text: "Run all web tests" },
    { label: "Check flaky tests", text: "Check flaky tests" },
    { label: "Heal broken locators", text: "Heal broken locators" },
    {
      label: "Generate Test for...",
      fill: "Generate a web test for "
    },
    { label: "Coverage report", text: "Show me the coverage report" }
  ]

  if (loading) {
    return (
<div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm" role="status" aria-label="Loading QA Assistant Console">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <SkeletonLines lines={3} />
        </div>
    )
  }

  const SUB_TABS: { id: typeof view; label: string; icon: any }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "commands", label: "Commands", icon: Terminal },
    { id: "skills", label: "Skills", icon: Sparkles },
    { id: "providers", label: "Providers", icon: Bot },
    { id: "usage", label: "Usage & privacy", icon: BarChart3 }
  ]

  return (
    <div className="space-y-4">
      {/* SECTION 11 SUB-TABS */}
      <div className="flex items-center gap-2 overflow-x-auto bg-muted p-1 border rounded-xl select-none scrollbar-none">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight shrink-0 transition-all ${
              view === t.id ? "bg-card text-primary shadow-sm border border-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-white/50"
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {view === "commands" && <CommandsPanel sending={sending} onRun={(text) => { setView("chat"); handleSendMessage(text) }} />}
      {view === "skills" && <SkillsPanel />}
      {view === "providers" && <ProvidersPanel onDefaultChanged={loadAgentData} />}
      {view === "usage" && <UsagePrivacyPanel />}

      {view === "chat" && (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px] relative">
      {/* CHAT BOARD */}
      <div className={`space-y-6 transition-all duration-300 ${showSidebar ? "lg:col-span-8" : "lg:col-span-12"}`}>
        <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3 flex flex-col justify-between h-[580px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-primary" />
              <span className="text-xs font-medium text-muted-foreground">AI Agent — QA Assistant</span>
              <span
                className={`text-xs  font-semibold px-2 py-0.5 rounded-full border ${
                  settings.hasKey ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                }`}
              >
                {settings.hasKey ? `${settings.provider} · ${settings.model}` : "Offline mode"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="h-7 px-3 rounded-lg border border-border text-muted-foreground bg-card font-semibold flex items-center gap-1 text-xs hover:bg-muted/50"
              >
                <Settings size={12} /> Settings
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-muted-foreground flex items-center justify-center"
                title="Toggle MCP activity panel"
              >
                {showSidebar ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-3 space-y-4 bg-muted/50 rounded-xl border text-xs font-medium leading-relaxed text-foreground"
          >
            {messages.length === 0 && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0 select-none bg-primary">🤖</div>
                <div className="p-3 rounded-xl rounded-tl-none text-left bg-primary/10 border border-primary/25 text-indigo-950 shadow-sm">
                  <Markdown text={WELCOME} />
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-start gap-3 max-w-[88%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0 select-none ${
                    msg.role === "user" ? "bg-slate-800" : "bg-indigo-600"
                  }`}
                >
                  {msg.role === "user" ? "👤" : "🤖"}
                </div>
                <div className="space-y-1 min-w-0">
                  <div
                    className={`p-3 rounded-2xl text-left overflow-hidden ${
                      msg.role === "user"
                        ? "bg-muted text-foreground rounded-tr-none"
                        : "bg-primary/10 border border-primary/25 text-indigo-950 rounded-tl-none shadow-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? <Markdown text={msg.content} /> : <p className="whitespace-pre-wrap">{msg.content}</p>}

                    {/* Server-provided action buttons */}
                    {msg.role === "assistant" && Array.isArray(msg.actions) && msg.actions.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-2 mt-2 border-t border-primary/25">
                        {msg.actions.map((a, i) => (
                          <button
                            key={i}
                            onClick={() => handleAction(a)}
                            className="h-6.5 min-h-7 px-3 rounded-lg bg-card border border-primary/25 text-primary hover:bg-primary hover:text-white text-xs font-semibold transition-colors"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono block">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0 bg-primary">🤖</div>
                <div className="p-3 rounded-xl rounded-tl-none bg-primary/10 border border-primary/25 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-xs text-indigo-400 font-semibold ml-2">running tools & thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap select-none">
            {quickActions.map((act) => (
              <button
                key={act.label}
                disabled={sending}
                onClick={() => {
                  if ("fill" in act && act.fill) {
                    setInputVal(act.fill)
                    inputRef.current?.focus()
                  } else if (act.text) {
                    handleSendMessage(act.text)
                  }
                }}
                className="px-3 py-1 text-xs font-semibold bg-muted hover:bg-muted text-foreground border rounded-lg transition-colors disabled:opacity-50"
              >
                {act.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <input
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDownInput}
              placeholder="Ask why a test failed, run suites, or generate new tests... (↑ recalls previous messages)"
              className="flex-1 h-10 rounded-xl border px-3 text-xs bg-muted/50 font-semibold"
            />
            <Button
              onClick={() => handleSendMessage(inputVal)}
              disabled={sending || !inputVal.trim()}
              className="bg-primary hover:bg-primary/90 text-white h-10 px-4 rounded-xl font-semibold text-xs shadow-sm"
            >
              {sending ? <BusyDot /> : <Send size={13} />}
            </Button>
          </div>
        </div>
      </div>

      {/* MCP ACTIVITY SIDEBAR */}
      {showSidebar && (
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3 flex flex-col justify-between h-[580px]">
            <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b pb-2 select-none">
                <span className="text-xs font-medium text-muted-foreground">MCP Tool Call Audit</span>
                <button
                  onClick={() =>
                    fetch("/api/hub/agent/mcp-log")
                      .then((r) => (r.ok ? r.json() : null))
                      .then((d) => d && setMcpCalls(d.calls || []))
                  }
                  className="p-1 rounded-lg text-muted-foreground hover:text-muted-foreground"
                  title="Refresh log"
                >
                  <RefreshCw size={12} />
                </button>
              </div>

              <div className="space-y-2 overflow-y-auto flex-1 pr-1 text-left">
                {mcpCalls.map((call) => (
                  <div key={call.id} className="p-3 border rounded-xl bg-muted/50 space-y-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-primary font-mono font-semibold text-xs truncate">{call.tool}()</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-amber-600 font-semibold">{call.duration}ms</span>
                        <span
                          className={`text-xs border px-2 py-px rounded-full  font-semibold flex items-center gap-0.5 ${
                            call.status === "success"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                              : call.status === "denied"
                                ? "bg-amber-50 border-amber-100 text-amber-700"
                                : "bg-rose-50 border-rose-100 text-rose-700"
                          }`}
                        >
                          {call.status === "success" ? <CheckCircle2 size={8} /> : call.status === "denied" ? <Lock size={8} /> : <XCircle size={8} />}
                          {call.status}
                        </span>
                      </span>
                    </div>
                    {call.params && Object.keys(call.params).length > 0 && (
                      <code className="font-mono text-xs text-muted-foreground block truncate">{JSON.stringify(call.params)}</code>
                    )}
                    <div className="text-xs text-muted-foreground font-mono">
                      {new Date(call.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  </div>
                ))}
                {mcpCalls.length === 0 && (
                  <p className="text-muted-foreground text-center py-12 text-xs">
                    No tool calls yet. Every action the AI takes is audited here: timestamp, tool, parameters, status.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t">
              <button
                onClick={handleClearHistory}
                className="w-full text-muted-foreground hover:text-rose-600 rounded-lg text-xs font-semibold h-8 flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={11} /> Clear conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4 text-foreground">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Sparkles size={15} className="text-primary" /> AI Agent Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-muted-foreground font-semibold">
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground block ">AI Provider</label>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const provider = e.target.value
                    const models = modelOptions[provider] || []
                    setSettings({ ...settings, provider, model: models[0] || settings.model })
                  }}
                  className="flex h-9 w-full rounded-xl border px-3 text-xs bg-muted/50"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p === "Ollama" ? "Ollama (local)" : p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground block ">Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  className="flex h-9 w-full rounded-xl border px-3 text-xs bg-muted/50"
                >
                  {(modelOptions[settings.provider] || [settings.model]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground block ">
                  API Key {settings.provider === "Ollama" && <span className="text-slate-300 normal-case">(not needed for local Ollama)</span>}
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={settings.apiKeyMasked || "Paste your provider API key..."}
                  className="flex h-9 w-full rounded-xl border px-3 text-xs bg-muted/50 font-mono"
                />
                <p className="text-xs text-muted-foreground font-medium">Stored server-side and never returned to the browser. Leave blank to keep the current key.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground block ">Permission level</label>
                <select
                  value={settings.permission}
                  onChange={(e) => setSettings({ ...settings, permission: e.target.value })}
                  className="flex h-9 w-full rounded-xl border px-3 text-xs bg-muted/50"
                >
                  {permissions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground font-medium">Read-Only blocks running tests and saving scripts — the agent can still inspect results.</p>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 bg-muted/50 border rounded-xl px-3 py-3">
                <span className="font-semibold text-muted-foreground flex items-center gap-2">
                  <Server size={11} /> MCP Server
                </span>
                <span className="text-emerald-600 font-medium flex items-center gap-1 text-xs">
                  {mcp ? `${mcp.transport} · ${mcp.toolCount} tools` : "embedded"}
                  {settings.provider === "Ollama" && mcp?.providerReachable === false && (
                    <span className="text-rose-500 ml-1">· Ollama unreachable</span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowSettings(false)} className="flex-1 rounded-xl bg-card border-border text-muted-foreground">
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} className="bg-primary text-white hover:bg-primary/90 flex-1 rounded-xl font-semibold">
                Save settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-lg text-xs font-semibold  ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : toast.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-primary/10 border-primary/25 text-primary"
          }`}
        >
          <span>{toast.text}</span>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4 text-foreground">
            <div className="flex items-center gap-2 text-rose-600">
              <Shield size={18} />
              <h3 className="text-sm font-semibold  ">Confirm action</h3>
            </div>
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed">{confirmTitle}</p>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-xl bg-card border-border text-muted-foreground">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  confirmCallback?.()
                  setConfirmOpen(false)
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white flex-1 rounded-xl font-semibold"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </div>
  )
}
