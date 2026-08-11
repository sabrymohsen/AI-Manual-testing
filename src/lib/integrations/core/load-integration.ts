/**
 * loadIntegration — the single entry point shared sync code uses to obtain a
 * project's integration config + a live WorkItemProvider.
 *
 * Reads the unified ProjectIntegration row when present; otherwise falls back to
 * the legacy OpenProjectIntegration and maps it into the unified shape. This lets
 * existing OpenProject projects keep working unchanged (their config UI/routes
 * still write OpenProjectIntegration) while new providers use ProjectIntegration —
 * no destructive data migration required.
 */
import { prisma } from "@/lib/db"
import { getProvider, type IntegrationRow } from "./factory"
import type { WorkItemProvider } from "./provider"
import type { ProviderId } from "./types"

export interface TypeMapping {
  testCase?: string | null
  bug?: string | null
  userStory?: string | null
}

export interface StatusMapping {
  default?: string | null
  notExecuted?: string | null
  running?: string | null
  passed?: string | null
  failed?: string | null
  blocked?: string | null
  [localStatus: string]: string | null | undefined
}

export interface BoardConfig {
  strategy?: string | null
  boardId?: string | null
  columnId?: string | null
  versionId?: string | null
  assigneeId?: string | null
}

export interface ParentConfig {
  strategy?: string | null
  defaultParentId?: string | null
}

export interface LoadedIntegration {
  source: "unified" | "legacy-openproject"
  projectId: string
  provider: ProviderId
  enabled: boolean
  row: IntegrationRow
  /** Connection/sync bookkeeping of the owning row (same columns on both models). */
  lastConnectionStatus: string | null
  lastConnectionCheckedAt: Date | null
  lastSyncAt: Date | null
  typeMapping: TypeMapping
  statusMapping: StatusMapping
  boardConfig: BoardConfig
  parentConfig: ParentConfig
  customFieldMapping: Record<string, unknown>
  autoSyncTestCases: boolean
  autoSyncResults: boolean
  autoCreateBugOnFailure: boolean
  autoSyncBugToTracker: boolean
  inboundSyncEnabled: boolean
  webhookSecret: string | null
  /** Instantiate the provider client (decrypts token). */
  getClient(): WorkItemProvider
}

function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as Record<string, any>) : {}
}

export async function loadIntegration(projectId: string): Promise<LoadedIntegration | null> {
  const unified = await prisma.projectIntegration.findUnique({ where: { projectId } })
  if (unified && unified.enabled !== false) {
    const row: IntegrationRow = {
      provider: unified.provider,
      baseUrl: unified.baseUrl,
      externalProjectKey: unified.externalProjectKey,
      username: unified.username,
      apiTokenEncrypted: unified.apiTokenEncrypted,
      apiTokenIv: unified.apiTokenIv,
      apiTokenAuthTag: unified.apiTokenAuthTag,
      apiTokenKeyVersion: unified.apiTokenKeyVersion,
      webhookSecret: unified.webhookSecret,
    }
    return {
      source: "unified",
      projectId,
      provider: unified.provider as ProviderId,
      enabled: unified.enabled,
      row,
      lastConnectionStatus: unified.lastConnectionStatus,
      lastConnectionCheckedAt: unified.lastConnectionCheckedAt,
      lastSyncAt: unified.lastSyncAt,
      typeMapping: asObject(unified.typeMapping) as TypeMapping,
      statusMapping: asObject(unified.statusMapping) as StatusMapping,
      boardConfig: asObject(unified.boardConfig) as BoardConfig,
      parentConfig: asObject(unified.parentConfig) as ParentConfig,
      customFieldMapping: asObject(unified.customFieldMapping),
      autoSyncTestCases: unified.autoSyncTestCases,
      autoSyncResults: unified.autoSyncResults,
      autoCreateBugOnFailure: unified.autoCreateBugOnFailure,
      autoSyncBugToTracker: unified.autoSyncBugToTracker,
      inboundSyncEnabled: unified.inboundSyncEnabled,
      webhookSecret: unified.webhookSecret,
      getClient: () => getProvider(row),
    }
  }

  // ── Legacy OpenProject fallback ────────────────────────────────────────────
  const op = await prisma.openProjectIntegration.findUnique({ where: { projectId } })
  if (!op?.apiTokenEncrypted) return null

  const row: IntegrationRow = {
    provider: "OpenProject",
    baseUrl: op.baseUrl,
    externalProjectKey: op.openProjectProjectIdentifier,
    username: null,
    apiTokenEncrypted: op.apiTokenEncrypted,
    apiTokenIv: op.apiTokenIv,
    apiTokenAuthTag: op.apiTokenAuthTag,
    apiTokenKeyVersion: op.apiTokenKeyVersion,
    webhookSecret: null,
  }
  return {
    source: "legacy-openproject",
    projectId,
    provider: "OpenProject",
    enabled: true,
    row,
    lastConnectionStatus: op.lastConnectionStatus,
    lastConnectionCheckedAt: op.lastConnectionCheckedAt,
    lastSyncAt: op.lastSyncAt,
    typeMapping: {
      testCase: op.testCaseTypeId,
      bug: op.bugTypeId,
      userStory: op.userStoryTypeId,
    },
    statusMapping: {
      default: op.defaultStatusId,
      notExecuted: op.notExecutedStatusId,
      running: op.runningStatusId,
      passed: op.passedStatusId,
      failed: op.failedStatusId,
      blocked: op.blockedStatusId,
    },
    boardConfig: {
      strategy: op.boardStrategy,
      boardId: op.targetBoardId,
      columnId: op.targetColumnStatusId,
      versionId: op.targetVersionId,
      assigneeId: op.targetAssigneeId,
    },
    parentConfig: {
      strategy: op.parentStrategy,
      defaultParentId: op.defaultParentWorkPackageId,
    },
    customFieldMapping: asObject(op.customFieldMapping),
    autoSyncTestCases: op.autoSyncTestCases,
    autoSyncResults: op.autoSyncResults,
    autoCreateBugOnFailure: op.autoCreateBugOnFailure,
    autoSyncBugToTracker: op.autoSyncBugToOpenProject,
    inboundSyncEnabled: false,
    webhookSecret: null,
    getClient: () => getProvider(row),
  }
}

/** Persist the bug type id back when auto-detected, on whichever source owns it. */
export async function persistDetectedBugType(
  loaded: LoadedIntegration,
  bugTypeId: string
): Promise<void> {
  try {
    if (loaded.source === "unified") {
      await prisma.projectIntegration.update({
        where: { projectId: loaded.projectId },
        data: { typeMapping: { ...loaded.typeMapping, bug: bugTypeId } },
      })
    } else {
      await prisma.openProjectIntegration.update({
        where: { projectId: loaded.projectId },
        data: { bugTypeId },
      })
    }
  } catch {
    // best-effort — must not fail the sync
  }
}
