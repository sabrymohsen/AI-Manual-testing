import { prisma } from "@/lib/db"

/**
 * SessionEngine manages execution-time active ManualTestSession details, checklist progress, and timers.
 */
export class SessionEngine {
  private static activeWorkstations: Map<string, any> = new Map()

  /**
   * Caches active workstation details.
   */
  static startWorkstation(sessionId: string, context: {
    projectId: string
    currentCaseId?: string
    checklist: Array<{ stepId: string; status: "Passed" | "Failed" | "Pending" }>
  }) {
    this.activeWorkstations.set(sessionId, {
      ...context,
      startedAt: new Date()
    })
  }

  /**
   * Updates checklist status of a single step.
   */
  static updateStepStatus(sessionId: string, stepId: string, status: "Passed" | "Failed" | "Pending") {
    const ws = this.activeWorkstations.get(sessionId)
    if (ws) {
      const step = ws.checklist.find((item: any) => item.stepId === stepId)
      if (step) step.status = status
    }
  }

  /**
   * Removes workstation session cache.
   */
  static stopWorkstation(sessionId: string) {
    this.activeWorkstations.delete(sessionId)
  }

  /**
   * Fetches workstation session details from DB.
   */
  static async getWorkstationSession(sessionId: string) {
    return await prisma.manualTestSession.findUnique({
      where: { id: sessionId },
      include: {
        sessionCases: {
          include: {
            testCase: {
              include: { steps: { orderBy: { stepNumber: "asc" } } }
            }
          }
        }
      }
    })
  }
}
