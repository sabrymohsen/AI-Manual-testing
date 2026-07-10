/**
 * Provider-agnostic group (feature-level) sync — the multi-provider counterpart
 * of openproject-group-sync. Used for projects on the unified ProjectIntegration
 * model (Jira / Azure DevOps / ClickUp / OpenProject); legacy OpenProject-only
 * projects keep their existing engine. Return shapes match the OpenProject engine
 * so the same routes/UI consume both.
 *
 * groupId = Feature.id | "unassigned". A test case's group is derived through its
 * story links (earliest link whose story has a feature wins), identical to the
 * OpenProject engine.
 */
import { prisma } from "@/lib/db"
import { loadIntegration, type LoadedIntegration } from "./load-integration"
import type { WorkItemProvider } from "./provider"
import type { WorkItemInput } from "./types"
import type {
  GroupInfo,
  GroupOpStatus,
  GroupSyncResult,
  GroupBoardCheckResult,
  GroupSyncedItem,
} from "@/lib/integrations/openproject/openproject-group-sync"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

// ─── Shared helpers (mirrors the OpenProject engine) ───────────────────────────

function deriveGroupId(links: Array<{ createdAt: Date; requirement: { featureId: string | null } }>): string {
  const ordered = [...links].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const link of ordered) if (link.requirement.featureId) return link.requirement.featureId
  return "unassigned"
}

async function getAllTestCasesWithGroup(projectId: string) {
  const testCases = await prisma.testCase.findMany({
    where: { projectId },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      requirements: { select: { createdAt: true, requirement: { select: { featureId: true } } } },
    },
    orderBy: { createdAt: "asc" },
  })
  return testCases.map((tc) => ({ ...tc, groupId: deriveGroupId(tc.requirements) }))
}

async function getGroupTestCases(projectId: string, groupId: string) {
  const all = await getAllTestCasesWithGroup(projectId)
  return all.filter((tc) => tc.groupId === groupId)
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
    for (const line of tc.preconditions.split("\n").filter(Boolean)) md += `- ${line}\n`
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

async function loadOrThrow(projectId: string): Promise<{ loaded: LoadedIntegration; provider: WorkItemProvider }> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) throw new Error("No project-management integration is configured for this project.")
  return { loaded, provider: loaded.getClient() }
}

// ─── Reporting (no external calls) ─────────────────────────────────────────────

function buildRunStats(tcIds: string[], latestRunMap: Map<string, string>) {
  let passed = 0, failed = 0, untested = 0
  for (const id of tcIds) {
    const status = latestRunMap.get(id)
    if (!status) untested++
    else if (status === "Passed") passed++
    else if (status === "Failed" || status === "Blocked") failed++
    else untested++
  }
  return { passed, failed, untested }
}

function buildGroupOpStatus(
  tcIds: string[],
  syncMap: Map<string, { lastSyncStatus: string | null; lastSyncedAt: Date | null }>,
  groupId: string,
  parentMap: Map<string, any>
): GroupOpStatus {
  let syncedCount = 0, failedSyncCount = 0
  let lastSyncAt: Date | null = null
  for (const id of tcIds) {
    const m = syncMap.get(id)
    if (m) {
      if (m.lastSyncStatus === "success") syncedCount++
      else if (m.lastSyncStatus === "failed") failedSyncCount++
      if (m.lastSyncedAt && (!lastSyncAt || m.lastSyncedAt > lastSyncAt)) lastSyncAt = m.lastSyncedAt
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
    boardReadyCount: syncedCount,
    lastSyncAt: lastSyncAt?.toISOString() || null,
  }
}

export async function getAllGroupsWithStatus(projectId: string, provider: string): Promise<GroupInfo[]> {
  const features = await prisma.feature.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true },
  })
  const allTestCases = await getAllTestCasesWithGroup(projectId)

  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: provider as any, localEntityType: "TestCase" },
    select: { localEntityId: true, lastSyncStatus: true, lastSyncedAt: true },
  })
  const syncMap = new Map(syncMappings.map((m) => [m.localEntityId, m]))

  const latestRuns = await prisma.testRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { testCaseId: true, status: true },
  })
  const latestRunMap = new Map<string, string>()
  for (const run of latestRuns) {
    if (run.testCaseId && !latestRunMap.has(run.testCaseId)) latestRunMap.set(run.testCaseId, run.status)
  }

  const parentMappings = await prisma.openProjectParentMapping.findMany({
    where: { projectId, mappingType: "Feature" },
  })
  const parentMap = new Map(parentMappings.map((m) => [m.localEntityId, m]))

  const results: GroupInfo[] = []
  for (const feature of features) {
    const tcIds = allTestCases.filter((tc) => tc.groupId === feature.id).map((tc) => tc.id)
    results.push({
      groupId: feature.id,
      groupType: "Feature",
      groupName: feature.name,
      totalCases: tcIds.length,
      ...buildRunStats(tcIds, latestRunMap),
      openProject: buildGroupOpStatus(tcIds, syncMap, feature.id, parentMap),
    })
  }
  const unassignedIds = allTestCases.filter((tc) => tc.groupId === "unassigned").map((tc) => tc.id)
  if (unassignedIds.length > 0) {
    results.push({
      groupId: "unassigned",
      groupType: "Unassigned",
      groupName: "Unassigned",
      totalCases: unassignedIds.length,
      ...buildRunStats(unassignedIds, latestRunMap),
      openProject: buildGroupOpStatus(unassignedIds, syncMap, "unassigned", parentMap),
    })
  }
  return results
}

export async function getGroupSyncStatus(projectId: string, groupId: string, provider: string): Promise<GroupInfo> {
  const groups = await getAllGroupsWithStatus(projectId, provider)
  const group = groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group "${groupId}" not found`)
  return group
}

// ─── Parent mapping ────────────────────────────────────────────────────────────

export async function mapGroupParent(
  projectId: string,
  groupId: string,
  parentId: string
): Promise<{ mapping: any; subject: string | null; url: string | null }> {
  const { provider } = await loadOrThrow(projectId)

  let subject: string | null = null
  try {
    const wp = await provider.getWorkItem(parentId)
    subject = wp.title || null
  } catch (err: any) {
    throw new Error(`Invalid parent: ${err?.message || "not found"}`)
  }

  const groupName = await getGroupName(projectId, groupId)
  const parentUrl = provider.workItemUrl(parentId)

  const mapping = await prisma.openProjectParentMapping.upsert({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
    create: {
      projectId, mappingType: "Feature", localEntityId: groupId, localEntityName: groupName,
      openProjectParentId: parentId, openProjectParentSubject: subject, openProjectParentUrl: parentUrl,
      validationStatus: "valid", lastValidatedAt: new Date(),
    },
    update: {
      localEntityName: groupName,
      openProjectParentId: parentId, openProjectParentSubject: subject, openProjectParentUrl: parentUrl,
      validationStatus: "valid", lastValidatedAt: new Date(),
    },
  })
  return { mapping, subject, url: parentUrl }
}

// ─── Bulk test-case sync ───────────────────────────────────────────────────────

export async function syncGroupTestCases(projectId: string, groupId: string): Promise<GroupSyncResult> {
  const { loaded, provider } = await loadOrThrow(projectId)
  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)

  if (testCases.length === 0) {
    return { groupId, groupName, total: 0, created: 0, updated: 0, failed: 0, skipped: 0, parentLinked: 0, results: [] }
  }

  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })
  const parentId = parentMapping?.openProjectParentId || null

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
  const projectName = project?.name || "Unknown Project"

  const syncRun = await prisma.openProjectSyncRun.create({
    data: { projectId, operation: `group-sync:${groupId}`, status: "Running", totalCount: testCases.length, startedAt: new Date() },
  })

  const existingMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any, localEntityType: "TestCase", localEntityId: { in: testCases.map((tc) => tc.id) } },
  })
  const mappingMap = new Map(existingMappings.map((m) => [m.localEntityId, m]))

  const results: GroupSyncResult["results"] = []
  let created = 0, updated = 0, skipped = 0, failed = 0, parentLinked = 0

  for (const tc of testCases) {
    const description = buildTestCaseDescription(tc, projectName, groupName)
    const input: WorkItemInput = {
      title: `[TC] ${tc.title}`,
      description,
      typeId: loaded.typeMapping.testCase || null,
      statusId: loaded.statusMapping.default || null,
      parentId,
    }
    const existingMapping = mappingMap.get(tc.id)

    try {
      let activeMapping = existingMapping || null

      if (activeMapping) {
        try {
          await provider.getWorkItem(activeMapping.externalId)
        } catch (fetchErr: any) {
          if (String(fetchErr?.message || "").includes("404") || /not found/i.test(fetchErr?.message || "")) {
            await prisma.externalSyncMapping.delete({ where: { id: activeMapping.id } }).catch(() => {})
            activeMapping = null
          } else {
            throw fetchErr
          }
        }
      }

      if (activeMapping) {
        await provider.updateWorkItem(activeMapping.externalId, input)
        if (parentId) parentLinked++
        await prisma.externalSyncMapping.update({
          where: { id: activeMapping.id },
          data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
        })
        updated++
        results.push({ localId: tc.id, title: tc.title, action: "updated", externalId: activeMapping.externalId, externalUrl: activeMapping.externalUrl || undefined })
        continue
      }

      // No active mapping — link an existing item by marker, else create.
      const existing = await provider.findByMarker("TestCase", tc.id)
      if (existing) {
        await provider.updateWorkItem(existing.externalId, input).catch(() => {})
        if (parentId) parentLinked++
        await prisma.externalSyncMapping.create({
          data: { projectId, provider: loaded.provider as any, localEntityType: "TestCase", localEntityId: tc.id, externalId: existing.externalId, externalUrl: existing.url, externalType: "TestCase", lastSyncedAt: new Date(), lastSyncStatus: "success" },
        })
        updated++
        results.push({ localId: tc.id, title: tc.title, action: "updated", externalId: existing.externalId, externalUrl: existing.url })
      } else {
        const wp = await provider.createWorkItem(input)
        if (parentId) parentLinked++
        await prisma.externalSyncMapping.create({
          data: { projectId, provider: loaded.provider as any, localEntityType: "TestCase", localEntityId: tc.id, externalId: wp.externalId, externalUrl: wp.url, externalType: "TestCase", lastSyncedAt: new Date(), lastSyncStatus: "success" },
        })
        created++
        results.push({ localId: tc.id, title: tc.title, action: "created", externalId: wp.externalId, externalUrl: wp.url })
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
  await prisma.openProjectSyncRun.update({
    where: { id: syncRun.id },
    data: { status: syncStatus, createdCount: created, updatedCount: updated, skippedCount: skipped, failedCount: failed, completedAt: new Date(), details: results as any },
  })
  await prisma.projectIntegration.updateMany({ where: { projectId }, data: { lastSyncAt: new Date() } }).catch(() => {})

  return { groupId, groupName, total: testCases.length, created, updated, failed, skipped, parentLinked, results }
}

// ─── Apply parent to already-synced items ──────────────────────────────────────

export async function applyParentToGroup(
  projectId: string,
  groupId: string
): Promise<{ linked: number; alreadyLinked: number; failed: number; total: number }> {
  const { loaded, provider } = await loadOrThrow(projectId)
  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })
  if (!parentMapping?.openProjectParentId) throw new Error("No parent mapping configured for this group. Map a parent first.")

  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map((tc) => tc.id)
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any, localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  if (syncMappings.length === 0) throw new Error("No synced test cases in this group. Sync the group first.")

  const parentId = parentMapping.openProjectParentId
  let linked = 0, alreadyLinked = 0, failed = 0
  for (const mapping of syncMappings) {
    try {
      const wp = await provider.getWorkItem(mapping.externalId)
      if (wp.parentId && String(wp.parentId) === String(parentId)) { alreadyLinked++; continue }
      await provider.updateWorkItem(mapping.externalId, { parentId })
      linked++
    } catch {
      failed++
    }
  }
  return { linked, alreadyLinked, failed, total: syncMappings.length }
}

// ─── Board placement ───────────────────────────────────────────────────────────

export async function syncGroupToBoard(
  projectId: string,
  groupId: string
): Promise<{ updated: number; failed: number; statusSkipped: number; total: number; boardPlaced: number; boardPermissionDenied: boolean; firstError?: string; debug?: object }> {
  const { loaded, provider } = await loadOrThrow(projectId)
  const boardId = loaded.boardConfig.boardId
  const columnId = loaded.boardConfig.columnId

  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map((tc) => tc.id)
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any, localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  if (syncMappings.length === 0) throw new Error("No synced test cases in this group. Sync the group first.")

  if (!boardId) {
    return { updated: 0, failed: 0, statusSkipped: 0, total: syncMappings.length, boardPlaced: 0, boardPermissionDenied: false, firstError: "No board configured", debug: { boardId: null } }
  }

  let columns
  try {
    columns = await provider.getBoardColumns(boardId)
  } catch (err: any) {
    return { updated: 0, failed: syncMappings.length, statusSkipped: 0, total: syncMappings.length, boardPlaced: 0, boardPermissionDenied: true, firstError: err?.message, debug: { boardId } }
  }
  const col = (columnId ? columns.find((c) => String(c.id) === String(columnId)) : null) || columns[0]
  if (!col) {
    return { updated: 0, failed: 0, statusSkipped: 0, total: syncMappings.length, boardPlaced: 0, boardPermissionDenied: false, firstError: "Board has no columns", debug: { boardId } }
  }

  let updated = 0, failed = 0, boardPlaced = 0, boardPermissionDenied = false
  let firstError: string | undefined
  for (const mapping of syncMappings) {
    try {
      const ok = await provider.reconcileColumn(boardId, col, mapping.externalId)
      if (ok) { boardPlaced++; updated++ }
      else { boardPermissionDenied = true; if (!firstError) firstError = "Board placement not permitted" }
    } catch (err: any) {
      failed++
      if (!firstError) firstError = err?.message || "Unknown error"
    }
  }
  return { updated, failed, statusSkipped: 0, total: syncMappings.length, boardPlaced, boardPermissionDenied, firstError, debug: { boardId, columnType: col.columnType } }
}

// ─── Board readiness / synced items (reporting) ────────────────────────────────

export async function checkGroupBoardVisibility(projectId: string, groupId: string): Promise<GroupBoardCheckResult> {
  const loaded = await loadIntegration(projectId)
  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map((tc) => tc.id)
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: (loaded?.provider || "OpenProject") as any, localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  const mappingMap = new Map(syncMappings.map((m) => [m.localEntityId, m]))
  const parentMapping = await prisma.openProjectParentMapping.findUnique({
    where: { projectId_mappingType_localEntityId: { projectId, mappingType: "Feature", localEntityId: groupId } },
  })

  const items: GroupBoardCheckResult["items"] = []
  let boardReady = 0, missingParent = 0, missingStatus = 0, notSynced = 0
  const hasType = !!loaded?.typeMapping.testCase
  const hasStatus = !!(loaded?.statusMapping.default || loaded?.statusMapping.passed || loaded?.statusMapping.failed)

  for (const tc of testCases) {
    const mapping = mappingMap.get(tc.id)
    if (!mapping) {
      notSynced++
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: null, status: "Not Synced", issues: ["Not synced — sync this group first"] })
      continue
    }
    const issues: string[] = []
    if (!hasType) issues.push("No test-case type mapped in integration settings")
    if (!hasStatus) { issues.push("No status mapping configured"); missingStatus++ }
    if (!parentMapping?.openProjectParentId) { issues.push("No parent mapped for this group"); missingParent++ }
    if (issues.length === 0) {
      boardReady++
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: mapping.externalId, status: "Ready", issues: [] })
    } else {
      items.push({ testCaseId: tc.id, testCaseTitle: tc.title, externalId: mapping.externalId, status: "Not Ready", issues })
    }
  }
  return { groupId, groupName, total: testCases.length, boardReady, missingParent, missingStatus, notSynced, items }
}

export async function getGroupSyncedItems(projectId: string, groupId: string, provider: string): Promise<{ groupName: string; items: GroupSyncedItem[] }> {
  const groupName = await getGroupName(projectId, groupId)
  const testCases = await getGroupTestCases(projectId, groupId)
  const tcIds = testCases.map((tc) => tc.id)
  const syncMappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: provider as any, localEntityType: "TestCase", localEntityId: { in: tcIds } },
  })
  const mappingMap = new Map(syncMappings.map((m) => [m.localEntityId, m]))
  const latestRuns = await prisma.testRun.findMany({
    where: { testCaseId: { in: tcIds } },
    orderBy: { createdAt: "desc" },
    select: { testCaseId: true, status: true },
  })
  const runMap = new Map<string, string>()
  for (const r of latestRuns) if (r.testCaseId && !runMap.has(r.testCaseId)) runMap.set(r.testCaseId, r.status)

  const items: GroupSyncedItem[] = testCases.map((tc) => {
    const m = mappingMap.get(tc.id)
    return {
      testCaseId: tc.id, testCaseTitle: tc.title, localStatus: runMap.get(tc.id) || null,
      externalId: m?.externalId || null, externalUrl: m?.externalUrl || null, parentLinked: false,
      lastSyncStatus: m?.lastSyncStatus || null, lastSyncAt: m?.lastSyncedAt?.toISOString() || null,
    }
  })
  return { groupName, items }
}
