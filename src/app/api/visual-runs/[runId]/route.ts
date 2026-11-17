import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const run = await prisma.visualCheckRun.findUnique({
      where: { id: params.runId },
      include: {
        project: { select: { userId: true } },
        mapping: {
          include: {
            figmaFrame: true,
            ignoredRegions: true
          }
        },
        issues: {
          orderBy: { mismatchPercent: "desc" }
        }
      }
    })

    if (!run) {
      return notFoundResponse("Visual check run not found")
    }

    if (!(await canUseProject(run.projectId, auth.session!.user.id, "read"))) {
      return unauthorizedResponse("Access denied")
    }

    return NextResponse.json({ run })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch run details" }, { status: 500 })
  }
}
