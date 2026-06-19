import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const putBodySchema = z.object({
  appUrl: z.string().optional(),
  routeName: z.string().optional(),
  moduleId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
  viewportName: z.string().optional(),
  viewportWidth: z.number().optional(),
  viewportHeight: z.number().optional(),
  deviceScaleFactor: z.number().optional(),
  browserType: z.string().optional(),
  credentialId: z.string().optional().nullable(),
  waitStrategy: z.string().optional(),
  waitSelector: z.string().optional().nullable(),
  fixedDelayMs: z.number().optional().nullable(),
  toleranceProfileId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { mappingId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const mapping = await prisma.visualCheckMapping.findUnique({
      where: { id: params.mappingId },
      include: {
        project: { select: { userId: true } }
      }
    })

    if (!mapping) {
      return notFoundResponse("Visual mapping not found")
    }

    if (mapping.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = putBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const {
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
      toleranceProfileId,
      isActive
    } = body

    const updated = await prisma.visualCheckMapping.update({
      where: { id: params.mappingId },
      data: {
        appUrl: appUrl !== undefined ? appUrl : undefined,
        routeName: routeName !== undefined ? routeName : undefined,
        moduleId: moduleId !== undefined ? moduleId : undefined,
        featureId: featureId !== undefined ? featureId : undefined,
        componentId: componentId !== undefined ? componentId : undefined,
        viewportName: viewportName !== undefined ? viewportName : undefined,
        viewportWidth: viewportWidth !== undefined ? Number(viewportWidth) : undefined,
        viewportHeight: viewportHeight !== undefined ? Number(viewportHeight) : undefined,
        deviceScaleFactor: deviceScaleFactor !== undefined ? Number(deviceScaleFactor) : undefined,
        browserType: browserType !== undefined ? browserType : undefined,
        credentialId: credentialId !== undefined ? credentialId : undefined,
        waitStrategy: waitStrategy !== undefined ? waitStrategy : undefined,
        waitSelector: waitSelector !== undefined ? waitSelector : undefined,
        fixedDelayMs: fixedDelayMs !== undefined ? (fixedDelayMs ? Number(fixedDelayMs) : null) : undefined,
        toleranceProfileId: toleranceProfileId !== undefined ? toleranceProfileId : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined
      },
      include: {
        figmaFrame: true,
        ignoredRegions: true,
        toleranceProfile: true
      }
    })

    return NextResponse.json({ success: true, mapping: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update mapping" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { mappingId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const mapping = await prisma.visualCheckMapping.findUnique({
      where: { id: params.mappingId },
      include: {
        project: { select: { userId: true } }
      }
    })

    if (!mapping) {
      return notFoundResponse("Visual mapping not found")
    }

    if (mapping.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    await prisma.visualCheckMapping.delete({
      where: { id: params.mappingId }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete mapping" }, { status: 500 })
  }
}
