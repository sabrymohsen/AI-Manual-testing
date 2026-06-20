import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"
import { recorderWorkerRequest, RecorderWorkerError } from "@/lib/recording/worker-client"

const startRecordingSchema = z.object({
  title: z.string().min(1, "Test case title is required"),
  module: z.string().optional(),
  moduleId: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
  componentId: z.string().nullable().optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  preconditions: z.string().optional(),
  requiredCredentialId: z.string().nullable().optional(),
  startUrl: z.string().url("Target URL must be a valid URL"),
  browserType: z.enum(["Chromium", "Firefox", "WebKit"]).optional(),
  viewport: z.enum(["Desktop", "Tablet", "Mobile", "Custom"]).optional(),
  recordingMode: z.enum(["Fast", "Detailed", "Assertion"]).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = startRecordingSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
    }

    const options = {
      title: parsed.data.title,
      module: parsed.data.module || "General",
      moduleId: parsed.data.moduleId || null,
      featureId: parsed.data.featureId || null,
      componentId: parsed.data.componentId || null,
      priority: parsed.data.priority || "Medium",
      preconditions: parsed.data.preconditions,
      requiredCredentialId: parsed.data.requiredCredentialId || undefined,
      startUrl: parsed.data.startUrl,
      browserType: parsed.data.browserType || "Chromium",
      viewport: parsed.data.viewport || "Desktop",
      recordingMode: parsed.data.recordingMode || "Fast",
    }

    const result = await recorderWorkerRequest<{ session: unknown; testCase: unknown }>(
      "/sessions/start",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: params.projectId,
          userId: auth.session!.user.id,
          options,
        }),
      }
    )

    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    console.error("Error starting recording session:", err)
    if (err instanceof RecorderWorkerError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          details: err.details,
          troubleshooting:
            err.code === "WORKER_OFFLINE"
              ? "Start the recorder worker: npm run recorder-worker"
              : undefined,
        },
        { status: err.status || 503 }
      )
    }
    return NextResponse.json(
      { error: err.message || "Failed to start recording session" },
      { status: 500 }
    )
  }
}
