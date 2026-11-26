import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const items = await prisma.diagnosis.findMany({
      orderBy: { createdAt: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

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
        doctorReportPath: doctorReportPath || "test-results/"
      }
    })

    return NextResponse.json({ diagnosis }, { status: 201 })
  } catch (err: any) {
    console.error("POST diagnosis error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
