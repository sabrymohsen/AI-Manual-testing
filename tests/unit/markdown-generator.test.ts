import { describe, it, expect, vi } from "vitest"
import { generateMarkdownReport } from "@/lib/reports/markdown-generator"
import { prisma } from "@/lib/db"

vi.mock("@/lib/db", () => {
  return {
    prisma: {
      testRun: {
        findUnique: vi.fn(),
      },
    },
  };
});

describe("markdown-generator", () => {
  it("should generate a correct markdown report structure for a test run", async () => {
    const mockTestRun = {
      id: "run-1",
      status: "Passed",
      browserType: "Chromium",
      viewport: "Desktop",
      durationMs: 4500,
      startedAt: new Date("2026-06-15T08:00:00Z"),
      completedAt: new Date("2026-06-15T08:00:04.500Z"),
      roleUsed: "Admin",
      project: {
        name: "Test Web App",
        webAppUrl: "https://example.com",
        environment: "Staging",
      },
      testCase: {
        title: "Admin Login Flow",
        module: "Auth",
      },
      credential: {
        roleName: "Admin",
      },
      stepResults: [
        {
          id: "step-1",
          stepNumber: 1,
          actionDescription: "Open Login Page",
          expectedResult: "Page displays email input",
          actualResult: "Step completed successfully",
          status: "Passed",
          durationMs: 1200,
          errorDetails: null,
          screenshotAfter: null,
        },
        {
          id: "step-2",
          stepNumber: 2,
          actionDescription: "Enter Admin Credentials",
          expectedResult: "Redirect to Dashboard",
          actualResult: "Step completed successfully",
          status: "Passed",
          durationMs: 3300,
          errorDetails: null,
          screenshotAfter: null,
        },
      ],
    }

    vi.mocked(prisma.testRun.findUnique).mockResolvedValue(mockTestRun as any)

    const report = await generateMarkdownReport("run-1")

    expect(report).toContain("# Test Run Report: Test Web App")
    expect(report).toContain("**Test Case**: Admin Login Flow")
    expect(report).toContain("**Status**: Passed")
    expect(report).toContain("## Step Results")
    expect(report).toContain("| 1 | Open Login Page |")
    expect(report).toContain("| 2 | Enter Admin Credentials |")
    expect(report).toContain("- **Passed**: 2")
  })

  it("should list failure details if step fails", async () => {
    const mockTestRun = {
      id: "run-2",
      status: "Failed",
      browserType: "Firefox",
      viewport: "Mobile",
      durationMs: 1500,
      startedAt: new Date("2026-06-15T08:00:00Z"),
      completedAt: new Date("2026-06-15T08:00:01.500Z"),
      roleUsed: "None",
      project: {
        name: "Test Web App",
        webAppUrl: "https://example.com",
        environment: "Staging",
      },
      testCase: {
        title: "Click Missing Button",
        module: "Navigation",
      },
      credential: null,
      stepResults: [
        {
          id: "step-1",
          stepNumber: 1,
          actionDescription: "Click checkout button",
          expectedResult: "Checkout modal displays",
          actualResult: "Button not found in DOM",
          status: "Failed",
          durationMs: 1500,
          errorDetails: "Timeout error (5000ms)",
          screenshotAfter: "storage/screenshots/error-step-1.png",
        },
      ],
    }

    vi.mocked(prisma.testRun.findUnique).mockResolvedValue(mockTestRun as any)

    const report = await generateMarkdownReport("run-2")

    expect(report).toContain("**Status**: Failed")
    expect(report).toContain("## Failed Steps")
    expect(report).toContain("### Step 1: Click checkout button")
    expect(report).toContain("- **Error**: Timeout error (5000ms)")
    expect(report).toContain("- **Screenshot**: storage/screenshots/error-step-1.png")
  })
})
