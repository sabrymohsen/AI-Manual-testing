import { prisma } from "@/lib/db"
import fs from "node:fs"
import path from "node:path"
import archiver from "archiver"

export interface QAAgentSummary {
  mode: string
  targetUrl: string
  runStatus: string
  pagesScanned: number
  elementsDetected: number
  testsGenerated: number
  testsExecuted: number
  stepsPassed: number
  stepsFailed: number
  findingsCreated: number
  bugsCreated: number
  screenshotsCaptured: number
  durationMs: number
  recommendations: string[]
}

export async function generateQAAgentSummary(runId: string): Promise<QAAgentSummary> {
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: {
      project: true,
      steps: true,
      findings: true
    }
  })

  if (!run) throw new Error("QAAgentRun not found")

  // Extract counts from scanner result
  const scannerData = (run.scannerResult || {}) as any
  const pagesScanned = Array.isArray(scannerData.pagesDetected) ? scannerData.pagesDetected.length : 1
  
  let elementsDetected = 0
  if (scannerData) {
    elementsDetected += (scannerData.inputs?.length || 0)
    elementsDetected += (scannerData.buttons?.length || 0)
    elementsDetected += (scannerData.links?.length || 0)
    elementsDetected += (scannerData.dropdowns?.length || 0)
  }

  // Extract counts from plan
  const planData = (run.plan || {}) as any
  const testsGenerated = Array.isArray(planData.tests) ? planData.tests.length : 0

  // Extract counts from execution steps
  const stepsPassed = run.steps.filter(s => s.status === "Passed" || s.status === "SelfHealed").length
  const stepsFailed = run.steps.filter(s => s.status === "Failed").length
  
  // Find distinct test cases executed by looking at the steps names
  const testNames = new Set<string>()
  run.steps.forEach(s => {
    // Step name is e.g. "click on login button" or generated step
    // We can assume number of tests executed is based on executionResult or plan length if run status completed
    if (s.name) {
      testNames.add(s.name)
    }
  })
  
  const executionData = (run.executionResult || {}) as any
  const testsExecuted = typeof executionData.testsExecuted === "number" ? executionData.testsExecuted : testsGenerated

  // Findings & Bugs
  const findingsCreated = run.findings.length
  const bugsCreated = run.findings.filter(f => f.bugReportId !== null).length

  // Screenshots count
  let screenshotsCaptured = run.steps.filter(s => s.screenshotPath !== null).length
  if (scannerData.screenshotPath) {
    screenshotsCaptured++
  }

  // Recommendations generator
  const recommendations: string[] = []
  if (elementsDetected > 0 && !JSON.stringify(scannerData).includes("data-testid")) {
    recommendations.push("Add data-testid attributes to interactive elements to improve locator reliability.")
  }
  if (run.findings.some(f => f.type === "TestFailure")) {
    recommendations.push("Investigate the recorded test step failures and file bug reports.")
  }
  if (run.findings.some(f => f.type === "LocatorHealed")) {
    recommendations.push("Review locator healing logs and update test selectors to prevent runtime healing delays.")
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain current code quality. Continue periodic smoke checks.")
  }

  return {
    mode: run.mode,
    targetUrl: run.project.webAppUrl,
    runStatus: run.status,
    pagesScanned,
    elementsDetected,
    testsGenerated,
    testsExecuted,
    stepsPassed,
    stepsFailed,
    findingsCreated,
    bugsCreated,
    screenshotsCaptured,
    durationMs: run.durationMs,
    recommendations
  }
}

export async function generateQAAgentMarkdown(runId: string): Promise<string> {
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: {
      project: true,
      steps: { orderBy: { stepNumber: "asc" } },
      findings: true
    }
  })

  if (!run) throw new Error("QAAgentRun not found")

  const passedSteps = run.steps.filter(s => s.status === "Passed").length
  const failedSteps = run.steps.filter(s => s.status === "Failed").length
  const healedSteps = run.steps.filter(s => s.status === "SelfHealed").length
  const skippedSteps = run.steps.filter(s => s.status === "Skipped").length
  const totalSteps = run.steps.length

  const markdown = `# QA Agent Brain Summary Report

## Session Details
- **Run ID**: ${run.id}
- **Project**: ${run.project.name}
- **Target URL**: ${run.project.webAppUrl}
- **Run Mode**: ${run.mode}
- **Goal**: ${run.goal}
- **Safety Profile**: ${run.safetyLevel}
- **Created At**: ${run.createdAt.toLocaleString()}
- **Duration**: ${Math.round(run.durationMs / 1000)} seconds

## Execution Summary
- **Overall Status**: ${run.status}
- **Total Steps Dispatched**: ${totalSteps}
- **Passed**: ${passedSteps}
- **Self-Healed**: ${healedSteps}
- **Failed**: ${failedSteps}
- **Skipped (Safety Sandbox)**: ${skippedSteps}

## Interactive DOM Elements Scanned
${run.scannerResult ? `\`\`\`json
${JSON.stringify(run.scannerResult, null, 2)}
\`\`\`` : "*No scanner results captured (scanned URL only or exploration skipped).*"}

## Step-by-Step Telemetry Logs
${run.steps.length === 0 ? "*No execution steps logged.*" : run.steps.map(s => {
  return `### Step ${s.stepNumber}: ${s.name}
- **Status**: ${s.status}
- **Started**: ${s.startedAt ? s.startedAt.toLocaleTimeString() : "-"}
${s.error ? `- **Error Details**: \`${s.error}\`\n` : ""}
${s.screenshotPath ? `- **Screenshot**: [step-${s.stepNumber}.png](${s.screenshotPath})\n` : ""}
`;
}).join("\n")}

## Discovered Findings & Risk Defect Logs
${run.findings.length === 0 ? "*No findings reported.*" : run.findings.map((f, i) => {
  return `### Finding #${i + 1}: ${f.title}
- **Category**: ${f.type}
- **Severity**: ${f.severity}
- **Description**: ${f.description || "-"}
- **Evidence Logs**: ${f.evidence ? JSON.stringify(f.evidence) : "None"}
`;
}).join("\n")}
`
  return markdown
}

export async function generateQAAgentHTML(runId: string): Promise<string> {
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: {
      project: true,
      steps: { orderBy: { stepNumber: "asc" } },
      findings: true
    }
  })

  if (!run) throw new Error("QAAgentRun not found")

  const passedSteps = run.steps.filter(s => s.status === "Passed").length
  const failedSteps = run.steps.filter(s => s.status === "Failed").length
  const healedSteps = run.steps.filter(s => s.status === "SelfHealed").length
  const skippedSteps = run.steps.filter(s => s.status === "Skipped").length

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Agent Brain Report - ${run.project.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
    h2 { color: #0f172a; margin-top: 30px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .badge-passed { bg-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-failed { bg-color: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
    .badge-healed { bg-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .step-card { border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 15px; padding: 15px; }
    .step-header { display: flex; justify-content: space-between; align-items: center; }
    .finding-card { border-left: 4px solid #ef4444; background: #fff5f5; padding: 15px; border-radius: 0 12px 12px 0; margin-bottom: 15px; }
    pre { background: #0f172a; color: #f8fafc; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body>
  <h1>QA Agent Brain Execution Report</h1>
  <div class="grid">
    <div class="card">
      <h3>Session Profile</h3>
      <p><strong>Project:</strong> ${run.project.name}</p>
      <p><strong>Target URL:</strong> <a href="${run.project.webAppUrl}" target="_blank">${run.project.webAppUrl}</a></p>
      <p><strong>Mode:</strong> ${run.mode}</p>
      <p><strong>Goal:</strong> ${run.goal}</p>
      <p><strong>Safety Level:</strong> ${run.safetyLevel}</p>
    </div>
    <div class="card">
      <h3>Results Summary</h3>
      <p><strong>Status:</strong> <span class="badge">${run.status}</span></p>
      <p><strong>Passed Steps:</strong> ${passedSteps}</p>
      <p><strong>Self-Healed Steps:</strong> ${healedSteps}</p>
      <p><strong>Failed Steps:</strong> ${failedSteps}</p>
      <p><strong>Skipped:</strong> ${skippedSteps}</p>
    </div>
  </div>

  <h2>Execution Playwright Telemetry</h2>
  ${run.steps.length === 0 ? "<p>No steps executed.</p>" : run.steps.map(s => `
    <div class="step-card">
      <div class="step-header">
        <strong>Step ${s.stepNumber}: ${s.name}</strong>
        <span class="badge">${s.status}</span>
      </div>
      ${s.error ? `<p style="color:#ef4444; font-family:monospace; font-size:12px;">Error: ${s.error}</p>` : ""}
      ${s.screenshotPath ? `<div style="margin-top:10px;"><img src="${s.screenshotPath}" style="max-height:180px; border-radius:6px; border:1px solid #cbd5e1;"/></div>` : ""}
    </div>
  `).join("")}

  <h2>Defects & Risk Findings</h2>
  ${run.findings.length === 0 ? "<p>No defects or risk findings detected during this sweep.</p>" : run.findings.map(f => `
    <div class="finding-card">
      <strong>[${f.type}] ${f.title} (Severity: ${f.severity})</strong>
      <p style="margin-top:5px; font-size:13px;">${f.description || ""}</p>
      ${f.evidence ? `<pre>${JSON.stringify(f.evidence, null, 2)}</pre>` : ""}
    </div>
  `).join("")}
</body>
</html>`
  return html
}

export async function generateQAAgentZIP(runId: string): Promise<string> {
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: { steps: true }
  })

  if (!run) throw new Error("QAAgentRun not found")

  const storageRoot = process.env.STORAGE_ROOT || "./storage"
  const zipPath = path.join(
    storageRoot,
    "exports",
    `qa-agent-run-${runId}.zip`
  )

  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true })

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    output.on("close", () => resolve(zipPath))
    archive.on("error", reject)

    archive.pipe(output)

    // Add Markdown report
    generateQAAgentMarkdown(runId)
      .then(markdown => {
        archive.append(markdown, { name: "report.md" })
      })
      .catch(() => {})

    // Add HTML report
    generateQAAgentHTML(runId)
      .then(html => {
        archive.append(html, { name: "report.html" })
      })
      .catch(() => {})

    // Append screenshots
    for (const step of run.steps) {
      if (step.screenshotPath) {
        try {
          const absolutePath = path.join(storageRoot, step.screenshotPath.replace(/^\/?storage\//, ""))
          if (fs.existsSync(absolutePath)) {
            archive.file(absolutePath, {
              name: `screenshots/step-${step.stepNumber}.png`
            })
          }
        } catch {}
      }
    }

    archive.finalize()
  })
}
