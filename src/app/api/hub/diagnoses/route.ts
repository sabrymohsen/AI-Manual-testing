import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default diagnoses if empty
const SEED_DIAGNOSES = [
  {
    testExecutionId: "exec-1",
    testName: "LoginFlowTest > validLogin",
    errorMessage: "org.openqa.selenium.NoSuchElementException: Element 'Submit' not found at By.id('submit-btn-old')",
    errorType: "NoSuchElementException",
    primaryCause: "CSS class changed from .btn-primary to .btn-main",
    confidence: 0.92,
    findings: JSON.stringify([
      "Button element at selector By.id('submit-btn-old') was not found on the active page.",
      "A similar button with text 'Submit' is present but has id='submit-btn-new' and class='btn-main'.",
      "Dynamic style overrides delayed rendering of the button."
    ]),
    remediationSteps: JSON.stringify([
      "Update selector to clickableField('Submit') or By.id('submit-btn-new').",
      "Or add data-testid='submit-btn' to the target login button element."
    ]),
    status: "new",
    similarFailuresCount: 3,
    doctorReportPath: "/allure/reports/doctor-login-fail.json"
  },
  {
    testExecutionId: "exec-2",
    testName: "PaymentTest > checkoutFlow",
    errorMessage: "java.lang.AssertionError: Expected order status 'Success' but found 'Pending'",
    errorType: "AssertionFailed",
    primaryCause: "Asynchronous backend transaction delayed processing status updating",
    confidence: 0.78,
    findings: JSON.stringify([
      "API request payload returned 202 Accepted but status query returned Pending.",
      "Database transaction is not committed within the 5 seconds assertion timeout."
    ]),
    remediationSteps: JSON.stringify([
      "Add explicit wait synchronization to wait for database commit.",
      "Increase test assertion timeout threshold to 10 seconds."
    ]),
    status: "diagnosing",
    similarFailuresCount: 1,
    doctorReportPath: "/allure/reports/doctor-payment-fail.json"
  },
  {
    testExecutionId: "exec-3",
    testName: "SearchTest > filterResults",
    errorMessage: "org.openqa.selenium.WebDriverException: connection reset in Firefox on search search-bar",
    errorType: "Flaky",
    primaryCause: "Geckodriver networking timeout reset under parallel execution threads",
    confidence: 0.85,
    findings: JSON.stringify([
      "Test failed on run #1 but passed successfully on automatic retry run #2.",
      "Memory leak in browser processes causes socket connection reset."
    ]),
    remediationSteps: JSON.stringify([
      "Configure browser process reuse in custom.properties: shaft.browser.reuse=true.",
      "Increase network connection timeout limits to 15 seconds."
    ]),
    status: "resolved",
    similarFailuresCount: 2,
    doctorReportPath: "/allure/reports/doctor-search-fail.json"
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
        SEED_DIAGNOSES.map(item =>
          prisma.diagnosis.create({
            data: {
              testExecutionId: item.testExecutionId,
              testName: item.testName,
              errorMessage: item.errorMessage,
              errorType: item.errorType,
              primaryCause: item.primaryCause,
              confidence: item.confidence,
              findings: item.findings,
              remediationSteps: item.remediationSteps,
              status: item.status,
              similarFailuresCount: item.similarFailuresCount,
              doctorReportPath: item.doctorReportPath
            }
          })
        )
      )
      items = await prisma.diagnosis.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    return NextResponse.json({ diagnoses: items })
  } catch (err: any) {
    console.error("GET diagnoses error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
