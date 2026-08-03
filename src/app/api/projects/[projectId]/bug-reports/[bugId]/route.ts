import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; bugId: string } }
) {
  // Reading a bug is member-level. requireProjectOwner demanded Owner/Admin,
  // which 404'd the testers who file most of them.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const bugExists = await prisma.bugReport.findFirst({
    where: {
      id: params.bugId,
      OR: [
        { testRun: { projectId: params.projectId } },
        { manualTestSession: { projectId: params.projectId } }
      ]
    }
  })
  if (!bugExists) {
    return notFoundResponse("Bug report not found")
  }

  const bugReport = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    include: {
      attachments: true,
      testRun: {
        include: {
          testCase: {
            include: {
              steps: {
                orderBy: { stepNumber: "asc" }
              }
            }
          },
          stepResults: {
            orderBy: { stepNumber: "asc" }
          }
        }
      },
    },
  })

  if (!bugReport) {
    return NextResponse.json({ error: "Bug report not found" }, { status: 404 })
  }

  return NextResponse.json({ bugReport })
}
