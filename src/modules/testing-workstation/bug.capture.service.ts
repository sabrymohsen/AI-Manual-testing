import { prisma } from "@/lib/db"
import { Priority, BugStatus } from "@prisma/client"
import { nextBugKey } from "@/lib/bug-reports/keys"

/**
 * BugCaptureService aggregates workstation telemetry logs (exceptions, networks)
 * and screenshot attachments, and maps them to clean BugReport model definitions.
 */
export class BugCaptureService {
  /**
   * Automatically packages a bug report from workstation state.
   */
  static async logWorkstationDefect(params: {
    projectId: string
    title: string
    actualResult: string
    expectedResult?: string
    screenshotPath?: string
    consoleLogs?: string[]
    networkLogs?: string[]
  }) {
    // 1. Compile logs format
    const logsBlob = params.consoleLogs ? params.consoleLogs.join("\n") : ""
    const stepsText = `1. Launch browser\n2. Open target workstation URL\n3. Exception occurred: ${params.actualResult}`

    // 2. Create bug in Database
    const bug = await prisma.bugReport.create({
      data: {
        projectId: params.projectId,
        bugKey: await nextBugKey(params.projectId),
        title: params.title,
        severity: Priority.Medium,
        priority: Priority.Medium,
        status: BugStatus.Open,
        stepsToReproduce: stepsText,
        expectedResult: params.expectedResult || "Application functions correctly without crash.",
        actualResult: params.actualResult,
        screenshotPath: params.screenshotPath || null,
        consoleLogs: logsBlob || null
      }
    })

    return bug
  }
}
