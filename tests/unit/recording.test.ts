import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    recordedTestCase: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    testCase: {
      create: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import { getSessionStats, saveRecordedCaseAsTestCase } from "@/lib/recording/session-store"

describe("recording session-store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("computes saved and draft session stats", async () => {
    vi.mocked(prisma.recordedTestCase.findMany).mockResolvedValue([
      {
        id: "1",
        status: "SavedAsTestCase",
        steps: [{ id: "s1" }, { id: "s2" }],
      },
      {
        id: "2",
        status: "Draft",
        steps: [{ id: "s3" }],
      },
    ] as any)

    const stats = await getSessionStats("session-1")
    expect(stats.savedCount).toBe(1)
    expect(stats.draftCount).toBe(1)
    expect(stats.draftStepCount).toBe(1)
  })

  it("saves recorded draft as executable TestCase with Recorder source", async () => {
    vi.mocked(prisma.recordedTestCase.findUnique).mockResolvedValue({
      id: "draft-1",
      title: "Login flow",
      module: "Auth",
      moduleId: null,
      featureId: null,
      componentId: null,
      priority: "High",
      preconditions: null,
      requiredCredentialId: null,
      session: { projectId: "project-1" },
      steps: [
        {
          stepNumber: 1,
          actionDescription: "Open URL",
          expectedResult: "Page loads",
          actionType: "open_url",
          targetType: "url",
          targetValue: "https://example.com",
          inputValue: null,
          assertions: [],
          componentType: null,
          groupId: null,
          rawEvents: null,
          actionMetadata: null,
          locatorCandidates: null,
          alternativeLocators: null,
          selectedOptionText: null,
          selectedOptionValue: null,
          validationStatus: null,
          validationMessage: null,
          includeInFinalTestCase: true,
        },
      ],
    } as any)

    vi.mocked(prisma.testCase.create).mockResolvedValue({ id: "tc-1", title: "Login flow" } as any)
    vi.mocked(prisma.recordedTestCase.update).mockResolvedValue({} as any)

    const saved = await saveRecordedCaseAsTestCase("draft-1")

    expect(saved.id).toBe("tc-1")
    expect(prisma.testCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "Recorder",
          projectId: "project-1",
        }),
      })
    )
    expect(prisma.recordedTestCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "draft-1" },
        data: expect.objectContaining({ status: "SavedAsTestCase", finalTestCaseId: "tc-1" }),
      })
    )
  })

  it("throws when draft recorded case is missing", async () => {
    vi.mocked(prisma.recordedTestCase.findUnique).mockResolvedValue(null)
    await expect(saveRecordedCaseAsTestCase("missing")).rejects.toThrow("Draft recorded test case not found")
  })
})

describe("recording worker-client", () => {
  it("reports worker offline when health check fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    )

    const { checkRecorderWorkerHealth } = await import("@/lib/recording/worker-client")
    const health = await checkRecorderWorkerHealth()
    expect(health.online).toBe(false)

    vi.unstubAllGlobals()
  })
})
