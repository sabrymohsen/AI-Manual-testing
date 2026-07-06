import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const putBodySchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  note: z.string().optional(),
  screenshotPath: z.string().optional(),
  pageUrl: z.string().optional(),
})

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sessionDetails = await prisma.manualTestSession.findUnique({
      where: { id: params.sessionId },
      include: {
        project: {
          select: { name: true, userId: true }
        },
        credential: true,
        sessionCases: {
          include: {
            testCase: {
              select: {
                title: true,
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
      return notFoundResponse("Manual session not found")
    }

    if (sessionDetails.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
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
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const session = await prisma.manualTestSession.findUnique({
      where: { id: params.sessionId },
      include: { project: { select: { userId: true } } }
    })

    if (!session) {
      return notFoundResponse("Manual session not found")
    }

    if (session.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = putBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
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
