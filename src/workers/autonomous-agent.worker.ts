import { Worker } from "bullmq"
import { redisConnection, registerWorkerHeartbeat, publishAgentRunEvent, addTestRunJob, isAutonomousAgentCancelSignalSet, clearAutonomousAgentCancelSignal } from "@/lib/queue"
import { prisma } from "@/lib/db"
import { withBugModule } from "@/lib/bug-reports/module"
import { chromium } from "playwright"
import { decryptSecret } from "@/lib/crypto"
import { chatWithConfiguredProvider, resolveProvider } from "@/lib/ai/provider-chat"
import { handleLogin } from "@/lib/playwright/login-handler"
import { nextBugKey } from "@/lib/bug-reports/keys"

console.log("[AGENT WORKER STARTUP] Starting Autonomous QA Agent worker process...")

const workerId = process.env.HOSTNAME || `agent-worker-${Math.random().toString(36).substring(2, 11)}`
let currentJobId: string | null = null
let workerStatus: "idle" | "busy" | "error" = "idle"

async function runAutonomousQA(agentRunId: string) {
  console.log(`[Autonomous Agent] Starting run for id: ${agentRunId}`)
  if (await isAutonomousAgentCancelSignalSet(agentRunId)) {
    console.log(`[Autonomous Agent] Cancellation signal detected before run start: ${agentRunId}`)
    await clearAutonomousAgentCancelSignal(agentRunId)
    return
  }
  await publishAgentRunEvent(agentRunId, "status_changed", { status: "Analyzing" })
  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: { status: "Analyzing", startedAt: new Date() }
  })

  const agentRun = await prisma.autonomousAgentRun.findUnique({
    where: { id: agentRunId },
    include: {
      project: {
        include: {
          credentials: true
        }
      }
    }
  })

  if (!agentRun) {
    throw new Error(`Autonomous run ${agentRunId} not found`)
  }

  const { project } = agentRun
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  let discoveredRoutes: string[] = []
  let discoveredElements: any[] = []

  try {
    console.log(`[Autonomous Agent] Navigating to target webapp: ${project.webAppUrl}`)
    await page.goto(project.webAppUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    
    // Login if credentials exist
    if (project.credentials.length > 0) {
      const defaultCred = project.credentials[0]
      const password = decryptSecret({
        encrypted: defaultCred.encryptedPassword,
        iv: defaultCred.encryptionIv,
        authTag: defaultCred.encryptionAuthTag,
        keyVersion: defaultCred.keyVersion,
      })
      console.log(`[Autonomous Agent] Found login credential. Attempting login for: ${defaultCred.username}`)
      const loginUrl = defaultCred.loginUrl || project.webAppUrl
      await handleLogin(page, { url: loginUrl, username: defaultCred.username, password }).catch(e => {
        console.warn("[Autonomous Agent] Auto-login failed:", e.message)
      })
    }

    // Discover internal paths on the same host
    const links = await page.evaluate((baseUrl) => {
      const origin = new URL(baseUrl).origin
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href => href && href.startsWith(origin))
    }, project.webAppUrl)

    discoveredRoutes = [...new Set(links)].slice(0, 8)
    
    // Scan DOM for interactive elements on primary page
    discoveredElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']"))
        .slice(0, 30)
        .map(el => {
          const tagName = el.tagName.toLowerCase()
          const text = el.textContent?.trim() || ""
          const placeholder = el.getAttribute("placeholder") || ""
          const label = el.getAttribute("aria-label") || ""
          const name = el.getAttribute("name") || el.id || ""
          const testid = el.getAttribute("data-testid") || ""
          return { tagName, text: text.substring(0, 30), placeholder: placeholder.substring(0, 30), label: label.substring(0, 30), name, testid }
        })
    })

    console.log(`[Autonomous Agent] Discovered ${discoveredRoutes.length} pages and ${discoveredElements.length} interactive elements.`)

  } catch (err: any) {
    console.error(`[Autonomous Agent] Discovery error:`, err.message)
  } finally {
    await context.close()
    await browser.close()
  }

  // Save coverage report
  const coverageReport = {
    scannedRoutes: discoveredRoutes,
    discoveredElements: discoveredElements,
    timestamp: new Date().toISOString()
  }
  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: { coverageReport }
  })

  // 3. Set Status: Generating
  if (await isAutonomousAgentCancelSignalSet(agentRunId)) {
    console.log(`[Autonomous Agent] Cancellation signal detected before Generating: ${agentRunId}`)
    await clearAutonomousAgentCancelSignal(agentRunId)
    return
  }
  await publishAgentRunEvent(agentRunId, "status_changed", { status: "Generating", coverageReport })
  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: { status: "Generating" }
  })

  // Call LLM to generate test cases
  const generatedTests = await callLlmToGenerateTests(project.id, project.name, project.webAppUrl, discoveredRoutes, discoveredElements, agentRun.mode)
  console.log(`[Autonomous Agent] LLM generated ${generatedTests.length} test cases.`)

  // Save generated test cases in DB
  const testRunIds: string[] = []
  for (const tc of generatedTests) {
    let credentialId: string | null = null
    if (project.credentials.length > 0) {
      credentialId = project.credentials[0].id
    }

    const testCase = await prisma.testCase.create({
      data: {
        title: `[Agent] ${tc.title}`,
        preconditions: tc.preconditions || "Autonomously generated test case.",
        priority: "Medium",
        source: "AIGenerated",
        projectId: project.id,
        requiredCredentialId: credentialId,
        steps: {
          createMany: {
            data: tc.steps.map((s: any, idx: number) => ({
              stepNumber: idx + 1,
              actionDescription: s.actionDescription,
              expectedResult: s.expectedResult || "Step completes successfully",
              actionType: s.actionType || "click",
              targetType: s.targetType || "css",
              targetValue: s.targetValue || "",
              inputValue: s.inputValue || ""
            }))
          }
        }
      }
    })

    let viewportWidth = 1280
    let viewportHeight = 800
    switch (project.viewport) {
      case "Tablet": viewportWidth = 768; viewportHeight = 1024; break
      case "Mobile": viewportWidth = 375; viewportHeight = 667; break
    }

    const testRun = await prisma.testRun.create({
      data: {
        projectId: project.id,
        testCaseId: testCase.id,
        credentialId,
        status: "Queued",
        browserType: project.browserType,
        viewport: project.viewport,
        viewportWidth,
        viewportHeight,
        triggeredBy: "AIGenerated",
        executionMode: "SelfHealing",
        autonomousAgentRunId: agentRunId
      }
    })

    await addTestRunJob(testRun.id)
    testRunIds.push(testRun.id)
  }

  // 4. Set Status: Executing
  if (await isAutonomousAgentCancelSignalSet(agentRunId)) {
    console.log(`[Autonomous Agent] Cancellation signal detected before Executing: ${agentRunId}`)
    await clearAutonomousAgentCancelSignal(agentRunId)
    return
  }
  await publishAgentRunEvent(agentRunId, "status_changed", { status: "Executing", testRunsCount: testRunIds.length })
  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: { status: "Executing" }
  })

  // Poll database for completion of all runs
  console.log(`[Autonomous Agent] Awaiting completion of ${testRunIds.length} test runs...`)
  let allRunsFinished = false
  const runTimeoutMs = 120000
  const startTime = Date.now()

  while (!allRunsFinished && (Date.now() - startTime) < runTimeoutMs) {
    await new Promise(r => setTimeout(r, 3000))
    const runs = await prisma.testRun.findMany({
      where: { id: { in: testRunIds } }
    })
    allRunsFinished = runs.every(r => 
      r.status === "Passed" || 
      r.status === "Failed" || 
      r.status === "Blocked" || 
      r.status === "Cancelled"
    )
    
    const passCount = runs.filter(r => r.status === "Passed").length
    const failCount = runs.filter(r => r.status === "Failed").length
    const runningCount = runs.filter(r => r.status === "Running").length
    await publishAgentRunEvent(agentRunId, "execution_progress", { passCount, failCount, runningCount, total: testRunIds.length })
  }

  const finalRuns = await prisma.testRun.findMany({
    where: { id: { in: testRunIds } },
    include: {
      stepResults: true
    }
  })

  let totalPass = 0
  let totalFail = 0
  let totalHealed = 0

  for (const run of finalRuns) {
    if (run.status === "Passed") totalPass++
    else totalFail++

    const healedSteps = run.stepResults.filter(sr => sr.status === "SelfHealed")
    totalHealed += healedSteps.length

    const failedStep = run.stepResults.find(sr => sr.status === "Failed")
    if (failedStep) {
      console.log(`[Autonomous Agent] Test run ${run.id} failed at step ${failedStep.stepNumber}. Creating bug report...`)
      await prisma.bugReport.create({
        data: await withBugModule({
          title: `[Agent Auto-Bug] Failed executing step ${failedStep.stepNumber}: ${failedStep.actionDescription}`,
          severity: "High",
          priority: "High",
          status: "Open",
          projectId: project.id,
          bugKey: await nextBugKey(project.id),
          testCaseId: run.testCaseId,
          testRunId: run.id,
          testStepResultId: failedStep.id,
          stepsToReproduce: `1. Start test execution of test case\n2. Reached step ${failedStep.stepNumber}: "${failedStep.actionDescription}"\n3. Observed error: ${failedStep.errorDetails || "unknown execution failure"}`,
          expectedResult: failedStep.expectedResult,
          actualResult: failedStep.actualResult || "Execution timed out or element was missing.",
          screenshotPath: failedStep.screenshotAfter || failedStep.screenshotBefore,
          autonomousAgentRunId: agentRunId
        })
      })
    }
  }

  // 5. Set Status: Reporting
  await publishAgentRunEvent(agentRunId, "status_changed", { status: "Reporting" })
  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: { status: "Reporting" }
  })

  const metrics = {
    passCount: totalPass,
    failCount: totalFail,
    selfHealedCount: totalHealed,
    bugCount: totalFail,
    totalDurationMs: Date.now() - startTime
  }

  const aiSummary = await callLlmToSummarizeRun(project.id, project.name, metrics, finalRuns)

  await prisma.autonomousAgentRun.update({
    where: { id: agentRunId },
    data: {
      status: "Completed",
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      summary: aiSummary,
      metrics
    }
  })

  await publishAgentRunEvent(agentRunId, "completed", { status: "Completed", metrics, summary: aiSummary })
  console.log(`[Autonomous Agent] Run ${agentRunId} completed successfully!`)
}

async function callLlmToGenerateTests(
  projectId: string,
  projectName: string,
  webAppUrl: string,
  routes: string[],
  elements: any[],
  mode: string
): Promise<any[]> {
  // The project's own AI key first, then workspace, then env — this used to
  // read OPENAI_COMPATIBLE_API_KEY alone, so a key saved on the project never
  // reached the autonomous agent.
  if (!(await resolveProvider(projectId))) {
    console.warn("[Autonomous Agent] No AI provider configured for this project. Creating dummy test cases.")
    return getDummyTestCases(webAppUrl, routes)
  }

  const systemPrompt = `You are a Fully Autonomous QA Engineer Agent. Generate structured Playwright E2E test cases based on the discovered route mapping and page structure of a web application.
The test case must include: title, preconditions, and steps (each with actionDescription, expectedResult, actionType, targetType, targetValue, inputValue).
Available action types: open_url, click, fill, select, upload_file, wait_for_text, wait_for_url, assert_visible, assert_hidden, assert_text, assert_url, screenshot
Available target types: test_id, role, text, label, placeholder, css, xpath, url, none
Return ONLY valid JSON matching this structure:
[
  {
    "title": "string",
    "preconditions": "string",
    "steps": [
      {
        "actionDescription": "string",
        "expectedResult": "string",
        "actionType": "string",
        "targetType": "string",
        "targetValue": "string",
        "inputValue": "string"
      }
    ]
  }
]`

  const count = mode === "Fast" ? 2 : mode === "Balanced" ? 4 : 6
  const userMessage = `Project: ${projectName}
URL: ${webAppUrl}
Discovered Routes: ${JSON.stringify(routes)}
Interactive DOM Elements: ${JSON.stringify(elements)}
Please generate ${count} essential E2E test cases (smoke and functional scenarios) for this project.`

  try {
    const content = await chatWithConfiguredProvider({
      projectId,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.3,
      json: true,
      command: "autonomous-generate-tests",
    })
    if (!content) throw new Error("Empty response from LLM")

    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) return parsed
    if (parsed.testCases && Array.isArray(parsed.testCases)) return parsed.testCases
    if (parsed.tests && Array.isArray(parsed.tests)) return parsed.tests
    return [parsed]
  } catch (err: any) {
    console.error("[Autonomous Agent] Failed to generate tests with LLM, falling back to templates:", err.message)
    return getDummyTestCases(webAppUrl, routes)
  }
}

async function callLlmToSummarizeRun(
  projectId: string,
  projectName: string,
  metrics: any,
  runs: any[]
): Promise<string> {
  if (!(await resolveProvider(projectId))) {
    return "Test run completed. AI summary is unavailable because no AI provider is configured for this project."
  }

  const userMessage = `Project: ${projectName}
Metrics: ${JSON.stringify(metrics)}
Run details: ${JSON.stringify(runs.map(r => ({ id: r.id, status: r.status, durationMs: r.durationMs })))}
Please provide a brief, professional summary explaining the results, failure patterns, or healed elements.`

  try {
    return (
      (await chatWithConfiguredProvider({
        projectId,
        system: "You are a QA Lead. Write a concise run summary based on execution metrics.",
        prompt: userMessage,
        temperature: 0.3,
        command: "autonomous-run-summary",
      })) || "No summary available"
    )
  } catch {
    return "Execution completed. AI summary generator unavailable."
  }
}

function getDummyTestCases(webAppUrl: string, routes: string[]): any[] {
  const baseCases = [
    {
      title: "Verify application homepage load",
      preconditions: "Application web URL is active.",
      steps: [
        {
          actionDescription: `Navigate to application homepage at ${webAppUrl}`,
          expectedResult: "Homepage loads without errors",
          actionType: "open_url",
          targetType: "url",
          targetValue: webAppUrl,
          inputValue: webAppUrl
        },
        {
          actionDescription: "Verify page body is visible",
          expectedResult: "Body element is present in DOM",
          actionType: "assert_visible",
          targetType: "css",
          targetValue: "body",
          inputValue: ""
        }
      ]
    }
  ]

  for (const route of routes) {
    if (route !== webAppUrl && !route.includes("/api/")) {
      try {
        const parsedPath = new URL(route).pathname
        baseCases.push({
          title: `Verify page accessibility: ${parsedPath}`,
          preconditions: "Homepage is reachable.",
          steps: [
            {
              actionDescription: `Navigate to ${parsedPath}`,
              expectedResult: `Page at ${parsedPath} loads successfully`,
              actionType: "open_url",
              targetType: "url",
              targetValue: route,
              inputValue: route
            },
            {
              actionDescription: `Verify page path contains ${parsedPath}`,
              expectedResult: `URL contains path ${parsedPath}`,
              actionType: "assert_url",
              targetType: "url",
              targetValue: parsedPath,
              inputValue: ""
            }
          ]
        })
      } catch {}
    }
  }

  return baseCases.slice(0, 3)
}

const worker = new Worker(
  "autonomous-agent-queue",
  async (job) => {
    const { agentRunId } = job.data
    console.log(`[AGENT WORKER JOB] Processing agentRunId: ${agentRunId}`)
    currentJobId = agentRunId
    workerStatus = "busy"

    try {
      await runAutonomousQA(agentRunId)
    } catch (err: any) {
      workerStatus = "error"
      const currentRun = await prisma.autonomousAgentRun.findUnique({
        where: { id: agentRunId }
      })
      if (currentRun?.status === "Cancelled") {
        console.log(`[AutonomousAgentWorker] Run ${agentRunId} was cancelled. Skipping status: "Failed" update.`)
      } else {
        await prisma.autonomousAgentRun.update({
          where: { id: agentRunId },
          data: { status: "Failed", completedAt: new Date() }
        })
        await publishAgentRunEvent(agentRunId, "failed", { error: err.message })
        throw err
      }
    } finally {
      currentJobId = null
      workerStatus = "idle"
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
)

worker.on("error", (error) => {
  console.error("[Autonomous Agent Worker] error:", error.message)
})

const heartbeatInterval = setInterval(async () => {
  try {
    const memoryUsage = process.memoryUsage().rss
    await registerWorkerHeartbeat(workerId, {
      status: workerStatus,
      currentJobId,
      memoryUsage,
      browserStatus: "Active",
    })
  } catch (err: any) {
    console.error("[Autonomous Agent Worker] heartbeat registration failed:", err.message)
  }
}, 5000)

process.on("SIGTERM", async () => {
  clearInterval(heartbeatInterval)
  await worker.close()
  process.exit(0)
})
