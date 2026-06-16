import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { notifyIntegrations } from "@/lib/integrations/notifier"
import { prisma } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"

process.env.APP_ENCRYPTION_KEY = "WBuGjCWCotqwUPmC6NCFm1jE9KaMhNF2p5kiPFJIV7c="
process.env.APP_ENCRYPTION_KEY_VERSION = "v1"

vi.mock("@/lib/db", () => {
  return {
    prisma: {
      testRun: {
        findUnique: vi.fn(),
      },
    },
  }
})

describe("integrations notifier", () => {
  let originalFetch: typeof global.fetch
  let fetchMock: any

  beforeEach(() => {
    originalFetch = global.fetch
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: "MOCK-1", id: "123" }),
    })
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it("should do nothing if integration is not configured", async () => {
    vi.mocked(prisma.testRun.findUnique).mockResolvedValue({
      id: "run-1",
      status: "Failed",
      project: {
        integrationConfig: null,
      },
    } as any)

    await notifyIntegrations("run-1")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("should do nothing if integration is disabled", async () => {
    vi.mocked(prisma.testRun.findUnique).mockResolvedValue({
      id: "run-1",
      status: "Failed",
      project: {
        integrationConfig: {
          enabled: false,
          provider: "jira",
        },
      },
    } as any)

    await notifyIntegrations("run-1")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("should do nothing if triggerOn is Failed but test run passed", async () => {
    vi.mocked(prisma.testRun.findUnique).mockResolvedValue({
      id: "run-1",
      status: "Passed",
      project: {
        integrationConfig: {
          enabled: true,
          provider: "jira",
          triggerOn: "Failed",
        },
      },
    } as any)

    await notifyIntegrations("run-1")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("should trigger Jira integration on failure", async () => {
    const encrypted = encryptSecret("jira-api-token")
    const mockRun = {
      id: "run-123",
      status: "Failed",
      durationMs: 5000,
      projectId: "proj-1",
      project: {
        integrationConfig: {
          enabled: true,
          provider: "jira",
          host: "myjira.atlassian.net",
          projectKey: "QA",
          username: "qa-user@example.com",
          encryptedToken: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          triggerOn: "Failed",
        },
      },
      testCase: {
        title: "Test Broken Link",
      },
      stepResults: [
        {
          stepNumber: 1,
          actionDescription: "Click checkout",
          status: "Failed",
          errorDetails: "Button not found",
        },
      ],
    }

    vi.mocked(prisma.testRun.findUnique).mockResolvedValue(mockRun as any)

    await notifyIntegrations("run-123")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://myjira.atlassian.net/rest/api/2/issue")
    expect(options.method).toBe("POST")
    
    const body = JSON.parse(options.body)
    expect(body.fields.project.key).toBe("QA")
    expect(body.fields.summary).toContain("[Failed] Test Run: Test Broken Link")
    expect(body.fields.issuetype.name).toBe("Bug")
    expect(body.fields.description).toContain("Test Broken Link")
    expect(body.fields.description).toContain("Button not found")
  })

  it("should trigger Azure DevOps integration on failure", async () => {
    const encrypted = encryptSecret("devops-token")
    const mockRun = {
      id: "run-456",
      status: "Failed",
      durationMs: 8000,
      projectId: "proj-2",
      project: {
        integrationConfig: {
          enabled: true,
          provider: "azure_devops",
          host: "dev.azure.com/myorg",
          projectKey: "MyProject",
          username: "",
          encryptedToken: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          triggerOn: "Failed",
        },
      },
      testCase: {
        title: "Submit Payment Screen",
      },
      stepResults: [
        {
          stepNumber: 1,
          actionDescription: "Enter Card Details",
          status: "Passed",
          errorDetails: null,
        },
        {
          stepNumber: 2,
          actionDescription: "Click Submit",
          status: "Failed",
          errorDetails: "HTTP 500 Payment Gateway Error",
        },
      ],
    }

    vi.mocked(prisma.testRun.findUnique).mockResolvedValue(mockRun as any)

    await notifyIntegrations("run-456")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://dev.azure.com/myorg/MyProject/_apis/wit/workitems/$Bug?api-version=6.0")
    expect(options.headers["Content-Type"]).toBe("application/json-patch+json")

    const body = JSON.parse(options.body)
    expect(body).toHaveLength(2)
    expect(body[0].path).toBe("/fields/System.Title")
    expect(body[0].value).toContain("[Failed] Test Run: Submit Payment Screen")
    expect(body[1].path).toBe("/fields/System.Description")
    expect(body[1].value).toContain("HTTP 500 Payment Gateway Error")
  })

  it("should trigger OpenProject integration on success if triggerOn is All", async () => {
    const encrypted = encryptSecret("op-key")
    const mockRun = {
      id: "run-789",
      status: "Passed",
      durationMs: 12000,
      projectId: "proj-3",
      project: {
        integrationConfig: {
          enabled: true,
          provider: "openproject",
          host: "openproject.internal",
          projectKey: "testing",
          username: "apikey",
          encryptedToken: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          triggerOn: "All",
        },
      },
      testCase: {
        title: "Verify Home Elements",
      },
      stepResults: [
        {
          stepNumber: 1,
          actionDescription: "Check logo",
          status: "Passed",
          errorDetails: null,
        },
      ],
    }

    vi.mocked(prisma.testRun.findUnique).mockResolvedValue(mockRun as any)

    await notifyIntegrations("run-789")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://openproject.internal/api/v3/work_items")

    const body = JSON.parse(options.body)
    expect(body.subject).toContain("[Passed] Test Run: Verify Home Elements")
    expect(body._links.project.href).toBe("/api/v3/projects/testing")
    expect(body._links.type.href).toBe("/api/v3/types/1") // Task type
    expect(body.description.raw).toContain("Check logo")
  })
})
