import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { cancelTestRunJob } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const testRun = await prisma.testRun.findFirst({
      where: {
        id: params.id,
        project: { userId: session.user.id },
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: "Test run not found" }, { status: 404 })
    }

    if (testRun.status === "Passed" || testRun.status === "Failed" || testRun.status === "Blocked" || testRun.status === "Cancelled") {
      return NextResponse.json({ error: "Test run has already finished" }, { status: 400 })
    }

    // Set cancellation state in Redis and remove from queue
    await cancelTestRunJob(params.id)

    // Update database status
    await prisma.testRun.update({
      where: { id: params.id },
      data: { status: "Cancelled", completedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: "Test run cancellation requested" })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to cancel test run" }, { status: 500 })
  }
}
