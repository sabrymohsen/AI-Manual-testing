import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { bugId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const bugReport = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    include: {
      attachments: true,
      testRun: {
        include: {
          testCase: {
            include: {
              moduleRelation: true,
              feature: true,
              component: true
            }
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
