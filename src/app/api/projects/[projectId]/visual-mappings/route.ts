import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const mappings = await prisma.visualCheckMapping.findMany({
      where: {
        projectId: params.projectId,
      },
      include: {
        figmaFrame: true,
        ignoredRegions: true,
        toleranceProfile: true
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ mappings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch mappings" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const mappingSchema = z.object({
      figmaFrameId: z.string().min(1, "Figma frame ID is required"),
      appUrl: z.string().url("Invalid URL").min(1, "App URL is required"),
      routeName: z.string().optional().nullable(),
      moduleId: z.string().optional().nullable(),
      featureId: z.string().optional().nullable(),
      componentId: z.string().optional().nullable(),
      viewportName: z.string().min(1, "Viewport name is required"),
      viewportWidth: z.number().int().positive(),
      viewportHeight: z.number().int().positive(),
      deviceScaleFactor: z.number().optional(),
      browserType: z.string().optional(),
      credentialId: z.string().optional().nullable(),
      waitStrategy: z.string().optional(),
      waitSelector: z.string().optional().nullable(),
      fixedDelayMs: z.number().optional().nullable(),
      toleranceProfileId: z.string().optional().nullable(),
    })
    const parsed = mappingSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const {
      figmaFrameId,
      appUrl,
      routeName,
      moduleId,
      featureId,
      componentId,
      viewportName,
      viewportWidth,
      viewportHeight,
      deviceScaleFactor,
      browserType,
      credentialId,
      waitStrategy,
      waitSelector,
      fixedDelayMs,
      toleranceProfileId
    } = parsed.data

    const mapping = await prisma.visualCheckMapping.create({
      data: {
        projectId: params.projectId,
        figmaFrameId,
        appUrl,
        routeName: routeName || null,
        moduleId: moduleId || null,
        featureId: featureId || null,
        componentId: componentId || null,
        viewportName,
        viewportWidth,
        viewportHeight,
        deviceScaleFactor: deviceScaleFactor ?? 1.0,
        browserType: (browserType || "Chromium") as any,
        credentialId: credentialId || null,
        waitStrategy: waitStrategy || "network_idle",
        waitSelector: waitSelector || null,
        fixedDelayMs: fixedDelayMs ?? null,
        toleranceProfileId: toleranceProfileId || null
      },
      include: {
        figmaFrame: true,
        ignoredRegions: true,
        toleranceProfile: true
      }
    })

    return NextResponse.json({ success: true, mapping })
  } catch (err: any) {
    console.error("Create visual mapping error:", err)
    return NextResponse.json({ error: err.message || "Failed to create mapping" }, { status: 500 })
  }
}
