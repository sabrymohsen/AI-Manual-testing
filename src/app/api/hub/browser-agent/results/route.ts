import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { WORKSPACE_ROOT } from "@/lib/hub-workspace"
import { summarize, type HubStepResult, type HubTestResult } from "@/lib/hub-report"

export const dynamic = "force-dynamic"

/** Where test cases the Browser Agent ran are listed in the hub. */
const AGENT_FOLDER = "Browser agent"
const MAX_BODY = 40_000_000
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

function savePng(dataUrl: unknown, file: string): string | undefined {
  const m = typeof dataUrl === "string" ? dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/) : null
  if (!m) return undefined
  const buf = Buffer.from(m[1], "base64")
  if (buf.length > 5_000_000 || buf.subarray(1, 4).toString() !== "PNG") return undefined
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  return file
}

/**
 * POST /api/hub/browser-agent/results
 * { projectId, testCaseId?, title, runsOn: "server"|"computer", batchId?, startUrl, durationMs, log,
 *   steps: [{ action, expected, status: passed|failed|skipped, actual, durationMs, screenshot?: dataURL }] }
 * One test case the Browser Agent ran, saved as a run in the Automation Hub
 * (Runs tab: every step with what the page showed and its screenshot).
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "These results are too big to save" }, { status: 413 })
  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  const projectId: string = body.projectId
  const user = auth.session.user

  const title = str(body.title, 200).replace(/\s+/g, " ").trim() || "Browser agent test"
  const rawSteps: any[] = Array.isArray(body.steps) ? body.steps.slice(0, 200) : []
  if (!rawSteps.length) return NextResponse.json({ error: "No steps to save" }, { status: 400 })

  let testCaseId: string | null = null
  if (typeof body.testCaseId === "string" && body.testCaseId) {
    const tc = await prisma.testCase.findFirst({ where: { id: body.testCaseId, projectId }, select: { id: true } })
    testCaseId = tc?.id ?? null
  }

  let script = await prisma.testScript.findFirst({ where: { projectId, mode: "agent", name: title } })
  if (!script) {
    script = await prisma.testScript.create({
      data: {
        name: title,
        type: "Web",
        mode: "agent",
        folder: AGENT_FOLDER,
        projectId,
        tags: ["browser-agent"],
        steps: rawSteps.map((s) => ({ text: str(s?.action, 1000) || "Step", ...(s?.expected ? { expected: str(s.expected, 1000) } : {}) })) as any,
        code: `// "${title}" is a manual test case run by the Browser Agent (AI + playwright-cli).\n// Run it again from Automation Hub → Browser Agent.\n`,
      },
    })
  }
  if (testCaseId) {
    await prisma.hubScriptTestCase.upsert({
      where: { scriptId_testCaseId: { scriptId: script.id, testCaseId } },
      create: { scriptId: script.id, testCaseId },
      update: {},
    }).catch(() => {})
  }

  const execution = await prisma.testExecution.create({
    data: {
      scriptId: script.id,
      status: "Running",
      logOutput: "",
      projectId,
      browser: "Chromium",
      executionTarget: body.runsOn === "computer" ? `${user.name || user.email}'s computer` : "Server",
      triggerSource: "agent",
      triggeredById: user.id,
      triggeredByName: user.name || user.email,
      batchId: typeof body.batchId === "string" ? body.batchId.slice(0, 64) : null,
    },
  })

  const dir = path.join(WORKSPACE_ROOT, "browser-agent", execution.id)
  const steps: HubStepResult[] = rawSteps.map((s, i) => {
    const status = s?.status === "passed" ? "passed" : s?.status === "skipped" ? "skipped" : "failed"
    const actual = str(s?.actual, 2000) || undefined
    return {
      title: str(s?.action, 1000) || `Step ${i + 1}`,
      status,
      durationMs: Number(s?.durationMs) || 0,
      ...(s?.expected ? { expected: str(s.expected, 2000) } : {}),
      ...(actual ? { actual } : {}),
      ...(status === "failed" ? { error: actual || "Not as expected" } : {}),
      screenshot: savePng(s?.screenshot, path.join(dir, `step-${i + 1}.png`)),
    }
  })
  const failedAt = steps.findIndex((s) => s.status === "failed")
  const last = [...steps].reverse().find((s) => s.screenshot)
  const result: HubTestResult = {
    title,
    file: str(body.startUrl, 500),
    status: failedAt === -1 ? "passed" : "failed",
    durationMs: Number(body.durationMs) || steps.reduce((n, s) => n + s.durationMs, 0),
    retries: 0,
    steps,
    ...(failedAt !== -1 ? { error: { message: `Step ${failedAt + 1}: ${steps[failedAt].actual || "not as expected"}` } } : {}),
    screenshot: (failedAt !== -1 ? steps[failedAt].screenshot : undefined) || last?.screenshot,
  }
  const updated = await prisma.testExecution.update({
    where: { id: execution.id },
    data: {
      status: result.status === "passed" ? "Passed" : "Failed",
      results: [result] as any,
      duration: result.durationMs,
      screenshotPath: result.screenshot ?? null,
      logOutput: str(body.log, 200_000),
    },
  })
  return NextResponse.json({ executionId: updated.id, scriptId: script.id, summary: summarize([result]) }, { status: 201 })
}
