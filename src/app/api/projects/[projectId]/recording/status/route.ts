import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { checkRecorderWorkerHealth } from "@/lib/recording/worker-client"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const workerHealth = await checkRecorderWorkerHealth()

  return NextResponse.json({
    worker: workerHealth,
    playwrightInstalled: workerHealth.playwrightInstalled,
  })
}
