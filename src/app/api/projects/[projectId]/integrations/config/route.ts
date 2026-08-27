/**
 * GET/PUT /api/projects/[projectId]/integrations/config
 *
 * Unified, provider-agnostic integration config (Jira / Azure DevOps / ClickUp /
 * OpenProject) backed by the ProjectIntegration model. The API token is encrypted
 * and never returned. On first enabling inbound sync a webhook secret is minted.
 */
import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { encryptSecret, EncryptionKeyError } from "@/lib/crypto"
import { providerLabels } from "@/lib/integrations/labels"
import { syncProjectTeam } from "@/lib/team/sync-team"

const schema = z.object({
  provider: z.enum(["OpenProject", "Jira", "AzureDevOps", "ClickUp"]),
  enabled: z.boolean().optional(),
  baseUrl: z.string().optional(),
  externalProjectKey: z.string().min(1, "Project key / list id is required"),
  username: z.string().nullable().optional(),
  apiToken: z.string().optional(), // only sent when changing
  typeMapping: z.any().optional(),
  statusMapping: z.any().optional(),
  boardConfig: z.any().optional(),
  parentConfig: z.any().optional(),
  customFieldMapping: z.any().optional(),
  autoSyncTestCases: z.boolean().optional(),
  autoSyncResults: z.boolean().optional(),
  autoCreateBugOnFailure: z.boolean().optional(),
  autoSyncBugToTracker: z.boolean().optional(),
  inboundSyncEnabled: z.boolean().optional(),
})

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const i = await prisma.projectIntegration.findUnique({ where: { projectId: params.projectId } })
  if (!i) return NextResponse.json({ integration: null })

  return NextResponse.json({
    integration: {
      provider: i.provider,
      label: providerLabels(i.provider).name,
      enabled: i.enabled,
      baseUrl: i.baseUrl,
      externalProjectKey: i.externalProjectKey,
      username: i.username,
      hasToken: !!i.apiTokenEncrypted,
      typeMapping: i.typeMapping,
      statusMapping: i.statusMapping,
      boardConfig: i.boardConfig,
      parentConfig: i.parentConfig,
      customFieldMapping: i.customFieldMapping,
      autoSyncTestCases: i.autoSyncTestCases,
      autoSyncResults: i.autoSyncResults,
      autoCreateBugOnFailure: i.autoCreateBugOnFailure,
      autoSyncBugToTracker: i.autoSyncBugToTracker,
      inboundSyncEnabled: i.inboundSyncEnabled,
      hasWebhookSecret: !!i.webhookSecret,
      // Owner-only route — the secret is needed to register the webhook externally.
      webhookSecret: i.webhookSecret,
      lastConnectionStatus: i.lastConnectionStatus,
      lastConnectionCheckedAt: i.lastConnectionCheckedAt?.toISOString() ?? null,
      lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      lastInboundAt: i.lastInboundAt?.toISOString() ?? null,
    },
  })
}

export async function PUT(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  }
  const d = parsed.data

  const existing = await prisma.projectIntegration.findUnique({ where: { projectId: params.projectId } })
  if (!existing && (!d.apiToken || !d.apiToken.trim())) {
    return NextResponse.json({ error: "API token is required to connect" }, { status: 400 })
  }

  let tokenData: Record<string, string> = {}
  if (d.apiToken && d.apiToken.trim()) {
    try {
      const enc = encryptSecret(d.apiToken.trim())
      tokenData = {
        apiTokenEncrypted: enc.encrypted,
        apiTokenIv: enc.iv,
        apiTokenAuthTag: enc.authTag,
        apiTokenKeyVersion: enc.keyVersion,
      }
    } catch (err) {
      console.error("[integrations/config] token encryption failed:", err)
      // A misconfigured key is an operator problem, not a bug in this
      // route — say which variable is wrong instead of a dead end.
      const message =
        err instanceof EncryptionKeyError ? err.message : "Failed to encrypt API token"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Mint a webhook secret the first time inbound sync is enabled.
  const needsSecret = d.inboundSyncEnabled && !existing?.webhookSecret
  const webhookSecret = needsSecret ? crypto.randomBytes(24).toString("hex") : undefined

  const common = {
    provider: d.provider,
    enabled: d.enabled ?? true,
    baseUrl: (d.baseUrl ?? "").trim(),
    externalProjectKey: d.externalProjectKey.trim(),
    username: d.username ?? null,
    typeMapping: d.typeMapping ?? undefined,
    statusMapping: d.statusMapping ?? undefined,
    boardConfig: d.boardConfig ?? undefined,
    parentConfig: d.parentConfig ?? undefined,
    customFieldMapping: d.customFieldMapping ?? undefined,
    autoSyncTestCases: d.autoSyncTestCases ?? undefined,
    autoSyncResults: d.autoSyncResults ?? undefined,
    autoCreateBugOnFailure: d.autoCreateBugOnFailure ?? undefined,
    autoSyncBugToTracker: d.autoSyncBugToTracker ?? undefined,
    inboundSyncEnabled: d.inboundSyncEnabled ?? undefined,
    ...(webhookSecret ? { webhookSecret } : {}),
  }

  await prisma.projectIntegration.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      ...common,
      apiTokenEncrypted: tokenData.apiTokenEncrypted || "",
      apiTokenIv: tokenData.apiTokenIv || "",
      apiTokenAuthTag: tokenData.apiTokenAuthTag || "",
      apiTokenKeyVersion: tokenData.apiTokenKeyVersion || "v1",
    },
    update: { ...common, ...tokenData },
  })

  // Fill the assignee pool from the tracker right away, so the developer
  // dropdowns in the bug and test-case forms work as soon as it's connected.
  // Best-effort: a tracker that's unreachable must not fail the save.
  let teamSynced: number | null = null
  try {
    const synced = await syncProjectTeam(params.projectId)
    if (synced.ok) teamSynced = synced.synced
  } catch {
    // ignored — the Team tab's Sync button remains available
  }

  return NextResponse.json({
    success: true,
    message: `${providerLabels(d.provider).name} settings saved`,
    teamSynced,
  })
}
