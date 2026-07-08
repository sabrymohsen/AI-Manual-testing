import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { url, browser, device } = body

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    const session = await prisma.recorderSession.create({
      data: {
        url,
        browser: browser || "Chrome",
        device: device || "Desktop",
        status: "recording",
        code: `package com.ourcompany.tests;\n\nimport org.testng.annotations.Test;\n\npublic class RecordedFlowTest extends BaseTest {\n    @Test(description = "Automated test flow recorded using Test Recorder Pro")\n    public void testRecordedSteps() {\n        navigateTo("${url}");`
      }
    })

    return NextResponse.json({ session })
  } catch (err: any) {
    console.error("POST start recorder session error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
