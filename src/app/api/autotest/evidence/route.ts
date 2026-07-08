import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default evidence files if empty
const SEED_EVIDENCE_FILES = [
  {
    testExecutionId: "exec-web-fail-001",
    fileType: "screenshot",
    filePath: "/assets/mock-screenshot-login-fail.png",
    stepNumber: 3,
    pageUrl: "https://example.com/login",
    elementLocator: "By.id(\"submit-btn-old\")",
    status: "fail",
    tags: ["GUI", "Web", "Regression"]
  },
  {
    testExecutionId: "exec-web-pass-002",
    fileType: "screenshot",
    filePath: "/assets/mock-screenshot-dashboard.png",
    stepNumber: 5,
    pageUrl: "https://example.com/dashboard",
    elementLocator: "By.cssSelector(\".user-profile-menu\")",
    status: "pass",
    tags: ["GUI", "Web", "Sanity"]
  },
  {
    testExecutionId: "exec-api-fail-003",
    fileType: "log",
    filePath: "/assets/mock-api-response-429.json",
    stepNumber: 2,
    pageUrl: "https://reqres.in/api/users?page=2",
    elementLocator: "GET /api/users",
    status: "fail",
    tags: ["API", "JSON", "REST"]
  },
  {
    testExecutionId: "exec-web-pass-004",
    fileType: "video",
    filePath: "/assets/mock-execution-video.mp4",
    stepNumber: 1,
    pageUrl: "https://example.com/pricing",
    elementLocator: "By.className(\"pricing-plan-free\")",
    status: "pass",
    tags: ["Video", "Pricing"]
  },
  {
    testExecutionId: "exec-web-fail-005",
    fileType: "har",
    filePath: "/assets/mock-network-trace.har",
    stepNumber: 4,
    pageUrl: "https://example.com/settings",
    elementLocator: "By.xpath(\"//a[text()='Upgrade Plan']\")",
    status: "info",
    tags: ["Network", "HAR"]
  }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let items = await prisma.evidenceFile.findMany({
      orderBy: { createdAt: "desc" }
    })

    if (items.length === 0) {
      await Promise.all(
        SEED_EVIDENCE_FILES.map(f =>
          prisma.evidenceFile.create({ data: f })
        )
      )
      items = await prisma.evidenceFile.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    return NextResponse.json({ evidence: items })
  } catch (err: any) {
    console.error("GET evidence files error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { testExecutionId, fileType, filePath, stepNumber, pageUrl, elementLocator, status, tags } = body

    if (!testExecutionId || !fileType || !filePath || stepNumber === undefined || !pageUrl || !elementLocator) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const file = await prisma.evidenceFile.create({
      data: {
        testExecutionId,
        fileType,
        filePath,
        stepNumber,
        pageUrl,
        elementLocator,
        status: status || "info",
        tags: tags || []
      }
    })

    return NextResponse.json({ file }, { status: 201 })
  } catch (err: any) {
    console.error("POST evidence file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
