import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { sessionId, actionsLog } = body // actionsLog is array of actions

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 })
    }

    const session = await prisma.recorderSession.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return NextResponse.json({ error: "Recorder session not found" }, { status: 404 })
    }

    // Build finalized SHAFT Java code block based on actions log
    let javaSteps = ""
    if (actionsLog && actionsLog.length > 0) {
      actionsLog.forEach((act: any) => {
        let value = act.value || ""
        // Redaction checks: if step action types passwords/tokens, redact
        if (act.action === "type" && (act.element.toLowerCase().includes("pass") || act.element.toLowerCase().includes("token") || act.element.toLowerCase().includes("key"))) {
          value = "[REDACTED]"
        }
        
        if (act.action === "navigate") {
          javaSteps += `\n        navigateTo("${value}");`
        } else if (act.action === "click") {
          javaSteps += `\n        driver.element().click(${act.locator});`
        } else if (act.action === "type") {
          javaSteps += `\n        driver.element().type(${act.locator}, "${value}");`
        }
      })
    }

    const finalCode = `${session.code}${javaSteps}\n    }\n}`

    const updated = await prisma.recorderSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        code: finalCode
      }
    })

    return NextResponse.json({ session: updated })
  } catch (err: any) {
    console.error("POST stop recorder session error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
