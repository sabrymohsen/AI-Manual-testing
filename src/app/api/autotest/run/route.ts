/**
 * POST /api/autotest/run — run a Test Studio script.
 *
 * Was a second, simpler copy of the hub runner: it wrote a .java file into a
 * hardcoded SHAFT/Maven directory under one developer's home folder and shelled
 * out to `mvn test` with a pinned JAVA_HOME. That path held no pom.xml and no
 * sources, so the command could not succeed anywhere — and none of it existed
 * in a container.
 *
 * It now delegates to the shared Playwright pipeline, so there is one runner
 * rather than two implementations to keep in step. The response still carries
 * an `execution`, but it is returned as soon as the run starts rather than
 * after it finishes: a browser run can outlast an HTTP request, and the caller
 * already polls the execution row for status and logs.
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { startScriptRun } from "@/lib/hub-runner"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { scriptId, browser } = body

    if (!scriptId) {
      return NextResponse.json({ error: "Missing scriptId parameter" }, { status: 400 })
    }

    const script = await prisma.testScript.findUnique({ where: { id: scriptId } })
    if (!script) {
      return NextResponse.json({ error: "Test script not found" }, { status: 404 })
    }

    const executionId = await startScriptRun(
      { id: script.id, name: script.name, type: script.type, code: script.code },
      browser || "chromium"
    )

    const execution = await prisma.testExecution.findUnique({ where: { id: executionId } })
    return NextResponse.json({ execution })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
