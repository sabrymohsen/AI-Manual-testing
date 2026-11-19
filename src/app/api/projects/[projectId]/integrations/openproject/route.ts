/**
 * GET/POST /api/projects/[projectId]/integrations/openproject
 * 
 * OpenProject integration settings CRUD.
 * Token is encrypted in DB and never returned in GET responses.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { encryptSecret, EncryptionKeyError } from "@/lib/crypto"
import { z } from "zod"

const settingsSchema = z.object({
  baseUrl: z.string().min(1, "Base URL is required"),
  openProjectProjectIdentifier: z.string().min(1, "Project identifier is required"),
  apiToken: z.string().optional(), // Only sent when changing token

  testCaseTypeId: z.string().nullable().optional(),
  bugTypeId: z.string().nullable().optional(),

  defaultStatusId: z.string().nullable().optional(),
  notExecutedStatusId: z.string().nullable().optional(),
  runningStatusId: z.string().nullable().optional(),
  passedStatusId: z.string().nullable().optional(),
  failedStatusId: z.string().nullable().optional(),
  blockedStatusId: z.string().nullable().optional(),

  parentStrategy: z.enum(["None", "SingleParent", "ByModule", "ByFeature", "ByRequirement", "ByTestSuite"]).optional(),
  defaultParentWorkPackageId: z.string().nullable().optional(),

  boardStrategy: z.enum(["StatusBased", "ParentChildBased", "TypeBased", "VersionBased", "CustomFieldBased"]).optional(),
  targetBoardId: z.string().nullable().optional(),
  targetColumnStatusId: z.string().nullable().optional(),
  targetVersionId: z.string().nullable().optional(),
  targetAssigneeId: z.string().nullable().optional(),
  customFieldMapping: z.any().optional(),

  autoSyncTestCases: z.boolean().optional(),
  autoSyncResults: z.boolean().optional(),
  autoCreateBugOnFailure: z.boolean().optional(),
  autoSyncBugToOpenProject: z.boolean().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: params.projectId },
  })

  if (!integration) {
    return NextResponse.json({ integration: null })
  }

  // Never expose the token
  return NextResponse.json({
    integration: {
      id: integration.id,
      baseUrl: integration.baseUrl,
      openProjectProjectIdentifier: integration.openProjectProjectIdentifier,
      hasToken: !!integration.apiTokenEncrypted,

      testCaseTypeId: integration.testCaseTypeId,
      bugTypeId: integration.bugTypeId,

      defaultStatusId: integration.defaultStatusId,
      notExecutedStatusId: integration.notExecutedStatusId,
      runningStatusId: integration.runningStatusId,
      passedStatusId: integration.passedStatusId,
      failedStatusId: integration.failedStatusId,
      blockedStatusId: integration.blockedStatusId,

      parentStrategy: integration.parentStrategy,
      defaultParentWorkPackageId: integration.defaultParentWorkPackageId,

      boardStrategy: integration.boardStrategy,
      targetBoardId: integration.targetBoardId,
      targetColumnStatusId: integration.targetColumnStatusId,
      targetVersionId: integration.targetVersionId,
      targetAssigneeId: integration.targetAssigneeId,
      customFieldMapping: integration.customFieldMapping,

      autoSyncTestCases: integration.autoSyncTestCases,
      autoSyncResults: integration.autoSyncResults,
      autoCreateBugOnFailure: integration.autoCreateBugOnFailure,
      autoSyncBugToOpenProject: integration.autoSyncBugToOpenProject,

      lastConnectionStatus: integration.lastConnectionStatus,
      lastConnectionCheckedAt: integration.lastConnectionCheckedAt?.toISOString() ?? null,
      lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    )
  }

  const data = parsed.data

  // Normalize base URL
  let cleanBaseUrl = data.baseUrl.trim()
  const hostMatch = cleanBaseUrl.match(/^(https?:\/\/[^\/\?#]+)/)
  cleanBaseUrl = hostMatch ? hostMatch[1] : cleanBaseUrl.replace(/\/$/, "")
  if (!cleanBaseUrl.startsWith("http")) cleanBaseUrl = `https://${cleanBaseUrl}`

  // Normalize project identifier
  let cleanIdentifier = data.openProjectProjectIdentifier.trim()
  const projMatch = cleanIdentifier.match(/\/projects\/([^\/\?#]+)/)
  if (projMatch) cleanIdentifier = projMatch[1]
  else cleanIdentifier = cleanIdentifier.replace(/[\/\?#].*/g, "")

  // Build token encryption if new token provided
  let tokenData: Record<string, string> = {}
  if (data.apiToken && data.apiToken.trim().length > 0) {
    try {
      const encrypted = encryptSecret(data.apiToken.trim())
      tokenData = {
        apiTokenEncrypted: encrypted.encrypted,
        apiTokenIv: encrypted.iv,
        apiTokenAuthTag: encrypted.authTag,
        apiTokenKeyVersion: encrypted.keyVersion,
      }
    } catch (err) {
      console.error("[openproject] Token encryption failed:", err)
      // A misconfigured key is an operator problem, not a bug in this
      // route — say which variable is wrong instead of a dead end.
      const message =
        err instanceof EncryptionKeyError ? err.message : "Failed to encrypt API token"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  const upsertData = {
    baseUrl: cleanBaseUrl,
    openProjectProjectIdentifier: cleanIdentifier,
    ...tokenData,

    testCaseTypeId: data.testCaseTypeId ?? null,
    bugTypeId: data.bugTypeId ?? null,

    defaultStatusId: data.defaultStatusId ?? null,
    notExecutedStatusId: data.notExecutedStatusId ?? null,
    runningStatusId: data.runningStatusId ?? null,
    passedStatusId: data.passedStatusId ?? null,
    failedStatusId: data.failedStatusId ?? null,
    blockedStatusId: data.blockedStatusId ?? null,

    parentStrategy: (data.parentStrategy as any) || "None",
    defaultParentWorkPackageId: data.defaultParentWorkPackageId ?? null,

    boardStrategy: (data.boardStrategy as any) || "StatusBased",
    targetBoardId: data.targetBoardId ?? null,
    targetColumnStatusId: data.targetColumnStatusId ?? null,
    targetVersionId: data.targetVersionId ?? null,
    targetAssigneeId: data.targetAssigneeId ?? null,
    customFieldMapping: data.customFieldMapping ?? undefined,

    autoSyncTestCases: data.autoSyncTestCases ?? false,
    autoSyncResults: data.autoSyncResults ?? true,
    autoCreateBugOnFailure: data.autoCreateBugOnFailure ?? true,
    autoSyncBugToOpenProject: data.autoSyncBugToOpenProject ?? false,
  }

  const integration = await prisma.openProjectIntegration.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      ...upsertData,
      // Ensure token fields exist on create
      apiTokenEncrypted: tokenData.apiTokenEncrypted || "",
      apiTokenIv: tokenData.apiTokenIv || "",
      apiTokenAuthTag: tokenData.apiTokenAuthTag || "",
      apiTokenKeyVersion: tokenData.apiTokenKeyVersion || "v1",
    },
    update: upsertData,
  })

  // Also update legacy IntegrationConfig to mark openproject as enabled
  await prisma.integrationConfig.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      provider: "openproject",
      enabled: true,
      host: cleanBaseUrl,
      projectKey: cleanIdentifier,
    },
    update: {
      provider: "openproject",
      enabled: true,
      host: cleanBaseUrl,
      projectKey: cleanIdentifier,
    },
  })

  return NextResponse.json({
    success: true,
    message: "OpenProject settings saved",
    hasToken: !!integration.apiTokenEncrypted,
  })
}
