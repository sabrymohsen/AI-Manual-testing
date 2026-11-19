/**
 * GET/POST /api/projects/[projectId]/integrations/openproject/features/[featureId]/config
 *
 * Per-feature OpenProject configuration. null fields inherit from the project-level
 * OpenProjectIntegration record. Token is AES-256-GCM encrypted; never returned in GET.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { encryptSecret, decryptSecret } from "@/lib/crypto"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"
import { z } from "zod"

const schema = z.object({
  // null = clear override and inherit from project
  baseUrl: z.string().nullable().optional(),
  openProjectProjectIdentifier: z.string().nullable().optional(),
  apiToken: z.string().nullable().optional(), // only sent when changing token; null = clear

  testCaseTypeId: z.string().nullable().optional(),
  passedStatusId: z.string().nullable().optional(),
  failedStatusId: z.string().nullable().optional(),
  blockedStatusId: z.string().nullable().optional(),
  defaultStatusId: z.string().nullable().optional(),

  targetBoardId: z.string().nullable().optional(),
  targetBoardType: z.string().nullable().optional(),
  targetColumnStatusId: z.string().nullable().optional(),
  targetVersionId: z.string().nullable().optional(),
})

type Params = { params: { projectId: string; featureId: string } }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const cfg = await prisma.openProjectFeatureConfig.findUnique({
    where: { projectId_featureId: { projectId: params.projectId, featureId: params.featureId } },
  })

  // Also fetch project integration to compute effective values and isComplete —
  // from whichever row owns it (unified ProjectIntegration or legacy).
  const resolvedProj = await resolveOpenProject(params.projectId)
  const proj = resolvedProj.ok
    ? { ...resolvedProj.integration, apiTokenEncrypted: true as const }
    : null

  const effective = {
    baseUrl: cfg?.baseUrl || proj?.baseUrl || null,
    openProjectProjectIdentifier: cfg?.openProjectProjectIdentifier || proj?.openProjectProjectIdentifier || null,
    hasToken: !!(cfg?.apiTokenEncrypted || proj?.apiTokenEncrypted),
    testCaseTypeId: cfg?.testCaseTypeId || proj?.testCaseTypeId || null,
    passedStatusId: cfg?.passedStatusId || proj?.passedStatusId || null,
    failedStatusId: cfg?.failedStatusId || proj?.failedStatusId || null,
    blockedStatusId: cfg?.blockedStatusId || proj?.blockedStatusId || null,
    defaultStatusId: cfg?.defaultStatusId || proj?.defaultStatusId || null,
  }

  const isComplete = !!(
    effective.baseUrl &&
    effective.hasToken &&
    effective.openProjectProjectIdentifier &&
    (effective.passedStatusId || effective.failedStatusId || effective.defaultStatusId)
  )

  return NextResponse.json({
    config: cfg
      ? {
          baseUrl: cfg.baseUrl,
          openProjectProjectIdentifier: cfg.openProjectProjectIdentifier,
          hasOwnToken: !!cfg.apiTokenEncrypted,
          testCaseTypeId: cfg.testCaseTypeId,
          passedStatusId: cfg.passedStatusId,
          failedStatusId: cfg.failedStatusId,
          blockedStatusId: cfg.blockedStatusId,
          defaultStatusId: cfg.defaultStatusId,
          targetBoardId: cfg.targetBoardId,
          targetBoardType: cfg.targetBoardType,
          targetColumnStatusId: cfg.targetColumnStatusId,
          targetVersionId: cfg.targetVersionId,
          lastSyncAt: cfg.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: cfg.lastSyncStatus,
          lastSyncError: cfg.lastSyncError,
        }
      : null,
    effective,
    isComplete,
    projectHasIntegration: !!proj?.apiTokenEncrypted,
  })
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    )
  }
  const data = parsed.data

  // Normalize base URL if provided
  let cleanBaseUrl: string | null = null
  if (data.baseUrl && data.baseUrl.trim()) {
    const raw = data.baseUrl.trim()
    const match = raw.match(/^(https?:\/\/[^\/\?#]+)/)
    cleanBaseUrl = match ? match[1] : raw.replace(/\/$/, "")
    if (!cleanBaseUrl.startsWith("http")) cleanBaseUrl = `https://${cleanBaseUrl}`
  } else if (data.baseUrl === null) {
    cleanBaseUrl = null // explicit clear
  }

  // Normalize project identifier if provided
  let cleanIdentifier: string | null = null
  if (data.openProjectProjectIdentifier && data.openProjectProjectIdentifier.trim()) {
    const raw = data.openProjectProjectIdentifier.trim()
    const match = raw.match(/\/projects\/([^\/\?#]+)/)
    cleanIdentifier = match ? match[1] : raw.replace(/[\/\?#].*/g, "")
  } else if (data.openProjectProjectIdentifier === null) {
    cleanIdentifier = null
  }

  // Encrypt token if provided
  let tokenData: {
    apiTokenEncrypted?: string | null
    apiTokenIv?: string | null
    apiTokenAuthTag?: string | null
    apiTokenKeyVersion?: string
  } = {}

  if (data.apiToken && data.apiToken.trim()) {
    const enc = encryptSecret(data.apiToken.trim())
    tokenData = {
      apiTokenEncrypted: enc.encrypted,
      apiTokenIv: enc.iv,
      apiTokenAuthTag: enc.authTag,
      apiTokenKeyVersion: enc.keyVersion,
    }
  } else if (data.apiToken === null) {
    // Explicit clear — revert to inheriting project token
    tokenData = {
      apiTokenEncrypted: null,
      apiTokenIv: null,
      apiTokenAuthTag: null,
    }
  }

  const upsertData = {
    ...(cleanBaseUrl !== undefined ? { baseUrl: cleanBaseUrl } : {}),
    ...(cleanIdentifier !== undefined ? { openProjectProjectIdentifier: cleanIdentifier } : {}),
    ...tokenData,
    ...(data.testCaseTypeId !== undefined ? { testCaseTypeId: data.testCaseTypeId } : {}),
    ...(data.passedStatusId !== undefined ? { passedStatusId: data.passedStatusId } : {}),
    ...(data.failedStatusId !== undefined ? { failedStatusId: data.failedStatusId } : {}),
    ...(data.blockedStatusId !== undefined ? { blockedStatusId: data.blockedStatusId } : {}),
    ...(data.defaultStatusId !== undefined ? { defaultStatusId: data.defaultStatusId } : {}),
    ...(data.targetBoardId !== undefined ? { targetBoardId: data.targetBoardId } : {}),
    ...(data.targetBoardType !== undefined ? { targetBoardType: data.targetBoardType } : {}),
    ...(data.targetColumnStatusId !== undefined ? { targetColumnStatusId: data.targetColumnStatusId } : {}),
    ...(data.targetVersionId !== undefined ? { targetVersionId: data.targetVersionId } : {}),
  }

  try {
    await prisma.openProjectFeatureConfig.upsert({
      where: { projectId_featureId: { projectId: params.projectId, featureId: params.featureId } },
      create: { projectId: params.projectId, featureId: params.featureId, ...upsertData },
      update: upsertData,
    })
  } catch (err: any) {
    console.error("[module config POST] Prisma error:", err)
    return NextResponse.json({ error: err?.message || "Database error" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
