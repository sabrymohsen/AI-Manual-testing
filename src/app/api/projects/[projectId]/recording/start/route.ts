import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { startSession } from "@/lib/recording/session-manager"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const startSchema = z.object({
      name: z.string().optional(),
      url: z.string().url().optional(),
      credentialId: z.string().optional().nullable(),
    }).passthrough()
    const parsed = startSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const result = await startSession(params.projectId, auth.session!.user.id, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    console.error("Error starting recording session:", err)
    return NextResponse.json({ error: err.message || "Failed to start session" }, { status: 500 })
  }
}
