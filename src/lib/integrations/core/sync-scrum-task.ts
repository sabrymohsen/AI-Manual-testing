/**
 * Push a Scrum Board task to the project's tracker (Jira, Azure DevOps,
 * OpenProject or ClickUp) and keep it updated.
 *
 * Only bug reports used to reach the tracker; stories and tasks planned on the
 * board stayed in this app. A task is sent when someone presses "Send to
 * tracker"; from then on, edits to it (title, description, status, priority)
 * update the same work item. The link lives in ExternalSyncMapping with
 * localEntityType "ScrumTask".
 */
import { prisma } from "@/lib/db"
import { loadIntegration, type LoadedIntegration } from "./load-integration"
import type { WorkItemProvider } from "./provider"
import { entityMarker } from "./types"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"
export const SCRUM_TASK_ENTITY = "ScrumTask"

const TYPE_HINTS: Record<string, string[]> = {
  STORY: ["user story", "story", "feature", "requirement"],
  TASK: ["task", "user story", "story"],
  BUG: ["bug", "defect", "issue"],
  TEST_CASE: ["test case", "test", "task"],
  EPIC: ["epic", "feature"],
  SUBTASK: ["sub-task", "subtask", "task"],
}

const STATUS_HINTS: Record<string, string[]> = {
  TODO: ["to do", "todo", "new", "open", "backlog", "selected for development"],
  IN_PROGRESS: ["in progress", "active", "in development", "doing"],
  REVIEW: ["in review", "review", "code review", "resolved"],
  TESTING: ["testing", "in testing", "qa", "in qa", "ready for test", "test"],
  DONE: ["done", "closed", "complete", "completed"],
  DEPLOYED: ["deployed", "released", "done", "closed"],
}

const PRIORITY_HINTS: Record<string, string[]> = {
  LOWEST: ["lowest", "trivial", "low"],
  LOW: ["low", "minor"],
  MEDIUM: ["medium", "normal", "major"],
  HIGH: ["high", "critical"],
  HIGHEST: ["highest", "blocker", "immediate", "urgent", "critical"],
}

async function pick<T extends { id: string; name: string }>(load: () => Promise<T[]>, hints: string[]): Promise<string | null> {
  try {
    const list = await load()
    for (const h of hints) {
      const m = list.find((x) => x.name.toLowerCase() === h)
      if (m) return m.id
    }
  } catch {}
  return null
}

async function typeIdFor(provider: WorkItemProvider, loaded: LoadedIntegration, type: string): Promise<string | null> {
  const mapped = type === "BUG" ? loaded.typeMapping.bug : type === "TEST_CASE" ? loaded.typeMapping.testCase : type === "STORY" ? loaded.typeMapping.userStory : null
  if (mapped) return mapped
  return pick(() => provider.getTypes(), TYPE_HINTS[type] ?? TYPE_HINTS.TASK)
}

export type TaskSyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null; provider: string }
  | { status: "skipped"; reason: string }

/** Where a task is linked in the tracker, if anywhere. */
export async function taskSyncInfo(taskId: string, projectId: string) {
  const loaded = await loadIntegration(projectId).catch(() => null)
  const mapping = await prisma.externalSyncMapping.findFirst({
    where: { localEntityType: SCRUM_TASK_ENTITY, localEntityId: taskId },
  })
  return {
    provider: loaded?.enabled ? loaded.provider : null,
    linked: mapping
      ? { externalId: mapping.externalId, url: mapping.externalUrl, lastSyncedAt: mapping.lastSyncedAt, status: mapping.lastSyncStatus, error: mapping.lastSyncError }
      : null,
  }
}

export async function syncScrumTask(taskId: string, opts: { createIfMissing: boolean }): Promise<TaskSyncResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { boardKey: true } },
      sprint: { select: { name: true } },
      epic: { select: { title: true } },
      testCaseLinks: { include: { testCase: { select: { title: true, lastStatus: true } } } },
      subtasks: { select: { title: true, completed: true } },
    },
  })
  if (!task) throw new Error("Task not found")

  const loaded = await loadIntegration(task.projectId)
  if (!loaded || !loaded.enabled) return { status: "skipped", reason: "No tracker is connected to this project (Project → Integrations)" }
  const provider = loaded.getClient()

  const mapping = await prisma.externalSyncMapping.findUnique({
    where: { provider_localEntityType_localEntityId: { provider: loaded.provider as any, localEntityType: SCRUM_TASK_ENTITY, localEntityId: task.id } },
  })
  if (!mapping && !opts.createIfMissing) return { status: "skipped", reason: "Not linked to the tracker" }

  const key = `${task.project?.boardKey || "TASK"}-${task.taskNumber}`
  let description = ""
  if (task.description) description += `${task.description}\n\n`
  const facts = [
    `**Key:** ${key}`,
    task.storyPoints != null ? `**Story points:** ${task.storyPoints}` : null,
    task.sprint ? `**Sprint:** ${task.sprint.name}` : null,
    task.epic ? `**Epic:** ${task.epic.title}` : null,
  ].filter(Boolean)
  description += facts.join("  \n") + "\n\n"
  if (task.subtasks.length) {
    description += `## Subtasks\n${task.subtasks.map((s) => `- [${s.completed ? "x" : " "}] ${s.title}`).join("\n")}\n\n`
  }
  if (task.testCaseLinks.length) {
    description += `## Linked test cases\n${task.testCaseLinks.map((l) => `- ${l.testCase.title} (${l.testCase.lastStatus})`).join("\n")}\n\n`
  }
  description += `[Open in QA Engine](${APP_URL}/projects/${task.projectId}/scrum?task=${task.id})\n\n`
  description += `<!-- ${entityMarker("ScrumTask", task.id)} -->`

  const input: Record<string, any> = {
    title: task.title,
    description,
    priorityId: await pick(() => provider.getPriorities(), PRIORITY_HINTS[task.priority] ?? []),
  }
  const statusId = await pick(() => provider.getStatuses(), STATUS_HINTS[task.status] ?? [])

  try {
    if (mapping) {
      // A tracker can refuse a status jump its workflow doesn't allow; keep
      // the rest of the update rather than failing it.
      try {
        await provider.updateWorkItem(mapping.externalId, { ...input, ...(statusId ? { statusId } : {}) })
      } catch (err) {
        if (!statusId) throw err
        await provider.updateWorkItem(mapping.externalId, input)
      }
      await prisma.externalSyncMapping.update({
        where: { id: mapping.id },
        data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
      })
      return { status: "updated", externalId: mapping.externalId, externalUrl: mapping.externalUrl, provider: loaded.provider }
    }

    const created = await provider.createWorkItem({ ...input, typeId: await typeIdFor(provider, loaded, task.type) })
    if (statusId) {
      try {
        await provider.updateWorkItem(created.externalId, { statusId })
      } catch {}
    }
    await prisma.externalSyncMapping.create({
      data: {
        projectId: task.projectId,
        provider: loaded.provider as any,
        localEntityType: SCRUM_TASK_ENTITY,
        localEntityId: task.id,
        externalId: created.externalId,
        externalUrl: created.url,
        externalType: created.typeName || task.type,
        lastSyncedAt: new Date(),
        lastSyncStatus: "success",
      },
    })
    return { status: "created", externalId: created.externalId, externalUrl: created.url, provider: loaded.provider }
  } catch (err: any) {
    if (mapping) {
      await prisma.externalSyncMapping
        .update({ where: { id: mapping.id }, data: { lastSyncStatus: "failed", lastSyncError: String(err?.message || err).slice(0, 500) } })
        .catch(() => {})
    }
    throw err
  }
}
