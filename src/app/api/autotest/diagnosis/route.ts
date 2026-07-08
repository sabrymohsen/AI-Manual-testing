import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default diagnoses if empty
const SEED_DIAGNOSES = [
  {
    testExecutionId: "exec-login-fail-001",
    testName: "LoginFlowTest.testLoginRedirection",
    errorMessage: "org.openqa.selenium.TimeoutException: Expected condition failed: waiting for visibility of element located by By.id(\"submit-btn-old\") (tried for 10 second(s) with 500 milliseconds interval)",
    primaryCause: "NoSuchElementException: Dynamic locator replacement or DOM node structural alteration",
    confidence: 0.94,
    findings: {
      "Assertion Stated": "driver.assertThat().element(By.id(\"submit-btn-old\")).exists()",
      "Actual DOM State": "The target node was updated to use dynamic class names rather than static IDs.",
      "SHAFT Doctor Assessment": "DOM query failed due to updated layout template styling on checkout wrapper."
    },
    remediationSteps: "1. Update locator selector to By.xpath(\"//button[@type='submit' and contains(@class, 'indigo')]\")\n2. Introduce an explicit waiting condition inside element initialization\n3. Leverage SHAFT Heal configuration parameters to auto-recover this node in future runs.",
    similarFailuresCount: 4,
    doctorReportPath: "target/shaft-doctor/login-fail-doctor-report.json"
  },
  {
    testExecutionId: "exec-api-fail-002",
    testName: "ApiCrudTest.testGetUserList",
    errorMessage: "java.lang.AssertionError: JSON path data[0].first_name expected Michael but was null (HTTP Status 429 Too Many Requests)",
    primaryCause: "HTTP RateLimiting & API Endpoint Stale Data Integration Response",
    confidence: 0.88,
    findings: {
      "Endpoint Request URL": "https://reqres.in/api/users?page=2",
      "Response Body": "{\"error\": \"Rate limit exceeded. Try again in 60 seconds.\"}",
      "SHAFT Doctor Assessment": "Third party rate limits reached on mock endpoints. Test logic expects data arrays."
    },
    remediationSteps: "1. Switch target URL to local mock stub integration environment\n2. Introduce a delay retry handler hook to execute if 429 is encountered\n3. Mock database states locally using in-memory databases.",
    similarFailuresCount: 3,
    doctorReportPath: "target/shaft-doctor/api-fail-doctor-report.json"
  },
  {
    testExecutionId: "exec-settings-fail-003",
    testName: "SettingsTest.testBillingUpgrade",
    errorMessage: "org.openqa.selenium.NoSuchElementException: Cannot locate element with class name pricing-plan-free",
    primaryCause: "Stale test execution context data & caching overlap",
    confidence: 0.76,
    findings: {
      "State context": "The previous test execution failed to clean local storage mock parameters.",
      "SHAFT Doctor Assessment": "Concurrent data write conflicts detected between active test threads."
    },
    remediationSteps: "1. Clear browser cookies and local storage state in setUp/tearDown hooks\n2. Ensure unique user profiles are initialized on each thread run\n3. Add clean-up queries to SQL seed fixtures.",
    similarFailuresCount: 1,
    doctorReportPath: "target/shaft-doctor/settings-fail-doctor-report.json"
  }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let items = await prisma.diagnosis.findMany({
      orderBy: { createdAt: "desc" }
    })

    if (items.length === 0) {
      await Promise.all(
        SEED_DIAGNOSES.map(d =>
          prisma.diagnosis.create({ data: d })
        )
      )
      items = await prisma.diagnosis.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    // Identify recurring issues (failures count >= 3)
    const recurring = items.filter(d => d.similarFailuresCount >= 3)

    return NextResponse.json({
      diagnoses: items,
      recurring
    })
  } catch (err: any) {
    console.error("GET diagnoses error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { testExecutionId, testName, errorMessage, primaryCause, confidence, findings, remediationSteps, similarFailuresCount, doctorReportPath } = body

    if (!testExecutionId || !testName || !errorMessage || !primaryCause || confidence === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const diagnosis = await prisma.diagnosis.create({
      data: {
        testExecutionId,
        testName,
        errorMessage,
        primaryCause,
        confidence,
        findings: findings || {},
        remediationSteps: remediationSteps || "",
        similarFailuresCount: similarFailuresCount || 0,
        doctorReportPath: doctorReportPath || "target/shaft-doctor/"
      }
    })

    return NextResponse.json({ diagnosis }, { status: 201 })
  } catch (err: any) {
    console.error("POST diagnosis error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
