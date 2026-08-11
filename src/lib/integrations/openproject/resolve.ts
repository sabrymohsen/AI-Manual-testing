/**
 * resolveOpenProject — the single way an /integrations/openproject/* route gets
 * a live client + config for a project.
 *
 * These routes used to read `prisma.openProjectIntegration` directly. Since the
 * unified integration UI writes `ProjectIntegration` instead, a project connected
 * through it had NO legacy row, so every one of those routes answered "OpenProject
 * integration is not configured" — which the UI swallows into empty dropdowns
 * (no developers, no boards, no bug fields). Going through `loadIntegration`
 * makes them read whichever row actually owns the config.
 *
 * The returned `integration` deliberately keeps the legacy field names so the
 * route bodies that consume it stay unchanged.
 */
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { loadIntegration, type LoadedIntegration } from "@/lib/integrations/core/load-integration"
import { OpenProjectClient } from "./openproject.client"

/** Legacy-shaped view of the config, mapped from whichever row owns it. */
export interface OpenProjectConfig {
  baseUrl: string
  openProjectProjectIdentifier: string

  testCaseTypeId: string | null
  bugTypeId: string | null
  userStoryTypeId: string | null

  defaultStatusId: string | null
  notExecutedStatusId: string | null
  runningStatusId: string | null
  passedStatusId: string | null
  failedStatusId: string | null
  blockedStatusId: string | null

  parentStrategy: string | null
  defaultParentWorkPackageId: string | null

  boardStrategy: string | null
  targetBoardId: string | null
  targetColumnStatusId: string | null
  targetVersionId: string | null
  targetAssigneeId: string | null

  customFieldMapping: Record<string, unknown>

  autoSyncTestCases: boolean
  autoSyncResults: boolean
  autoCreateBugOnFailure: boolean
  autoSyncBugToOpenProject: boolean

  lastConnectionStatus: string | null
  lastConnectionCheckedAt: Date | null
  lastSyncAt: Date | null
}

export type ResolvedOpenProject =
  | {
      ok: true
      client: OpenProjectClient
      integration: OpenProjectConfig
      loaded: LoadedIntegration
      /** Decrypted API token — for callers that must build their own client. */
      apiToken: string
    }
  | { ok: false; status: number; error: string }

function toConfig(loaded: LoadedIntegration): OpenProjectConfig {
  const { row, typeMapping, statusMapping, boardConfig, parentConfig } = loaded
  return {
    baseUrl: row.baseUrl,
    openProjectProjectIdentifier: row.externalProjectKey,

    testCaseTypeId: typeMapping.testCase ?? null,
    bugTypeId: typeMapping.bug ?? null,
    userStoryTypeId: typeMapping.userStory ?? null,

    defaultStatusId: statusMapping.default ?? null,
    notExecutedStatusId: statusMapping.notExecuted ?? null,
    runningStatusId: statusMapping.running ?? null,
    passedStatusId: statusMapping.passed ?? null,
    failedStatusId: statusMapping.failed ?? null,
    blockedStatusId: statusMapping.blocked ?? null,

    parentStrategy: parentConfig.strategy ?? null,
    defaultParentWorkPackageId: parentConfig.defaultParentId ?? null,

    boardStrategy: boardConfig.strategy ?? null,
    targetBoardId: boardConfig.boardId ?? null,
    targetColumnStatusId: boardConfig.columnId ?? null,
    targetVersionId: boardConfig.versionId ?? null,
    targetAssigneeId: boardConfig.assigneeId ?? null,

    customFieldMapping: loaded.customFieldMapping,

    autoSyncTestCases: loaded.autoSyncTestCases,
    autoSyncResults: loaded.autoSyncResults,
    autoCreateBugOnFailure: loaded.autoCreateBugOnFailure,
    autoSyncBugToOpenProject: loaded.autoSyncBugToTracker,

    lastConnectionStatus: loaded.lastConnectionStatus,
    lastConnectionCheckedAt: loaded.lastConnectionCheckedAt,
    lastSyncAt: loaded.lastSyncAt,
  }
}

/**
 * Resolve a project's OpenProject connection (unified row first, legacy row as
 * fallback). Returns a discriminated result rather than throwing so routes can
 * keep their own "not configured" / "decrypt failed" responses.
 */
export async function resolveOpenProject(projectId: string): Promise<ResolvedOpenProject> {
  const loaded = await loadIntegration(projectId)

  if (!loaded || !loaded.row.apiTokenEncrypted) {
    return { ok: false, status: 400, error: "OpenProject integration is not configured" }
  }
  if (loaded.provider !== "OpenProject") {
    return {
      ok: false,
      status: 400,
      error: `This project is connected to ${loaded.provider}, not OpenProject`,
    }
  }

  let token: string
  try {
    token = decryptSecret({
      encrypted: loaded.row.apiTokenEncrypted,
      iv: loaded.row.apiTokenIv,
      authTag: loaded.row.apiTokenAuthTag,
      keyVersion: loaded.row.apiTokenKeyVersion || "v1",
    })
  } catch {
    return { ok: false, status: 500, error: "Failed to decrypt API token" }
  }

  const integration = toConfig(loaded)
  const client = new OpenProjectClient(
    integration.baseUrl,
    integration.openProjectProjectIdentifier,
    token
  )
  return { ok: true, client, integration, loaded, apiToken: token }
}

/** Stamp the last successful sync on whichever row owns the config. */
export async function persistLastSyncAt(loaded: LoadedIntegration, at: Date = new Date()): Promise<void> {
  try {
    if (loaded.source === "unified") {
      await prisma.projectIntegration.updateMany({
        where: { projectId: loaded.projectId },
        data: { lastSyncAt: at },
      })
    } else {
      await prisma.openProjectIntegration.updateMany({
        where: { projectId: loaded.projectId },
        data: { lastSyncAt: at },
      })
    }
  } catch {
    // best-effort bookkeeping — never fail the sync over it
  }
}

/** Persist a connection-test result on whichever row owns the config. */
export async function persistConnectionStatus(
  loaded: LoadedIntegration,
  status: string
): Promise<void> {
  const data = { lastConnectionStatus: status, lastConnectionCheckedAt: new Date() }
  try {
    if (loaded.source === "unified") {
      await prisma.projectIntegration.updateMany({ where: { projectId: loaded.projectId }, data })
    } else {
      await prisma.openProjectIntegration.updateMany({ where: { projectId: loaded.projectId }, data })
    }
  } catch {
    // best-effort bookkeeping — never fail the request over it
  }
}
