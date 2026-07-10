/**
 * OpenProject Group Sync Service
 *
 * Provides group-scoped (feature-level) sync operations for OpenProject integration.
 * Reuses OpenProjectClient and the existing sync patterns from bulk sync routes.
 *
 * groupId = Feature.id | "unassigned".
 *
 * Test cases no longer carry direct classification — a test case's group is
 * derived through its story links: the feature of the linked story whose
 * TestCaseRequirement link row has the earliest createdAt (oldest link wins);
 * if that story has no feature, fall through to the next-oldest linked story
 * that has one; if none, the test case is "unassigned".
 */

import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient, OpSyncItemResult } from "./openproject.client"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import * as coreGroup from "@/lib/integrations/core/group-sync"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

/**
 * When a project is on the unified ProjectIntegration model (any provider,
 * including OpenProject-via-unified), group sync is handled by the provider-
 * agnostic core engine. Legacy OpenProject-only projects (OpenProjectIntegration
 * table) fall through to the battle-tested logic below — no behavior change.
 * Returns the provider id to delegate with, or null to use the legacy path.
 */
async function unifiedProvider(projectId: string): Promise<string | null> {
  try {
    const loaded = await loadIntegration(projectId)
    return loaded?.source === "unified" ? loaded.provider : null
  } catch {
    return null
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GroupInfo {
  groupId: string
  groupType: "Feature" | "Unassigned"
  groupName: string
  totalCases: number
  passed: number
  failed: number
  untested: number
  openProject: GroupOpStatus
}

export interface GroupOpStatus {
  parentMapped: boolean
  parentId: string | null
  parentSubject: string | null
  parentUrl: string | null
  syncedCount: number
  failedSyncCount: number
  boardReadyCount: number
  lastSyncAt: string | null
}

export interface GroupSyncResult {
  groupId: string
  groupName: string
  total: number
  created: number
  updated: number
  failed: number
  skipped: number
  parentLinked: number
  results: OpSyncItemResult[]
}

export interface GroupBoardCheckResult {
  groupId: string
  groupName: string
  total: number
  boardReady: number
  missingParent: number
  missingStatus: number
  notSynced: number
  items: Array<{
    testCaseId: string
    testCaseTitle: string
    externalId: string | null
    status: "Ready" | "Not Ready" | "Not Synced"
    issues: string[]
  }>
}

export interface GroupSyncedItem {
  testCaseId: string
  testCaseTitle: string
  localStatus: string | null
  externalId: string | null
  externalUrl: string | null
  parentLinked: boolean
  lastSyncStatus: string | null
  lastSyncAt: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getClientAndIntegration(projectId: string, featureId?: string) {
  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId },
  })

  // Load feature-level config override when featureId is provided
  const modCfg = featureId
    ? await prisma.openProjectFeatureConfig.findUnique({
        where: { projectId_featureId: { projectId, featureId } },
      })
    : null

  // Resolve effective connection params: feature override → project fallback
  const baseUrl = modCfg?.baseUrl || integration?.baseUrl
  const identifier = modCfg?.openProjectProjectIdentifier || integration?.openProjectProjectIdentifier

  let token: string | null = null
  if (modCfg?.apiTokenEncrypted) {
    token = decryptSecret({
      encrypted: modCfg.apiTokenEncrypted,
      iv: modCfg.apiTokenIv!,
      authTag: modCfg.apiTokenAuthTag!,
      keyVersion: modCfg.apiTokenKeyVersion,
    })
  } else if (integration?.apiTokenEncrypted) {
    token = decryptSecret({
      encrypted: integration.apiTokenEncrypted,
      iv: integration.apiTokenIv,
      authTag: integration.apiTokenAuthTag,
      keyVersion: integration.apiTokenKeyVersion,
    })
  }

  if (!baseUrl || !identifier || !token) {
    throw new Error("OpenProject integration is not configured. Add connection details in Project Settings or feature config.")
  }

  const client = new OpenProjectClient(baseUrl, identifier, token)

  // Build effective integration data merging module overrides onto project defaults
  const effective = {
    ...(integration || {}),
    testCaseTypeId: modCfg?.testCaseTypeId || integration?.testCaseTypeId || null,
    passedStatusId: modCfg?.passedStatusId || integration?.passedStatusId || null,
    failedStatusId: modCfg?.failedStatusId || integration?.failedStatusId || null,
    blockedStatusId: modCfg?.blockedStatusId || integration?.blockedStatusId || null,
    defaultStatusId: modCfg?.defaultStatusId || integration?.defaultStatusId || null,
    targetVersionId: modCfg?.targetVersionId || integration?.targetVersionId || null,
    targetBoardId: modCfg?.targetBoardId || integration?.targetBoardId || null,
    targetColumnStatusId: modCfg?.targetColumnStatusId || integration?.targetColumnStatusId || null,
  } as NonNullable<typeof integration>

  return { client, integration: effective, modCfg }
}

/**
 * Derive a test case's group (feature id or "unassigned") from its story
 * links, using the earliest-created link whose story has a feature.
 */
function deriveGroupId(links: Array<{ createdAt: Date; requirement: { featureId: string | null } }>): string {
  const ordered = [...links].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const link of ordered) {
    if (link.requirement.featureId) return link.requirement.featureId
  }
  return "unassigned"
}

async function getAllTestCasesWithGroup(projectId: string) {
  const testCases = await prisma.testCase.findMany({
    where: { projectId },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      requirements: {
        select: { createdAt: true, requirement: { select: { featureId: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  })
  return testCases.map(tc => ({ ...tc, groupId: deriveGroupId(tc.requirements) }))
}

async function getGroupTestCases(projectId: string, groupId: string) {
  const all = await getAllTestCasesWithGroup(projectId)
  return all.filter(tc => tc.groupId === groupId)
}

async function getGroupName(projectId: string, groupId: string): Promise<string> {
  if (groupId === "unassigned") return "Unassigned"
  const feature = await prisma.feature.findFirst({ where: { id: groupId, projectId }, select: { name: true } })
  return feature?.name || "Unknown Feature"
}

function buildTestCaseDescription(tc: any, projectName: string, featureName?: string): string {
  let md = `## Test Case\n\n`
  md += `**Local Test Case ID:** \`${tc.id}\`\n`
  md += `**Project:** ${projectName}\n`
  if (featureName && featureName !== "Unassigned") md += `**Feature:** ${featureName}\n`
  md += `**Priority:** ${tc.priority}\n`
  md += `**Source:** ${tc.source}\n\n`

  if (tc.preconditions) {
    md += `## Preconditions\n`
    for (const line of tc.preconditions.split("\n").filter(Boolean)) {
      md += `- ${line}\n`
    }
    md += "\n"
  }

  if (tc.steps?.length > 0) {
    md += `## Steps\n\n| Step | Action | Expected Result |\n|---|---|---|\n`
    for (const s of tc.steps) {
      const action = s.actionDescription.replace(/\|/g, "\\|")
      const expected = (s.expectedResult || "").replace(/\|/g, "\\|")
      md += `| ${s.stepNumber} | ${action} | ${expected} |\n`
    }
    md += "\n"
  }

  md += `## Latest Execution Result\nNot Executed\n\n`
  md += `*Generated from [QA Engine](${APP_URL})*\n\n`
  md += `<!-- AI-Manual-QA-Tester:TestCase:${tc.id} -->`
  return md
}

// ─── Core Functions ───────────────────────────────────────────────────────────

export async function getAllGroupsWithStatus(projectId: string): Promise<GroupInfo[]> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.getAllGroupsWithStatus(projectId, up)

  // Load all features for this project
  const features = await prisma.feature.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true },
  })

  // Load all test cases with their derived group (via story links)
  const allTestCases = await getAllTestCasesWithGroup(projectId)

  // Load all sync mappings for test cases
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase" },
    select: { localEntityId: true, lastSyncStatus: true, lastSyncedAt: true },
  })
  const syncMap = new Map(syncMappings.map(m => [m.localEntityId, m]))

  // Load latest run results for pass/fail/untested counts
  const latestRuns = await prisma.testRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { testCaseId: true, status: true },
  })
  const latestRunMap = new Map<string, string>()
  for (const run of latestRuns) {
    if (run.testCaseId && !latestRunMap.has(run.testCaseId)) {
      latestRunMap.set(run.testCaseId, run.status)
    }
  }

  // Load parent mappings
  const parentMappings = await prisma.openProjectParentMapping.findMany({
    where: { projectId, mappingType: "Feature" },
  })
  const parentMap = new Map(parentMappings.map(m => [m.localEntityId, m]))

  const results: GroupInfo[] = []

  // Build a group for each feature
  for (const feature of features) {
    const tcIds = allTestCases.filter(tc => tc.groupId === feature.id).map(tc => tc.id)
    const opInfo = buildGroupOpStatus(tcIds, syncMap, feature.id, parentMap)
    const runStats = buildRunStats(tcIds, latestRunMap)

    results.push({
      groupId: feature.id,
      groupType: "Feature",
      groupName: feature.name,
      totalCases: tcIds.length,
      ...runStats,
      openProject: opInfo,
    })
  }

  // Add unassigned group for test cases with no story-derived feature
  const unassignedIds = allTestCases.filter(tc => tc.groupId === "unassigned").map(tc => tc.id)
  if (unassignedIds.length > 0) {
    const opInfo = buildGroupOpStatus(unassignedIds, syncMap, "unassigned", parentMap)
    const runStats = buildRunStats(unassignedIds, latestRunMap)

    results.push({
      groupId: "unassigned",
      groupType: "Unassigned",
      groupName: "Unassigned",
      totalCases: unassignedIds.length,
      ...runStats,
      openProject: opInfo,
    })
  }

  return results
}

function buildGroupOpStatus(
  tcIds: string[],
  syncMap: Map<string, { lastSyncStatus: string | null; lastSyncedAt: Date | null }>,
  groupId: string,
  parentMap: Map<string, any>
): GroupOpStatus {
  let syncedCount = 0
  let failedSyncCount = 0
  let lastSyncAt: Date | null = null

  for (const id of tcIds) {
    const m = syncMap.get(id)
    if (m) {
      if (m.lastSyncStatus === "success") syncedCount++
      else if (m.lastSyncStatus === "failed") failedSyncCount++
      if (m.lastSyncedAt && (!lastSyncAt || m.lastSyncedAt > lastSyncAt)) {
        lastSyncAt = m.lastSyncedAt
      }
    }
  }

  const parentMapping = parentMap.get(groupId)

  return {
    parentMapped: !!parentMapping,
    parentId: parentMapping?.openProjectParentId || null,
    parentSubject: parentMapping?.openProjectParentSubject || null,
    parentUrl: parentMapping?.openProjectParentUrl || null,
    syncedCount,
    failedSyncCount,
    boardReadyCount: syncedCount, // approximated — updated by checkGroupBoardVisibility
    lastSyncAt: lastSyncAt?.toISOString() || null,
  }
}

function buildRunStats(tcIds: string[], latestRunMap: Map<string, string>) {
  let passed = 0
  let failed = 0
  let untested = 0

  for (const id of tcIds) {
    const status = latestRunMap.get(id)
    if (!status) untested++
    else if (status === "Passed") passed++
    else if (status === "Failed" || status === "Blocked") failed++
    else untested++
  }

  return { passed, failed, untested }
}

export async function getGroupSyncStatus(projectId: string, groupId: string): Promise<GroupInfo> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.getGroupSyncStatus(projectId, groupId, up)

  const groups = await getAllGroupsWithStatus(projectId)
  const group = groups.find(g => g.groupId === groupId)
  if (!group) throw new Error(`Group "${groupId}" not found`)
  return group
}

export async function mapGroupParent(
  projectId: string,
  groupId: string,
  parentWorkPackageId: string
): Promise<{ mapping: any; subject: string | null; url: string | null }> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.mapGroupParent(projectId, groupId, parentWorkPackageId)

  const { client, integration } = await getClientAndIntegration(projectId, groupId)

  // Validate parent
  const validation = await client.validateParentWorkPackage(parentWorkPackageId)
  if (!validation.valid) {
    throw new Error(`Invalid parent: ${validation.error}`)
  }

  const groupName = await getGroupName(projectId, groupId)
  const parentUrl = client.workPackageUrl(parentWorkPackageId)

  const mapping = await prisma.openProjectParentMapping.upsert({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
    create: {
      projectId,
      mappingType: "Feature",
      localEntityId: groupId,
      localEntityName: groupName,
      openProjectParentId: parentWorkPackageId,
      openProjectParentSubject: validation.subject || null,
      openProjectParentUrl: parentUrl,
      validationStatus: "valid",
      lastValidatedAt: new Date(),
    },
    update: {
      localEntityName: groupName,
      openProjectParentId: parentWorkPackageId,
      openProjectParentSubject: validation.subject || null,
      openProjectParentUrl: parentUrl,
      validationStatus: "valid",
      lastValidatedAt: new Date(),
    },
  })

  return { mapping, subject: validation.subject || null, url: parentUrl }
}

export async function syncGroupTestCasesToOpenProject(
  projectId: string,
  groupId: string
): Promise<GroupSyncResult> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.syncGroupTestCases(projectId, groupId)

  const { client, integration, modCfg } = await getClientAndIntegration(projectId, groupId)

  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)

  if (testCases.length === 0) {
    return { groupId, groupName, total: 0, created: 0, updated: 0, failed: 0, skipped: 0, parentLinked: 0, results: [] }
  }

  // Get parent mapping for this group
  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
  const projectName = project?.name || "Unknown Project"

  const syncRun = await prisma.openProjectSyncRun.create({
    data: {
      projectId,
      operation: `group-sync:${groupId}`,
      status: "Running",
      totalCount: testCases.length,
      startedAt: new Date(),
    },
  })

  const existingMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: { in: testCases.map(tc => tc.id) } },
  })
  const mappingMap = new Map(existingMappings.map(m => [m.localEntityId, m]))

  // Build HAL _links for new work packages
  const links: Record<string, { href: string }> = {}
  if (integration.testCaseTypeId) {
    links.type = { href: client.typeHref(integration.testCaseTypeId) }
  }
  if (integration.defaultStatusId) {
    links.status = { href: client.statusHref(integration.defaultStatusId) }
  }
  if (parentMapping?.openProjectParentId) {
    links.parent = { href: client.parentHref(parentMapping.openProjectParentId) }
  }
  if (integration.targetVersionId) {
    links.version = { href: client.versionHref(integration.targetVersionId) }
  }

  const results: OpSyncItemResult[] = []
  let created = 0, updated = 0, skipped = 0, failed = 0, parentLinked = 0

  for (const tc of testCases) {
    const description = buildTestCaseDescription(tc, projectName, groupName)
    const subject = `[TC] ${tc.title}`
    const existingMapping = mappingMap.get(tc.id)

    try {
      // Resolve existingMapping — may be cleared below if the WP was deleted in OP
      let activeMapping = existingMapping || null

      if (activeMapping) {
        let wp = null
        try {
          wp = await client.getWorkPackage(activeMapping.externalId)
        } catch (fetchErr: any) {
          if (fetchErr.message?.includes("404")) {
            // WP was deleted in OpenProject — clear stale mapping and recreate below
            await prisma.externalSyncMapping.delete({ where: { id: activeMapping.id } }).catch(() => {})
            activeMapping = null
          } else {
            throw fetchErr
          }
        }

        if (wp && activeMapping) {
          const updateData: Record<string, any> = {
            subject,
            description: { format: "markdown", raw: description },
          }
          const updateLinks: Record<string, { href: string }> = {}
          if (integration.testCaseTypeId) updateLinks.type = { href: client.typeHref(integration.testCaseTypeId) }
          if (parentMapping?.openProjectParentId) {
            updateLinks.parent = { href: client.parentHref(parentMapping.openProjectParentId) }
            parentLinked++
          }
          if (integration.targetVersionId) updateLinks.version = { href: client.versionHref(integration.targetVersionId) }
          if (Object.keys(updateLinks).length > 0) updateData._links = updateLinks

          await client.updateWorkPackage(activeMapping.externalId, updateData, wp.lockVersion)
          await prisma.externalSyncMapping.update({
            where: { id: activeMapping.id },
            data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
          })

          updated++
          results.push({ localId: tc.id, title: tc.title, action: "updated", externalId: activeMapping.externalId, externalUrl: activeMapping.externalUrl || undefined })
        }
      }

      if (!activeMapping) {
        const existingWp = await client.findWorkPackageByMarker(tc.id)

        if (existingWp) {
          const wpUrl = client.workPackageUrl(existingWp.id)
          await prisma.externalSyncMapping.create({
            data: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: tc.id, externalId: String(existingWp.id), externalUrl: wpUrl, externalType: "TestCase", lastSyncedAt: new Date(), lastSyncStatus: "success" },
          })
          const updateLinks: Record<string, { href: string }> = {}
          if (integration.testCaseTypeId) updateLinks.type = { href: client.typeHref(integration.testCaseTypeId) }
          if (parentMapping?.openProjectParentId) {
            updateLinks.parent = { href: client.parentHref(parentMapping.openProjectParentId) }
            parentLinked++
          }
          if (integration.targetVersionId) updateLinks.version = { href: client.versionHref(integration.targetVersionId) }
          if (Object.keys(updateLinks).length > 0) {
            await client.updateWorkPackage(String(existingWp.id), { subject, description: { format: "markdown", raw: description }, _links: updateLinks }, existingWp.lockVersion).catch(() => {})
          }
          updated++
          results.push({ localId: tc.id, title: tc.title, action: "updated", externalId: String(existingWp.id), externalUrl: wpUrl })
        } else {
          const wp = await client.createWorkPackage({ subject, description: { format: "markdown", raw: description }, _links: links })
          const wpUrl = client.workPackageUrl(wp.id)
          await prisma.externalSyncMapping.create({
            data: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: tc.id, externalId: String(wp.id), externalUrl: wpUrl, externalType: "TestCase", lastSyncedAt: new Date(), lastSyncStatus: "success" },
          })
          if (parentMapping?.openProjectParentId) parentLinked++
          created++
          results.push({ localId: tc.id, title: tc.title, action: "created", externalId: String(wp.id), externalUrl: wpUrl })
        }
      }
    } catch (err: any) {
      failed++
      if (existingMapping) {
        await prisma.externalSyncMapping.update({ where: { id: existingMapping.id }, data: { lastSyncStatus: "failed", lastSyncError: err.message } }).catch(() => {})
      }
      results.push({ localId: tc.id, title: tc.title, action: "failed", error: err.message || "Unknown error" })
    }
  }

  const syncStatus = failed > 0 && created + updated === 0 ? "Failed" : "Completed"
  const syncError = failed > 0 ? `${failed} item(s) failed to sync` : null

  await prisma.openProjectSyncRun.update({
    where: { id: syncRun.id },
    data: { status: syncStatus, createdCount: created, updatedCount: updated, skippedCount: skipped, failedCount: failed, completedAt: new Date(), details: results as any },
  })

  // Persist sync outcome to project-level integration
  await prisma.openProjectIntegration.update({ where: { projectId }, data: { lastSyncAt: new Date() } }).catch(() => {})

  // Persist sync outcome to per-feature config (upsert — creates record if it doesn't exist yet)
  await prisma.openProjectFeatureConfig.upsert({
    where: { projectId_featureId: { projectId, featureId: groupId } },
    create: {
      projectId,
      featureId: groupId,
      lastSyncAt: new Date(),
      lastSyncStatus: failed === 0 ? "success" : "failed",
      lastSyncError: syncError,
    },
    update: {
      lastSyncAt: new Date(),
      lastSyncStatus: failed === 0 ? "success" : "failed",
      lastSyncError: syncError,
    },
  }).catch(() => {})

  return { groupId, groupName, total: testCases.length, created, updated, failed, skipped, parentLinked, results }
}

export async function applyParentToGroup(projectId: string, groupId: string): Promise<{ linked: number; alreadyLinked: number; failed: number; total: number }> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.applyParentToGroup(projectId, groupId)

  const { client } = await getClientAndIntegration(projectId, groupId)

  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })
  if (!parentMapping?.openProjectParentId) throw new Error("No parent mapping configured for this group. Map a parent first.")

  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map(tc => tc.id)

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })

  if (syncMappings.length === 0) throw new Error("No synced test cases in this group. Sync the group first.")

  const parentHref = client.parentHref(parentMapping.openProjectParentId)
  let linked = 0, alreadyLinked = 0, failed = 0

  for (const mapping of syncMappings) {
    try {
      const wp = await client.getWorkPackage(mapping.externalId)
      if (wp._links?.parent?.href === parentHref) { alreadyLinked++; continue }
      await client.updateWorkPackage(mapping.externalId, { _links: { parent: { href: parentHref } } }, wp.lockVersion)
      linked++
    } catch (err: any) {
      failed++
    }
  }

  return { linked, alreadyLinked, failed, total: syncMappings.length }
}

export async function syncGroupToBoard(projectId: string, groupId: string): Promise<{ updated: number; failed: number; statusSkipped: number; total: number; boardPlaced: number; boardPermissionDenied: boolean; firstError?: string; debug?: object }> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.syncGroupToBoard(projectId, groupId)

  const { client, integration, modCfg } = await getClientAndIntegration(projectId, groupId)

  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })

  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map(tc => tc.id)

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })

  if (syncMappings.length === 0) throw new Error("No synced test cases in this group. Sync the group first.")

  // Resolve column info — targetColumnStatusId stores the widgetId of the chosen column
  let columnInfo: { columnType: string; attributeId: string | null; queryId: string | null } | null = null
  if (integration.targetColumnStatusId && integration.targetBoardId) {
    try {
      const cols = await client.getBoardColumns(Number(integration.targetBoardId))
      const col = cols.find(c => String(c.widgetId) === integration.targetColumnStatusId)
      if (col) columnInfo = { columnType: col.columnType, attributeId: col.attributeId, queryId: col.queryId }
    } catch { /* fall through */ }
  }

  let updated = 0, failed = 0, statusSkipped = 0, boardPlaced = 0, boardPermissionDenied = false
  let firstError: string | undefined

  for (const mapping of syncMappings) {
    try {
      const wp = await client.getWorkPackage(mapping.externalId)

      // ── Free / basic board: place WPs by patching the grid widget's id filter ──
      // OpenProject CE does not support PUT /queries/:id/order (EE only).
      // The board renders widget.options.filters; the widget default (manualSort:ow)
      // shows nothing in CE. Workaround: PATCH the grid widget with an explicit id filter.
      // This runs once per sync (skip after the first mapping).
      if (columnInfo?.columnType === "basic" && integration.targetBoardId && integration.targetColumnStatusId && mapping === syncMappings[0]) {
        const boardId = Number(integration.targetBoardId)
        const widgetId = Number(integration.targetColumnStatusId)
        const wpIds = syncMappings.map(m => m.externalId)
        try {
          const ok = await client.setBoardWidgetIdFilter(boardId, widgetId, wpIds)
          if (ok) boardPlaced = syncMappings.length
          else { boardPermissionDenied = true; if (!firstError) firstError = "Grid PATCH returned non-200." }
        } catch (placeErr: any) {
          if (!firstError) firstError = `Board widget update failed: ${placeErr?.message}`
          boardPermissionDenied = true
        }
      }
      if (columnInfo?.columnType === "basic") { updated++; continue }

      // ── Attribute-based board (status / version / assignee) ─────────────────
      const boardLinks: Record<string, { href: string }> = {}

      if (integration.testCaseTypeId) boardLinks.type = { href: client.typeHref(integration.testCaseTypeId) }
      if (parentMapping?.openProjectParentId) boardLinks.parent = { href: client.parentHref(parentMapping.openProjectParentId) }
      if (integration.targetVersionId) boardLinks.version = { href: client.versionHref(integration.targetVersionId) }
      if (integration.targetAssigneeId) boardLinks.assignee = { href: client.assigneeHref(integration.targetAssigneeId) }

      if (columnInfo?.attributeId) {
        if (columnInfo.columnType === "status") {
          boardLinks.status = { href: client.statusHref(columnInfo.attributeId) }
        } else if (columnInfo.columnType === "version") {
          boardLinks.version = { href: client.versionHref(columnInfo.attributeId) }
        } else if (columnInfo.columnType === "assignee") {
          boardLinks.assignee = { href: client.assigneeHref(columnInfo.attributeId) }
        }
      }

      if (Object.keys(boardLinks).length === 0) { updated++; continue }

      try {
        await client.updateWorkPackage(mapping.externalId, { _links: boardLinks }, wp.lockVersion)
      } catch (innerErr: any) {
        if (innerErr.message?.includes("422") && (innerErr.message?.includes("Status") || innerErr.message?.includes("status"))) {
          const { status: _omit, ...linksWithoutStatus } = boardLinks
          if (Object.keys(linksWithoutStatus).length > 0) {
            await client.updateWorkPackage(mapping.externalId, { _links: linksWithoutStatus }, wp.lockVersion)
          }
          statusSkipped++
        } else {
          throw innerErr
        }
      }

      updated++
    } catch (err: any) {
      console.error("[syncGroupToBoard] WP update failed for", mapping.externalId, err?.message)
      if (!firstError) firstError = err?.message || "Unknown error"
      failed++
    }
  }

  return {
    updated, failed, statusSkipped, total: syncMappings.length, firstError,
    boardPlaced,
    boardPermissionDenied,
    debug: {
      boardId: integration.targetBoardId || modCfg?.targetBoardId || null,
      columnType: columnInfo?.columnType || null,
      queryId: columnInfo?.queryId || null,
    },
  }
}

export async function checkGroupBoardVisibility(projectId: string, groupId: string): Promise<GroupBoardCheckResult> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.checkGroupBoardVisibility(projectId, groupId)

  const { client, integration } = await getClientAndIntegration(projectId, groupId)

  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map(tc => tc.id)

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  const mappingMap = new Map(syncMappings.map(m => [m.localEntityId, m]))

  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })

  const items: GroupBoardCheckResult["items"] = []
  let boardReady = 0, missingParent = 0, missingStatus = 0, notSynced = 0

  for (const tc of testCases) {
    const mapping = mappingMap.get(tc.id)

    if (!mapping) {
      notSynced++
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: null, status: "Not Synced", issues: ["No OpenProject mapping — sync this group first"] })
      continue
    }

    const issues: string[] = []
    if (!integration.testCaseTypeId) issues.push("No test case type mapped in integration settings")

    if (integration.boardStrategy === "StatusBased") {
      const hasStatus = integration.defaultStatusId || integration.notExecutedStatusId || integration.passedStatusId || integration.failedStatusId
      if (!hasStatus) { issues.push("No status mapping configured"); missingStatus++ }
    }

    if (integration.boardStrategy === "ParentChildBased" || !parentMapping) {
      if (!parentMapping?.openProjectParentId) { issues.push("No parent mapped for this group"); missingParent++ }
    }

    if (issues.length === 0) {
      boardReady++
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: mapping.externalId, status: "Ready", issues: [] })
    } else {
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: mapping.externalId, status: "Not Ready", issues })
    }
  }

  return { groupId, groupName, total: testCases.length, boardReady, missingParent, missingStatus, notSynced, items }
}

export async function getGroupSyncedItems(projectId: string, groupId: string): Promise<{ groupName: string; items: GroupSyncedItem[] }> {
  const up = await unifiedProvider(projectId)
  if (up) return coreGroup.getGroupSyncedItems(projectId, groupId, up)

  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map(tc => tc.id)

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  const mappingMap = new Map(syncMappings.map(m => [m.localEntityId, m]))

  const latestRuns = await prisma.testRun.findMany({
    where: { testCaseId: { in: tcIds } },
    orderBy: { createdAt: "desc" },
    select: { testCaseId: true, status: true },
  })
  const runMap = new Map<string, string>()
  for (const r of latestRuns) {
    if (r.testCaseId && !runMap.has(r.testCaseId)) runMap.set(r.testCaseId, r.status)
  }

  const items: GroupSyncedItem[] = testCases.map(tc => {
    const m = mappingMap.get(tc.id)
    return {
      testCaseId: tc.id,
      testCaseTitle: tc.title,
      localStatus: runMap.get(tc.id) || null,
      externalId: m?.externalId || null,
      externalUrl: m?.externalUrl || null,
      parentLinked: false, // updated client-side after board check
      lastSyncStatus: m?.lastSyncStatus || null,
      lastSyncAt: m?.lastSyncedAt?.toISOString() || null,
    }
  })

  return { groupName, items }
}
