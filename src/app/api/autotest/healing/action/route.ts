import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { eventId, action, editLocator } = body

    if (!eventId || !action) {
      return NextResponse.json({ error: "Missing eventId or action" }, { status: 400 })
    }

    const event = await prisma.healingEvent.findUnique({
      where: { id: eventId }
    })

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }

    let updatedEvent
    if (action === "approve") {
      updatedEvent = await prisma.healingEvent.update({
        where: { id: eventId },
        data: { status: "recovered", confidence: 1.0 }
      })
    } else if (action === "reject") {
      updatedEvent = await prisma.healingEvent.update({
        where: { id: eventId },
        data: { status: "failed" }
      })
    } else if (action === "edit" && editLocator) {
      updatedEvent = await prisma.healingEvent.update({
        where: { id: eventId },
        data: { recoveredLocator: editLocator, status: "recovered", confidence: 1.0 }
      })
    } else {
      return NextResponse.json({ error: "Invalid action parameters" }, { status: 400 })
    }

    return NextResponse.json({ event: updatedEvent })
  } catch (err: any) {
    console.error("POST healing action error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
