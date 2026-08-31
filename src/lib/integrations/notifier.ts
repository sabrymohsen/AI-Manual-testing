/**
 * notifyIntegrations — called by the test runner after every terminal status.
 * Delegates to the central onTestRunCompleted hook which handles:
 *   - Auto bug creation / duplicate prevention
 *   - OpenProject result sync + bug sync
 *   - Jira / Azure DevOps legacy notification
 */
import { onTestRunCompleted } from "./on-test-run-completed"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export async function notifyIntegrations(testRunId: string): Promise<void> {
  // Run the full OpenProject / bug-creation hook
  await onTestRunCompleted(testRunId)

  // Legacy Jira / Azure DevOps notifications (unchanged behaviour)
  await legacyNotify(testRunId)
}

// ─── Legacy notifier for Jira and Azure DevOps ────────────────────────────────
async function legacyNotify(testRunId: string): Promise<void> {
  try {
    const testRun = (await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        project: { include: { integrationConfig: true } },
        testCase: { include: { steps: { orderBy: { stepNumber: "asc" } } } },
        stepResults: { orderBy: { stepNumber: "asc" } },
      } as any,
    })) as any

    if (!testRun?.project) return

    const config = testRun.project.integrationConfig
    if (!config || !config.enabled || !config.provider || config.provider === "none") return
    if (config.provider === "openproject") return // handled by onTestRunCompleted

    const isFailed = testRun.status === "Failed"
    if (config.triggerOn === "Failed" && !isFailed) return

    if (!config.encryptedToken) return

    let token = ""
    try {
      token = decryptSecret({
        encrypted: config.encryptedToken,
        iv: config.encryptionIv || "",
        authTag: config.encryptionAuthTag || "",
        keyVersion: config.keyVersion || "v1",
      })
    } catch {
      return
    }

    const title = `[${testRun.status}] ${testRun.testCase?.title || "Test Run"}`
    const host: string = config.host || ""
    const projectKey: string = config.projectKey || ""
    const username: string = config.username || ""
    const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

    if (config.provider === "jira") {
      const jiraHost = host.trim().replace(/^https?:\/\//, "")
      const url = `https://${jiraHost}/rest/api/2/issue`
      const authHeader = Buffer.from(`${username.trim()}:${token.trim()}`).toString("base64")

      let description = `Test Case: ${testRun.testCase?.title || "N/A"}\nStatus: ${testRun.status}\nReport: ${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report\n\nSteps:\n`
      for (const r of testRun.stepResults || []) {
        description += `- Step ${r.stepNumber}: ${r.actionDescription} → ${r.status}\n`
        if (r.errorDetails) description += `  Error: ${r.errorDetails}\n`
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey.trim() },
            summary: title,
            description,
            issuetype: { name: isFailed ? "Bug" : "Task" },
          },
        }),
      })
      if (!res.ok) console.error(`[notifier] Jira error ${res.status}: ${(await res.text()).slice(0, 200)}`)
      else console.log(`[notifier] Jira ticket created: ${(await res.json()).key}`)
    }

    if (config.provider === "azure_devops") {
      let adoOrg = host.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (!adoOrg.includes("dev.azure.com/")) adoOrg = `dev.azure.com/${adoOrg}`
      const type = isFailed ? "$Bug" : "$Task"
      const url = `https://${adoOrg}/${projectKey.trim()}/_apis/wit/workitems/${type}?api-version=6.0`
      const authHeader = Buffer.from(`:${token.trim()}`).toString("base64")

      // Steps and their errors, the same as the Jira branch above. Without them
      // the work item said only which test failed, not what went wrong or how
      // to reproduce it — the two things the developer picking it up needs.
      // System.Description is an HTML field, so anything from the run is
      // escaped: an assertion message containing markup would otherwise break
      // the rendering, or worse be interpreted.
      const esc = (v: unknown) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")

      let htmlDescription =
        `<p><strong>Test Case:</strong> ${esc(testRun.testCase?.title || "N/A")}</p>` +
        `<p><strong>Status:</strong> ${esc(testRun.status)}</p>` +
        `<p><strong>Report:</strong> <a href="${esc(
          `${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report`
        )}">View run</a></p>`

      if ((testRun.stepResults || []).length > 0) {
        htmlDescription += `<p><strong>Steps:</strong></p><ul>`
        for (const r of testRun.stepResults || []) {
          htmlDescription += `<li>Step ${esc(r.stepNumber)}: ${esc(r.actionDescription)} &rarr; ${esc(r.status)}`
          if (r.errorDetails) htmlDescription += `<br/><em>Error: ${esc(r.errorDetails)}</em>`
          htmlDescription += `</li>`
        }
        htmlDescription += `</ul>`
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/json-patch+json", Accept: "application/json" },
        body: JSON.stringify([
          { op: "add", path: "/fields/System.Title", value: title },
          { op: "add", path: "/fields/System.Description", value: htmlDescription },
        ]),
      })
      if (!res.ok) console.error(`[notifier] Azure DevOps error ${res.status}: ${(await res.text()).slice(0, 200)}`)
      else console.log(`[notifier] Azure DevOps work item created: ${(await res.json()).id}`)
    }
  } catch (err) {
    console.error("[notifier] legacyNotify unexpected error:", err)
  }
}
