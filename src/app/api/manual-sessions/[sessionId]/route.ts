import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const sessionDetails = await prisma.manualTestSession.findUnique({
      where: { id: params.sessionId },
      include: {
        project: {
          select: { name: true }
        },
        credential: true,
        sessionCases: {
          include: {
            testCase: {
              select: {
                title: true,
                module: true,
                priority: true,
                preconditions: true
              }
            },
            stepResults: {
              orderBy: { stepNumber: "asc" }
            }
          },
          orderBy: { orderIndex: "asc" }
        },
        notes: {
          orderBy: { createdAt: "desc" }
        },
        bugs: true
      }
    })

    if (!sessionDetails) {
      return NextResponse.json({ error: "Manual session not found" }, { status: 404 })
    }

    return NextResponse.json(sessionDetails)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch manual session" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, status, note, screenshotPath, pageUrl } = body

    if (note) {
      await prisma.manualSessionNote.create({
        data: {
          sessionId: params.sessionId,
          note,
          screenshotPath: screenshotPath || null,
          pageUrl: pageUrl || null
        }
      })
    }

    const updated = await prisma.manualTestSession.update({
      where: { id: params.sessionId },
      data: {
        name,
        status: status || undefined
      }
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update manual session" }, { status: 500 })
  }
}
