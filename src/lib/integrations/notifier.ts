import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export async function notifyIntegrations(testRunId: string) {
  try {
    const testRun = (await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        project: {
          include: {
            integrationConfig: true
          }
        },
        testCase: {
          include: {
            steps: { orderBy: { stepNumber: "asc" } }
          }
        },
        stepResults: { orderBy: { stepNumber: "asc" } }
      } as any
    })) as any

    if (!testRun || !testRun.project) {
      console.warn(`[notifier] Test run ${testRunId} or project not found`)
      return
    }

    const config = testRun.project.integrationConfig
    if (!config || !config.enabled || config.provider === "none") {
      // Integration not configured or disabled
      return
    }

    // Check trigger condition
    const isFailed = testRun.status === "Failed"

    if (config.triggerOn === "Failed" && !isFailed) {
      // Configured for failures only, but this run succeeded
      return
    }

    console.log(`[notifier] Triggering ${config.provider} integration for test run: ${testRun.id} (Status: ${testRun.status})`)

    // Decrypt Token
    if (!config.encryptedToken) {
      console.warn(`[notifier] Integration configured but token is missing for project ${testRun.projectId}`)
      return
    }

    let token = ""
    try {
      token = decryptSecret({
        encrypted: config.encryptedToken,
        iv: config.encryptionIv || "",
        authTag: config.encryptionAuthTag || "",
        keyVersion: config.keyVersion || "v1"
      })
    } catch (err) {
      console.error("[notifier] Failed to decrypt integration token:", err)
      return
    }

    const title = `[${testRun.status}] Test Run: ${testRun.testCase?.title || "Visual Comparison"}`
    const isBug = isFailed

    // Host Url cleanup
    let host = config.host || ""
    let projectKey = config.projectKey || ""
    let username = config.username || ""

    if (config.provider === "jira") {
      const jiraHost = host.trim().replace(/^https?:\/\//, "")
      const url = `https://${jiraHost}/rest/api/2/issue`
      const authHeader = Buffer.from(`${username.trim()}:${token.trim()}`).toString("base64")

      // Format description
      let description = `Test Case: ${testRun.testCase?.title || "Visual Comparison"}\n`
      description += `Status: ${testRun.status}\n`
      description += `Duration: ${(testRun.durationMs / 1000).toFixed(2)}s\n`
      description += `Report URL: http://localhost:3000/projects/${testRun.projectId}/test-runs/${testRun.id}/report\n\n`
      description += `Steps Execution details:\n`
      for (const res of testRun.stepResults) {
        description += `- Step ${res.stepNumber}: ${res.actionDescription} -> ${res.status}\n`
        if (res.errorDetails) {
          description += `  Error: ${res.errorDetails}\n`
        }
      }

      const payload = {
        fields: {
          project: {
            key: projectKey.trim()
          },
          summary: title,
          description: description,
          issuetype: {
            name: isBug ? "Bug" : "Task"
          }
        }
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`[notifier] Jira integration error: status ${res.status} - ${text}`)
      } else {
        const data = await res.json()
        console.log(`[notifier] Jira ticket created successfully: ${data.key}`)
      }
    }

    if (config.provider === "azure_devops") {
      let adoOrg = host.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (!adoOrg.includes("dev.azure.com/")) {
        adoOrg = `dev.azure.com/${adoOrg}`
      }
      const type = isBug ? "$Bug" : "$Task"
      const url = `https://${adoOrg}/${projectKey.trim()}/_apis/wit/workitems/${type}?api-version=6.0`
      const authHeader = Buffer.from(`:${token.trim()}`).toString("base64")

      // Format HTML description for DevOps Work Items
      let htmlDescription = `<div>`
      htmlDescription += `<p><strong>TestCase:</strong> ${testRun.testCase?.title || "Visual Comparison"}</p>`
      htmlDescription += `<p><strong>Status:</strong> ${testRun.status}</p>`
      htmlDescription += `<p><strong>Duration:</strong> ${(testRun.durationMs / 1000).toFixed(2)}s</p>`
      htmlDescription += `<p><strong>Run Details:</strong> <a href="http://localhost:3000/projects/${testRun.projectId}/test-runs/${testRun.id}/report">View Report</a></p>`
      htmlDescription += `<h3>Executed Steps:</h3><ul>`
      for (const res of testRun.stepResults) {
        const color = res.status === "Passed" ? "green" : res.status === "Failed" ? "red" : "gray"
        htmlDescription += `<li><strong>Step ${res.stepNumber}:</strong> ${res.actionDescription} - <span style="color: ${color}">${res.status}</span>`
        if (res.errorDetails) {
          htmlDescription += `<br/><pre style="background: #f4f4f4; padding: 5px;">Error: ${res.errorDetails}</pre>`
        }
        htmlDescription += `</li>`
      }
      htmlDescription += `</ul></div>`

      const payload = [
        {
          op: "add",
          path: "/fields/System.Title",
          value: title
        },
        {
          op: "add",
          path: "/fields/System.Description",
          value: htmlDescription
        }
      ]

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Content-Type": "application/json-patch+json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`[notifier] Azure DevOps integration error: status ${res.status} - ${text}`)
      } else {
        const data = await res.json()
        console.log(`[notifier] Azure DevOps work item created successfully: ID ${data.id}`)
      }
    }

    if (config.provider === "openproject") {
      let opHost = host.trim().replace(/\/$/, "")
      if (!opHost.startsWith("http")) {
        opHost = `https://${opHost}`
      }
      const url = `${opHost}/api/v3/work_items`
      const authHeader = Buffer.from(`apikey:${token.trim()}`).toString("base64")

      // Format markdown description
      let mdDescription = `**TestCase**: ${testRun.testCase?.title || "Visual Comparison"}\n`
      mdDescription += `**Status**: ${testRun.status}\n`
      mdDescription += `**Duration**: ${(testRun.durationMs / 1000).toFixed(2)}s\n`
      mdDescription += `**Run Details**: [View Report](http://localhost:3000/projects/${testRun.projectId}/test-runs/${testRun.id}/report)\n\n`
      mdDescription += `### Executed Steps:\n`
      for (const res of testRun.stepResults) {
        const statusIcon = res.status === "Passed" ? "✅" : res.status === "Failed" ? "❌" : "⏳"
        mdDescription += `- ${statusIcon} **Step ${res.stepNumber}**: ${res.actionDescription} - *${res.status}*\n`
        if (res.errorDetails) {
          mdDescription += `  \`\`\`\n  Error: ${res.errorDetails}\n  \`\`\`\n`
        }
      }

      // type 3 is Bug, type 1 is Task in default OpenProject configurations
      const typeHref = isBug ? "/api/v3/types/3" : "/api/v3/types/1"

      const payload = {
        subject: title,
        description: {
          format: "markdown",
          raw: mdDescription
        },
        _links: {
          project: {
            href: `/api/v3/projects/${projectKey.trim()}`
          },
          type: {
            href: typeHref
          }
        }
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`[notifier] OpenProject integration error: status ${res.status} - ${text}`)
      } else {
        const data = await res.json()
        console.log(`[notifier] OpenProject work item created successfully: ID ${data.id}`)
      }
    }
  } catch (error) {
    console.error("[notifier] Unexpected error in notifyIntegrations:", error)
  }
}
