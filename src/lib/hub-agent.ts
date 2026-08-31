// Automation Hub AI Agent core.
// Defines the QA tools the agent can call (each call is logged to the MCP
// activity log), enforces the configured permission level, and runs the
// agent loop against the configured provider:
//   - Anthropic  → official @anthropic-ai/sdk manual tool loop
//   - OpenAI / Gemini / Ollama → OpenAI-compatible chat/completions loop
//   - no API key → deterministic offline mode (tools still run for real)

import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import { startScriptRun } from "@/lib/hub-runner"
import { buildTemplateCode, HubScriptType } from "@/lib/hub-templates"
import {
  AiPolicyData,
  AiProvider,
  PROVIDER_CATALOG,
  getAiPolicy,
  monthlySpend,
  estimateCost,
  openAiCompatBaseUrl,
  redactSensitive
} from "@/lib/hub-ai-providers"

// Token usage accumulated across a single agent run's provider calls.
interface UsageAcc {
  promptTokens: number
  completionTokens: number
}

// ---------- Settings ----------

export interface AgentSettingsData {
  provider: string
  apiKey: string
  model: string
  permission: string
}

export const DEFAULT_MODELS: Record<string, string[]> = {
  Kimi: ["kimi-k2-0711-preview", "moonshot-v1-32k", "moonshot-v1-8k"],
  Anthropic: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"],
  OpenAI: ["gpt-4o", "gpt-4o-mini"],
  Gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
  Ollama: ["llama3.1", "qwen2.5-coder"]
}

export async function getAgentSettings(): Promise<AgentSettingsData> {
  const row = await prisma.agentSettings.findUnique({ where: { id: "agent-settings" } })
  const base: AgentSettingsData = {
    provider: row?.provider || "Anthropic",
    apiKey: row?.apiKey || "",
    model: row?.model || "claude-opus-4-8",
    permission: row?.permission || "Execute Tests"
  }

  // Prefer the per-provider config (Section 11 provider management): whichever
  // provider is marked default AND enabled wins, carrying its own key + model.
  // Falls back to the legacy single-row AgentSettings above when none is set.
  const def = await prisma.aiProviderConfig.findFirst({ where: { isDefault: true, enabled: true } })
  if (def) {
    // Env key as a fallback: a deployment can supply the credential without
    // writing it into AiProviderConfig.apiKey, which is a plaintext column.
    const meta = PROVIDER_CATALOG[def.provider as AiProvider]
    const envKey = meta?.keyEnv ? process.env[meta.keyEnv] || "" : ""
    return {
      provider: def.provider,
      apiKey: def.apiKey || envKey,
      model: def.model || meta?.models[0] || base.model,
      permission: base.permission
    }
  }

  // Nothing configured in the hub — adopt whichever provider has a key in the
  // environment, so setting KIMI_API_KEY alone makes the agent work.
  for (const meta of Object.values(PROVIDER_CATALOG)) {
    if (meta.local || !meta.keyEnv) continue
    const envKey = process.env[meta.keyEnv]
    if (envKey) {
      return {
        provider: meta.provider,
        apiKey: envKey,
        model: meta.models[0],
        permission: base.permission
      }
    }
  }

  return base
}

// ---------- Action buttons embedded in AI messages ----------

export interface AgentAction {
  label: string
  kind: "open_studio" | "open_tab" | "open_url"
  payload: Record<string, string>
}

// ---------- Tool definitions ----------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tests",
    description:
      "List every test script in the Test Studio library with its type (Web/API/Database), tags, and last run status. Call this when the user asks what tests exist or before running tests by name.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "run_test",
    description:
      "Execute a test script by exact name through the real SHAFT/Maven pipeline. Waits up to ~75 seconds for completion; if still running, returns the executionId so results can be fetched later. Call once per test the user asks to run.",
    input_schema: {
      type: "object",
      properties: {
        test_name: { type: "string", description: "Exact script name, e.g. LoginFlowTest" },
        browser: {
          type: "string",
          enum: ["Chrome", "Firefox", "Edge", "Headless"],
          description: "Target browser; default Headless for speed"
        }
      },
      required: ["test_name"]
    }
  },
  {
    name: "get_test_results",
    description:
      "Get recent execution results (status, duration, browser). Optionally filtered to one test. Includes the tail of the failure log for failed runs.",
    input_schema: {
      type: "object",
      properties: {
        test_name: { type: "string", description: "Optional exact script name filter" },
        limit: { type: "integer", description: "Max results, default 5" }
      },
      required: []
    }
  },
  {
    name: "diagnose_failure",
    description:
      "Fetch the latest FAILED execution of a test and extract the error/exception lines from its Maven log so the failure cause can be analyzed. Call this when the user asks why a test failed.",
    input_schema: {
      type: "object",
      properties: {
        test_name: { type: "string", description: "Exact script name, e.g. LoginFlowTest" }
      },
      required: ["test_name"]
    }
  },
  {
    name: "check_flaky_tests",
    description:
      "Analyze execution history for flakiness: tests with mixed pass/fail results, their failure rate and stability score.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "heal_broken_locators",
    description:
      "List self-healing locator recovery events (old broken selector → recovered selector with confidence score) that are pending review in the Heal Center.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "save_test_script",
    description:
      "Save a new SHAFT Java test script into the Test Studio library. Use after generating test code for the user. The name must be a valid Java class name matching the public class in the code.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Java class name, e.g. CheckoutFlowTest" },
        type: { type: "string", enum: ["Web", "API", "Database"] },
        code: { type: "string", description: "Complete Java source for the test class" }
      },
      required: ["name", "type", "code"]
    }
  },
  {
    name: "coverage_report",
    description:
      "Summarize test coverage: script counts by type, how many have been executed, pass rate, never-run scripts, and evidence captured.",
    input_schema: { type: "object", properties: {}, required: [] }
  }
]

// ---------- Tool executor (logs every call to the MCP activity log) ----------

const WRITE_TOOLS = new Set(["run_test", "save_test_script"])

async function executeTool(
  name: string,
  input: any,
  settings: AgentSettingsData,
  actions: AgentAction[],
  policy?: AiPolicyData
): Promise<{ result: string; isError: boolean }> {
  const started = Date.now()
  let status = "success"
  let result = ""
  let isError = false

  try {
    if (settings.permission === "Read-Only" && WRITE_TOOLS.has(name)) {
      status = "denied"
      isError = true
      result = `Permission denied: the agent is configured as Read-Only. Ask the user to raise the permission level in Settings to execute "${name}".`
    } else {
      result = await runTool(name, input, actions)
    }
  } catch (err: any) {
    status = "error"
    isError = true
    result = `Tool error: ${err.message}`
  }

  // Privacy policy: when a provider is in the loop (policy present) the tool
  // result is about to be sent to that provider. Withhold or redact it per the
  // consent settings, and record what left the machine in the data-access log.
  if (policy && !isError) {
    const bytes = Buffer.byteLength(result, "utf8")
    if (!policy.allowDataAccess) {
      const summary = `${name} → withheld (${bytes} B)`
      result = `[test data access is disabled by policy — enable it in AI Agent → Usage & Privacy to let the assistant read this]`
      logDataAccess(settings.provider, summary, false, true)
    } else if (policy.redactSensitive) {
      const { redacted, changed } = redactSensitive(result)
      result = redacted
      logDataAccess(settings.provider, `${name} → ${bytes} B${changed ? " (redacted)" : ""}`, changed, false)
    } else {
      logDataAccess(settings.provider, `${name} → ${bytes} B`, false, false)
    }
  }

  try {
    await prisma.agentToolCall.create({
      data: {
        tool: name,
        params: input ?? {},
        status,
        result: result.slice(0, 2000),
        duration: Date.now() - started
      }
    })
  } catch {}

  return { result, isError }
}

// Fire-and-forget audit row for the Usage & Privacy data-access log.
function logDataAccess(provider: string, dataSummary: string, redacted: boolean, withheld: boolean) {
  prisma.aiDataAccessLog.create({ data: { provider, dataSummary, redacted, withheld } }).catch(() => {})
}

async function runTool(name: string, input: any, actions: AgentAction[]): Promise<string> {
  switch (name) {
    case "list_tests": {
      const scripts = await prisma.testScript.findMany({
        orderBy: { name: "asc" },
        include: { executions: { orderBy: { createdAt: "desc" }, take: 1 } }
      })
      return JSON.stringify(
        scripts.map((s) => ({
          name: s.name,
          type: s.type,
          tags: s.tags,
          lastRun: s.executions[0]
            ? { status: s.executions[0].status, at: s.executions[0].createdAt }
            : null
        }))
      )
    }

    case "run_test": {
      const testName = String(input?.test_name || "")
      const browser = String(input?.browser || "Headless")
      const script = await prisma.testScript.findFirst({
        where: { name: { equals: testName, mode: "insensitive" } }
      })
      if (!script) return `No script named "${testName}" exists. Use list_tests to see valid names.`

      const executionId = await startScriptRun(script, browser, false, undefined, script.accessibilityEnabled)

      // Wait up to ~75s for the run to finish
      let execution = null
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        execution = await prisma.testExecution.findUnique({ where: { id: executionId } })
        if (execution && execution.status !== "Running") break
      }

      actions.push({ label: `Open ${testName} in Studio`, kind: "open_studio", payload: { test: testName } })
      if (execution?.allureLink) {
        actions.push({ label: "View Allure Report", kind: "open_url", payload: { url: execution.allureLink } })
      }

      if (!execution || execution.status === "Running") {
        return JSON.stringify({
          test: testName,
          status: "still_running",
          executionId,
          note: "Run has not finished yet; results can be checked with get_test_results shortly."
        })
      }

      const logTail =
        execution.status === "Failed" ? execution.logOutput.split("\n").slice(-25).join("\n") : undefined
      return JSON.stringify({
        test: testName,
        status: execution.status,
        durationMs: execution.duration,
        browser: execution.browser,
        failureLogTail: logTail
      })
    }

    case "get_test_results": {
      const limit = Math.min(Number(input?.limit) || 5, 15)
      const where = input?.test_name ? { script: { name: String(input.test_name) } } : {}
      const executions = await prisma.testExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { script: { select: { name: true, type: true } } }
      })
      return JSON.stringify(
        executions.map((e) => ({
          test: e.script?.name,
          status: e.status,
          durationMs: e.duration,
          browser: e.browser,
          at: e.createdAt,
          failureLogTail: e.status === "Failed" ? e.logOutput.split("\n").slice(-15).join("\n") : undefined
        }))
      )
    }

    case "diagnose_failure": {
      const testName = String(input?.test_name || "")
      const execution = await prisma.testExecution.findFirst({
        where: { status: "Failed", script: { name: { equals: testName, mode: "insensitive" } } },
        orderBy: { createdAt: "desc" },
        include: { script: { select: { name: true, code: true } } }
      })
      if (!execution) {
        const anyRun = await prisma.testExecution.findFirst({
          where: { script: { name: { equals: testName, mode: "insensitive" } } },
          orderBy: { createdAt: "desc" }
        })
        return anyRun
          ? `The latest execution of "${testName}" did not fail (status: ${anyRun.status}) — there is nothing to diagnose.`
          : `No executions found for "${testName}" — run it first.`
      }

      const lines = execution.logOutput.split("\n")
      const errorLines = lines.filter((l) =>
        /ERROR|FAIL|Exception|AssertionError|Caused by|BUILD FAILURE|expected|Timed out/i.test(l)
      )
      actions.push({ label: `Open ${testName} in Studio`, kind: "open_studio", payload: { test: testName } })
      return JSON.stringify({
        test: testName,
        executedAt: execution.createdAt,
        browser: execution.browser,
        durationMs: execution.duration,
        errorLines: errorLines.slice(0, 40),
        scriptCode: execution.script?.code?.slice(0, 3000)
      })
    }

    case "check_flaky_tests": {
      const executions = await prisma.testExecution.findMany({
        where: { status: { in: ["Passed", "Failed"] } },
        orderBy: { createdAt: "asc" },
        include: { script: { select: { name: true } } }
      })
      const byTest = new Map<string, string[]>()
      executions.forEach((e) => {
        const key = e.script?.name || "unknown"
        byTest.set(key, [...(byTest.get(key) || []), e.status])
      })
      const report = Array.from(byTest.entries()).map(([test, runs]) => {
        const failures = runs.filter((r) => r === "Failed").length
        let alternations = 0
        for (let i = 1; i < runs.length; i++) if (runs[i] !== runs[i - 1]) alternations++
        const flakinessScore =
          runs.length > 1
            ? Math.round((failures / runs.length) * 50 + (alternations / (runs.length - 1)) * 50)
            : failures > 0
              ? 50
              : 0
        return { test, totalRuns: runs.length, failures, alternations, flakinessScore }
      })
      report.sort((a, b) => b.flakinessScore - a.flakinessScore)
      return JSON.stringify(report)
    }

    case "heal_broken_locators": {
      const events = await prisma.healingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 })
      if (events.length === 0) return "No self-healing locator events recorded. All locators currently match the DOM."
      actions.push({ label: "Open Heal Center", kind: "open_tab", payload: { tab: "Heal" } })
      return JSON.stringify(
        events.map((e) => ({
          test: e.testName,
          pageUrl: e.pageUrl,
          brokenLocator: e.originalLocator,
          recoveredLocator: e.recoveredLocator,
          confidence: e.confidence,
          status: e.status
        }))
      )
    }

    case "save_test_script": {
      const name = String(input?.name || "")
      const type = String(input?.type || "Web")
      let code = String(input?.code || "")
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        return `"${name}" is not a valid Java class name — no script was saved.`
      }
      const duplicate = await prisma.testScript.findFirst({ where: { name } })
      if (duplicate) return `A script named "${name}" already exists — pick a different class name.`
      if (!code.trim()) code = buildTemplateCode(type as HubScriptType, name)

      await prisma.testScript.create({
        data: { name, type, code, tags: [type, "AI-Generated"] }
      })
      actions.push({ label: `Open ${name} in Studio`, kind: "open_studio", payload: { test: name } })
      return `Saved "${name}" (${type}) to the Test Studio library, tagged AI-Generated.`
    }

    case "coverage_report": {
      const [scripts, executions, evidenceCount] = await Promise.all([
        prisma.testScript.findMany({ include: { executions: { select: { status: true } } } }),
        prisma.testExecution.count(),
        prisma.evidenceFile.count()
      ])
      const byType: Record<string, number> = {}
      scripts.forEach((s) => (byType[s.type] = (byType[s.type] || 0) + 1))
      const executed = scripts.filter((s) => s.executions.length > 0)
      const neverRun = scripts.filter((s) => s.executions.length === 0).map((s) => s.name)
      const passed = scripts.flatMap((s) => s.executions).filter((e) => e.status === "Passed").length
      const finished = scripts.flatMap((s) => s.executions).filter((e) => e.status !== "Running").length
      actions.push({ label: "Open Evidence Vault", kind: "open_tab", payload: { tab: "Evidence" } })
      return JSON.stringify({
        totalScripts: scripts.length,
        scriptsByType: byType,
        executedScripts: executed.length,
        neverRunScripts: neverRun,
        totalExecutions: executions,
        passRate: finished > 0 ? `${Math.round((passed / finished) * 100)}%` : "n/a",
        evidenceFiles: evidenceCount
      })
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ---------- System prompt (kept stable for prompt caching) ----------

const SYSTEM_PROMPT = `You are the QA automation assistant embedded in the SHAFT Automation Hub — a test automation platform where users write and run SHAFT Engine (Java/TestNG/Selenium) tests, record browser flows, and review evidence.

You have tools that operate on the REAL system: they run actual Maven/SHAFT test executions, read real execution logs, and write real scripts into the user's library. Use them rather than guessing — never invent test names, results, or log content.

Guidelines:
- Before running or diagnosing a test by name, verify the name with list_tests if you are not certain it exists.
- When diagnosing a failure, quote the decisive error line(s), explain the root cause in plain language, and suggest a concrete fix (e.g. a corrected locator or assertion).
- When generating test code, write a complete @playwright/test spec in TypeScript (import { test, expect } from "@playwright/test"; one test() per scenario; role- or label-based locators before CSS) and save it with save_test_script unless the user only asked to see the code.
- Keep responses concise and skimmable. Use markdown: short paragraphs, bullet lists, \`inline code\` for names/locators, and fenced \`\`\`ts blocks for code.
- If a tool reports a permission denial, tell the user which permission level is needed (Settings → Permission).

Respond in the same language the user writes in.`

// ---------- Provider loops ----------

export interface AgentReply {
  content: string
  actions: AgentAction[]
  toolsUsed: string[]
}

interface HistoryMessage {
  role: string
  content: string
}

const MAX_ITERATIONS = 6

async function runAnthropicAgent(
  history: HistoryMessage[],
  settings: AgentSettingsData,
  actions: AgentAction[],
  toolsUsed: string[],
  usage: UsageAcc,
  policy?: AiPolicyData
): Promise<string> {
  const client = new Anthropic({
    apiKey: settings.apiKey || undefined // falls back to ANTHROPIC_API_KEY env
  })

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }))

  // Every model call accumulates its real token usage for the cost dashboard.
  const call = async () => {
    const r = await client.messages.create({
      model: settings.model || "claude-opus-4-8",
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages
    })
    usage.promptTokens += r.usage?.input_tokens || 0
    usage.completionTokens += r.usage?.output_tokens || 0
    return r
  }

  let response = await call()

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content })
      response = await call()
      continue
    }

    if (response.stop_reason !== "tool_use") break

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )
    messages.push({ role: "assistant", content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      toolsUsed.push(block.name)
      const { result, isError } = await executeTool(block.name, block.input, settings, actions, policy)
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
        is_error: isError || undefined
      })
    }
    messages.push({ role: "user", content: toolResults })

    response = await call()
  }

  if (response.stop_reason === "refusal") {
    return "I can't help with that request."
  }

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
}

// OpenAI-compatible loop — used for OpenAI, Gemini (OpenAI-compat endpoint), and Ollama
// Base URLs come from the provider catalog so the agent and the generators
// can't drift apart on where a provider lives.

async function runOpenAICompatAgent(
  history: HistoryMessage[],
  settings: AgentSettingsData,
  actions: AgentAction[],
  toolsUsed: string[],
  usage: UsageAcc,
  policy?: AiPolicyData
): Promise<string> {
  const baseUrl = openAiCompatBaseUrl(settings.provider as AiProvider)
  const openaiTools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }))

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
  ]

  for (let i = 0; i <= MAX_ITERATIONS; i++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
      },
      body: JSON.stringify({ model: settings.model, messages, tools: openaiTools })
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${settings.provider} API error ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = await res.json()
    usage.promptTokens += data.usage?.prompt_tokens || 0
    usage.completionTokens += data.usage?.completion_tokens || 0
    const choice = data.choices?.[0]
    const msg = choice?.message
    if (!msg) throw new Error(`${settings.provider} returned no message`)

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return String(msg.content || "").trim()
    }

    messages.push(msg)
    for (const call of msg.tool_calls) {
      const name = call.function?.name
      let input: any = {}
      try {
        input = JSON.parse(call.function?.arguments || "{}")
      } catch {}
      toolsUsed.push(name)
      const { result } = await executeTool(name, input, settings, actions, policy)
      messages.push({ role: "tool", tool_call_id: call.id, content: result })
    }
  }

  return "I ran out of tool iterations — please try a more specific request."
}

// ---------- Offline fallback (no API key) ----------

async function runOfflineAgent(
  userMessage: string,
  settings: AgentSettingsData,
  actions: AgentAction[],
  toolsUsed: string[]
): Promise<string> {
  const q = userMessage.toLowerCase()
  const call = async (tool: string, input: any = {}) => {
    toolsUsed.push(tool)
    const { result } = await executeTool(tool, input, settings, actions)
    return result
  }
  const parse = (raw: string) => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  const offlineNote =
    "\n\n> ⚙️ Running in **offline mode** (no AI provider key configured). I execute real tools with keyword matching — add an API key in Settings for full conversational reasoning."

  // run all web tests / run test X
  const runMatch = q.match(/run\s+(?:the\s+)?(?:test\s+)?([a-z0-9_]*test)\b/i)
  if (q.includes("run all") || runMatch) {
    const scripts = parse(await call("list_tests")) || []
    let targets: string[] = []
    if (q.includes("run all")) {
      const typeFilter = q.includes("web") ? "Web" : q.includes("api") ? "API" : q.includes("database") || q.includes("db") ? "Database" : null
      targets = scripts.filter((s: any) => !typeFilter || s.type === typeFilter).map((s: any) => s.name)
    } else if (runMatch) {
      const wanted = runMatch[1].toLowerCase()
      const found = scripts.find((s: any) => s.name.toLowerCase() === wanted)
      if (!found) return `I couldn't find a test named \`${runMatch[1]}\`. Available tests:\n${scripts.map((s: any) => `- \`${s.name}\` (${s.type})`).join("\n")}${offlineNote}`
      targets = [found.name]
    }
    if (targets.length === 0) return `No matching tests found to run.${offlineNote}`

    const lines: string[] = [`Running **${targets.length}** test(s) on Headless Chrome:\n`]
    for (const t of targets.slice(0, 5)) {
      const raw = await call("run_test", { test_name: t, browser: "Headless" })
      const r = parse(raw)
      if (r?.status === "Passed") lines.push(`- ✅ \`${t}\` **Passed** in ${((r.durationMs || 0) / 1000).toFixed(1)}s`)
      else if (r?.status === "Failed") lines.push(`- ❌ \`${t}\` **Failed** in ${((r.durationMs || 0) / 1000).toFixed(1)}s — ask me *"why did ${t} fail?"*`)
      else if (r?.status === "still_running") lines.push(`- ⏳ \`${t}\` still running — check the Test Studio for live logs`)
      else lines.push(`- ${raw.includes("Permission denied") ? "🔒" : "⚠️"} \`${t}\`: ${raw.slice(0, 160)}`)
    }
    if (targets.length > 5) lines.push(`\n(Capped at 5 tests per request in offline mode — ${targets.length - 5} skipped.)`)
    return lines.join("\n") + offlineNote
  }

  // diagnose
  const whyMatch = userMessage.match(/(?:why|diagnos|debug).*?([a-z0-9_]*test)\b/i)
  if (whyMatch) {
    const raw = await call("diagnose_failure", { test_name: whyMatch[1] })
    const d = parse(raw)
    if (!d) return `${raw}${offlineNote}`
    const errors = (d.errorLines || []).slice(0, 8).join("\n")
    return `**Latest failure of \`${d.test}\`** (${d.browser}, ${((d.durationMs || 0) / 1000).toFixed(1)}s):\n\n\`\`\`\n${errors || "No explicit error lines captured."}\n\`\`\`\n\nReview the assertion/locator referenced above — in offline mode I can extract the error but not reason about the fix.${offlineNote}`
  }

  if (q.includes("flaky") || q.includes("flake")) {
    const report = parse(await call("check_flaky_tests")) || []
    const flaky = report.filter((r: any) => r.flakinessScore > 0)
    if (flaky.length === 0) return `No flaky tests detected — every test with history has consistent results. ✅${offlineNote}`
    return (
      `**Flakiness report** (score 0–100):\n\n` +
      flaky.map((r: any) => `- \`${r.test}\`: score **${r.flakinessScore}** — ${r.failures}/${r.totalRuns} failed, ${r.alternations} pass/fail flips`).join("\n") +
      offlineNote
    )
  }

  if (q.includes("heal") || q.includes("locator")) {
    const raw = await call("heal_broken_locators")
    const events = parse(raw)
    if (!events) return `${raw}${offlineNote}`
    return (
      `**Self-healing locator events:**\n\n` +
      events.slice(0, 8).map((e: any) => `- \`${e.brokenLocator}\` → \`${e.recoveredLocator}\` (${Math.round((e.confidence || 0) * 100)}% confidence, ${e.status})`).join("\n") +
      `\n\nReview and approve them in the Heal Center.${offlineNote}`
    )
  }

  if (q.includes("coverage") || q.includes("report") || q.includes("stats")) {
    const c = parse(await call("coverage_report"))
    if (!c) return `Could not compute coverage.${offlineNote}`
    return `**Coverage report:**\n\n- Scripts: **${c.totalScripts}** (${Object.entries(c.scriptsByType).map(([k, v]) => `${v} ${k}`).join(", ")})\n- Executed at least once: **${c.executedScripts}/${c.totalScripts}**\n- Total executions: **${c.totalExecutions}**, pass rate **${c.passRate}**\n- Evidence files captured: **${c.evidenceFiles}**\n- Never run: ${c.neverRunScripts.length > 0 ? c.neverRunScripts.map((n: string) => `\`${n}\``).join(", ") : "none 🎉"}${offlineNote}`
  }

  const genMatch = userMessage.match(/generate\s+(?:a\s+)?(?:(web|api|database|db)\s+)?test\s*(?:for|that|:)?\s*(.*)/i)
  if (genMatch) {
    const type = /api/i.test(genMatch[1] || "") ? "API" : /db|database/i.test(genMatch[1] || "") ? "Database" : "Web"
    const desc = (genMatch[2] || "generated flow").trim().slice(0, 60)
    const className = `Ai${desc.replace(/[^a-zA-Z0-9]+/g, " ").split(" ").filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Generated"}Test`
    const result = await call("save_test_script", { name: className, type, code: "" })
    return `${result}\n\nIn offline mode I scaffold from the ${type} template — open it in the Test Studio to fill in the specific steps for *"${desc}"*. With an AI provider key configured I would write the full test logic for you.${offlineNote}`
  }

  if (q.includes("list") || q.includes("what tests") || q.includes("which tests")) {
    const scripts = parse(await call("list_tests")) || []
    return (
      `**Test library** (${scripts.length} scripts):\n\n` +
      scripts.map((s: any) => `- \`${s.name}\` (${s.type}) — last run: ${s.lastRun ? s.lastRun.status : "never"}`).join("\n") +
      offlineNote
    )
  }

  return `I can help with these (offline mode — keyword commands):\n\n- **Run tests** — *"run all web tests"*, *"run LoginFlowTest"*\n- **Diagnose** — *"why did LoginFlowTest fail?"*\n- **Flakiness** — *"check flaky tests"*\n- **Healing** — *"heal broken locators"*\n- **Coverage** — *"coverage report"*\n- **Generate** — *"generate a web test for login flow"*\n- **List** — *"list tests"*${offlineNote}`
}

// ---------- Entry point ----------

export async function runAgent(history: HistoryMessage[], userMessage: string): Promise<AgentReply> {
  const settings = await getAgentSettings()
  const policy = await getAiPolicy()
  const actions: AgentAction[] = []
  const toolsUsed: string[] = []
  const usage: UsageAcc = { promptTokens: 0, completionTokens: 0 }

  const isLocal = settings.provider === "Ollama"
  const hasKey =
    settings.apiKey.length > 0 ||
    (settings.provider === "Anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
    isLocal // local, no key needed

  // Budget guard: paid providers are blocked once the month's estimated spend
  // reaches the configured cap. Local (Ollama) is free, so it is never capped.
  let budgetExceeded = false
  if (hasKey && !isLocal && policy.monthlyBudgetUsd > 0) {
    const spent = await monthlySpend()
    if (spent >= policy.monthlyBudgetUsd) budgetExceeded = true
  }

  let content: string
  try {
    if (budgetExceeded) {
      content =
        `💸 Monthly AI budget of **$${policy.monthlyBudgetUsd.toFixed(2)}** reached — paid provider calls are paused until next month or until you raise the limit in **Usage & Privacy**. Running this request in offline keyword mode instead.\n\n---\n\n` +
        (await runOfflineAgent(userMessage, settings, actions, toolsUsed))
    } else if (!hasKey) {
      content = await runOfflineAgent(userMessage, settings, actions, toolsUsed)
    } else if (settings.provider === "Anthropic") {
      content = await runAnthropicAgent([...history, { role: "user", content: userMessage }], settings, actions, toolsUsed, usage, policy)
    } else {
      content = await runOpenAICompatAgent([...history, { role: "user", content: userMessage }], settings, actions, toolsUsed, usage, policy)
    }
  } catch (err: any) {
    console.error("Agent loop error:", err)
    content = `⚠️ The ${settings.provider} provider call failed: ${err.message}\n\nCheck the API key and model in Settings — falling back to offline keyword mode for this message.\n\n---\n\n${await runOfflineAgent(userMessage, settings, actions, toolsUsed)}`
  }

  // Record real token usage + estimated cost for the dashboard.
  if (usage.promptTokens > 0 || usage.completionTokens > 0) {
    const total = usage.promptTokens + usage.completionTokens
    const costUsd = estimateCost(settings.model, usage.promptTokens, usage.completionTokens)
    prisma.aiUsageEvent
      .create({
        data: {
          provider: settings.provider,
          model: settings.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: total,
          costUsd
        }
      })
      .catch(() => {})
  }

  if (!content) content = "I didn't produce a response — please try rephrasing."
  return { content, actions, toolsUsed }
}
