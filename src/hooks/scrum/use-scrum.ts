"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { scrumApi, scrumKeys, http } from "@/lib/scrum/api"
import type { ScrumTask, TaskFilters } from "@/types/scrum"

// ── Queries ────────────────────────────────────────────────────────────────

export function useScrumTasks(projectId: string, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: scrumKeys.tasks(projectId, filters),
    queryFn: () => scrumApi.listTasks(projectId, filters),
  })
}

export function useScrumTask(taskId: string | null) {
  return useQuery({
    queryKey: taskId ? scrumKeys.task(taskId) : ["scrum", "task", "none"],
    queryFn: () => scrumApi.getTask(taskId as string),
    enabled: !!taskId,
  })
}

export function useScrumSprints(projectId: string) {
  return useQuery({ queryKey: scrumKeys.sprints(projectId), queryFn: () => scrumApi.listSprints(projectId) })
}

export function useScrumEpics(projectId: string) {
  return useQuery({ queryKey: scrumKeys.epics(projectId), queryFn: () => scrumApi.listEpics(projectId) })
}

export function useBoardColumns(projectId: string) {
  return useQuery({ queryKey: scrumKeys.columns(projectId), queryFn: () => scrumApi.listColumns(projectId) })
}

/** Project name/boardKey for the board header breadcrumb. */
export function useScrumProject(projectId: string) {
  return useQuery({
    queryKey: ["scrum", "project", projectId],
    queryFn: async () => {
      const { data } = await http.get(`/projects/${projectId}`)
      return data.project as { id: string; name: string; boardKey: string | null }
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useScrumMembers(projectId: string) {
  return useQuery({ queryKey: scrumKeys.members(projectId), queryFn: () => scrumApi.listMembers(projectId) })
}

export function useScrumActivities(projectId: string, limit = 50) {
  return useQuery({
    queryKey: scrumKeys.activities(projectId),
    queryFn: () => scrumApi.listActivities(projectId, limit),
  })
}

export function useScrumLinkables(projectId: string) {
  return useQuery({ queryKey: scrumKeys.linkables(projectId), queryFn: () => scrumApi.linkables(projectId) })
}

export function useScrumLabels(projectId: string) {
  return useQuery({ queryKey: scrumKeys.labels(projectId), queryFn: () => scrumApi.listLabels(projectId) })
}

export interface CurrentUser {
  id: string
  email: string
  name: string | null
  role?: string
}

/** The signed-in user (id/name/email), for watch/vote/assign-to-me actions. */
export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ["auth", "me"],
    queryFn: () => http.get<{ user: CurrentUser }>("/auth/me").then((r) => r.data.user),
    staleTime: 5 * 60 * 1000,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Invalidate every task list for a project (all filter permutations). */
function invalidateTaskLists(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["scrum", projectId, "tasks"], refetchType: "all" })
  qc.invalidateQueries({ queryKey: scrumKeys.activities(projectId), refetchType: "all" })
}

/** Invalidate project-wide scrum data (tasks + sprints + columns + epics). */
function invalidateProject(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["scrum", projectId], refetchType: "all" })
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Jira-detail actions grouped for a single task: clone, watch/vote toggles,
 * work-log, attachment upload/delete, and issue-link create/delete. Every
 * mutation refreshes the open task detail (and lists where the card changes).
 */
export function useTaskDetailMutations(projectId: string, taskId: string) {
  const qc = useQueryClient()
  const refreshTask = () => qc.invalidateQueries({ queryKey: scrumKeys.task(taskId), refetchType: "all" })
  const refreshAll = () => {
    refreshTask()
    invalidateTaskLists(qc, projectId)
  }

  const clone = useMutation({
    mutationFn: () => scrumApi.cloneTask(taskId),
    onSuccess: (task) => {
      invalidateTaskLists(qc, projectId)
      toast.success(`Cloned to ${task.key}`)
    },
    onError: () => toast.error("Failed to clone task"),
  })

  const watch = useMutation({
    mutationFn: () => scrumApi.toggleWatch(taskId),
    onSuccess: (res) => {
      refreshTask()
      toast.success(res.watching ? "Watching this issue" : "Stopped watching")
    },
    onError: () => toast.error("Failed to update watchers"),
  })

  const vote = useMutation({
    mutationFn: () => scrumApi.toggleVote(taskId),
    onSuccess: refreshTask,
    onError: () => toast.error("Failed to update vote"),
  })

  const logWork = useMutation({
    mutationFn: (body: { timeSpent: number; description?: string | null; startedAt?: string }) =>
      scrumApi.addWorkLog(taskId, body),
    onSuccess: () => {
      refreshTask()
      toast.success("Work logged")
    },
    onError: () => toast.error("Failed to log work"),
  })

  const uploadAttachment = useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (pct: number) => void }) =>
      scrumApi.uploadAttachment(taskId, file, onProgress),
    onSuccess: () => {
      refreshTask()
      toast.success("Attachment uploaded")
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error || "Failed to upload attachment"),
  })

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => scrumApi.deleteAttachment(attachmentId),
    onSuccess: refreshTask,
    onError: () => toast.error("Failed to delete attachment"),
  })

  const createLink = useMutation({
    mutationFn: (body: { targetId: string; type: import("@/types/scrum").TaskLinkType }) =>
      scrumApi.createLink({ sourceId: taskId, ...body }),
    onSuccess: () => {
      refreshAll()
      toast.success("Issue linked")
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed to link issue"),
  })

  const deleteLink = useMutation({
    mutationFn: (linkId: string) => scrumApi.deleteLink(linkId),
    onSuccess: refreshAll,
    onError: () => toast.error("Failed to unlink issue"),
  })

  return { clone, watch, vote, logWork, uploadAttachment, deleteAttachment, createLink, deleteLink }
}

/** Link/unlink existing TestCases and BugReports to a Task (set-semantics). */
export function useTraceabilityMutations(projectId: string, taskId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: scrumKeys.task(taskId), refetchType: "all" })
    invalidateTaskLists(qc, projectId)
  }
  const setTestCases = useMutation({
    mutationFn: (ids: string[]) => scrumApi.setTaskTestCases(taskId, ids),
    onSuccess: () => { invalidate(); toast.success("Test case links updated") },
    onError: () => toast.error("Failed to update test case links"),
  })
  const setBugs = useMutation({
    mutationFn: (ids: string[]) => scrumApi.setTaskBugs(taskId, ids),
    onSuccess: () => { invalidate(); toast.success("Bug links updated") },
    onError: () => toast.error("Failed to update bug links"),
  })
  return { setTestCases, setBugs }
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => scrumApi.createTask(projectId, body),
    onSuccess: (task) => {
      invalidateTaskLists(qc, projectId)
      toast.success(`Created ${task.key}`)
    },
    onError: () => toast.error("Failed to create task"),
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) =>
      scrumApi.updateTask(taskId, body),
    onSuccess: (task) => {
      invalidateTaskLists(qc, projectId)
      qc.invalidateQueries({ queryKey: scrumKeys.task(task.id), refetchType: "all" })
    },
    onError: () => toast.error("Failed to update task"),
  })
}

/**
 * Optimistic drag-move: patch every cached task list for the project so the
 * card jumps columns instantly, roll back all snapshots on error.
 */
export function useMoveTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: { status?: string; boardRank?: number; sprintId?: string | null } }) =>
      scrumApi.updateTask(taskId, body),
    onMutate: async ({ taskId, body }) => {
      await qc.cancelQueries({ queryKey: ["scrum", projectId, "tasks"] })
      const snapshots = qc.getQueriesData<ScrumTask[]>({ queryKey: ["scrum", projectId, "tasks"] })
      for (const [key, data] of snapshots) {
        if (!data) continue
        qc.setQueryData<ScrumTask[]>(
          key,
          data.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: (body.status as ScrumTask["status"]) ?? t.status,
                  boardRank: body.boardRank ?? t.boardRank,
                  sprintId: body.sprintId !== undefined ? body.sprintId : t.sprintId,
                }
              : t
          )
        )
      }
      return { snapshots }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error("Move failed — reverted")
    },
    onSettled: () => invalidateTaskLists(qc, projectId),
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => scrumApi.deleteTask(taskId),
    onSuccess: () => {
      invalidateTaskLists(qc, projectId)
      toast.success("Task deleted")
    },
    onError: () => toast.error("Failed to delete task"),
  })
}

// Subtasks — invalidate the single-task detail so progress recomputes.
export function useSubtaskMutations(projectId: string, taskId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: scrumKeys.task(taskId), refetchType: "all" })
    invalidateTaskLists(qc, projectId)
  }
  const add = useMutation({
    mutationFn: (title: string) => scrumApi.addSubtask(taskId, title),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to add subtask"),
  })
  const toggle = useMutation({
    mutationFn: ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) =>
      scrumApi.updateSubtask(subtaskId, { completed }),
    onSuccess: invalidate,
  })
  const rename = useMutation({
    mutationFn: ({ subtaskId, title }: { subtaskId: string; title: string }) =>
      scrumApi.updateSubtask(subtaskId, { title }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (subtaskId: string) => scrumApi.deleteSubtask(subtaskId),
    onSuccess: invalidate,
  })
  return { add, toggle, rename, remove }
}

// Comments
export function useCommentMutations(projectId: string, taskId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: scrumKeys.task(taskId), refetchType: "all" })
    invalidateTaskLists(qc, projectId)
  }
  const add = useMutation({
    mutationFn: (content: string) => scrumApi.addComment(taskId, content),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to add comment"),
  })
  const edit = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      scrumApi.updateComment(commentId, content),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (commentId: string) => scrumApi.deleteComment(commentId),
    onSuccess: invalidate,
  })
  return { add, edit, remove }
}

// Sprints
export function useSprintMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: scrumKeys.sprints(projectId), refetchType: "all" })
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => scrumApi.createSprint(projectId, body),
    onSuccess: () => {
      invalidate()
      toast.success("Sprint created")
    },
    onError: () => toast.error("Failed to create sprint"),
  })
  const update = useMutation({
    mutationFn: ({ sprintId, body }: { sprintId: string; body: Record<string, unknown> }) =>
      scrumApi.updateSprint(sprintId, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (sprintId: string) => scrumApi.deleteSprint(sprintId),
    onSuccess: () => {
      invalidate()
      toast.success("Sprint deleted")
    },
  })
  return { create, update, remove }
}

// Epics
export function useEpicMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: scrumKeys.epics(projectId), refetchType: "all" })
    invalidateTaskLists(qc, projectId)
  }
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => scrumApi.createEpic(projectId, body),
    onSuccess: () => {
      invalidate()
      toast.success("Epic created")
    },
    onError: () => toast.error("Failed to create epic"),
  })
  const update = useMutation({
    mutationFn: ({ epicId, body }: { epicId: string; body: Record<string, unknown> }) =>
      scrumApi.updateEpic(epicId, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (epicId: string) => scrumApi.deleteEpic(epicId),
    onSuccess: invalidate,
  })
  return { create, update, remove }
}

// Board columns
export function useColumnMutations(projectId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: scrumKeys.columns(projectId), refetchType: "all" })
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => scrumApi.createColumn(projectId, body),
    onSuccess: () => {
      invalidate()
      toast.success("Column added")
    },
  })
  const update = useMutation({
    mutationFn: ({ columnId, body }: { columnId: string; body: Record<string, unknown> }) =>
      scrumApi.updateColumn(columnId, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (columnId: string) => scrumApi.deleteColumn(columnId),
    onSuccess: () => {
      invalidate()
      toast.success("Column deleted")
    },
  })
  return { create, update, remove }
}
