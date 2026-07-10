import axios from "axios"
import type {
  ScrumTask,
  ScrumSprint,
  ScrumEpic,
  BoardColumn,
  ScrumMember,
  ScrumActivity,
  ScrumSubtask,
  ScrumComment,
  TaskFilters,
  LinkedTestCase,
  LinkedBug,
  TaskAttachment,
  WorkLog,
  TaskLinkType,
} from "@/types/scrum"

export const http = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } })

function filtersToParams(f: TaskFilters): URLSearchParams {
  const p = new URLSearchParams()
  f.status?.forEach((s) => p.append("status", s))
  f.priority?.forEach((s) => p.append("priority", s))
  f.assignee?.forEach((s) => p.append("assignee", s))
  if (f.sprint) p.set("sprint", f.sprint)
  if (f.epic) p.set("epic", f.epic)
  if (f.search) p.set("search", f.search)
  if (f.sort) p.set("sort", f.sort)
  return p
}

export const scrumApi = {
  // Tasks
  listTasks: (projectId: string, filters: TaskFilters = {}) =>
    http
      .get<{ tasks: ScrumTask[] }>(`/projects/${projectId}/scrum/tasks?${filtersToParams(filters)}`)
      .then((r) => r.data.tasks),
  getTask: (taskId: string) =>
    http.get<{ task: ScrumTask }>(`/scrum/tasks/${taskId}`).then((r) => r.data.task),
  createTask: (projectId: string, body: Record<string, unknown>) =>
    http.post<{ task: ScrumTask }>(`/projects/${projectId}/scrum/tasks`, body).then((r) => r.data.task),
  updateTask: (taskId: string, body: Record<string, unknown>) =>
    http.patch<{ task: ScrumTask }>(`/scrum/tasks/${taskId}`, body).then((r) => r.data.task),
  deleteTask: (taskId: string) => http.delete(`/scrum/tasks/${taskId}`).then((r) => r.data),
  cloneTask: (taskId: string) =>
    http.post<{ task: ScrumTask }>(`/scrum/tasks/${taskId}/clone`).then((r) => r.data.task),
  toggleWatch: (taskId: string) =>
    http.post<{ task: ScrumTask; watching: boolean }>(`/scrum/tasks/${taskId}/watch`).then((r) => r.data),
  toggleVote: (taskId: string) =>
    http.post<{ task: ScrumTask; voted: boolean }>(`/scrum/tasks/${taskId}/vote`).then((r) => r.data),

  // Work logs
  listWorkLogs: (taskId: string) =>
    http.get<{ workLogs: WorkLog[] }>(`/scrum/tasks/${taskId}/work-logs`).then((r) => r.data.workLogs),
  addWorkLog: (taskId: string, body: { timeSpent: number; description?: string | null; startedAt?: string }) =>
    http.post<{ task: ScrumTask }>(`/scrum/tasks/${taskId}/work-logs`, body).then((r) => r.data.task),

  // Attachments
  uploadAttachment: (taskId: string, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append("file", file)
    return http
      .post<{ attachment: TaskAttachment }>(`/scrum/tasks/${taskId}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      .then((r) => r.data.attachment)
  },
  deleteAttachment: (attachmentId: string) =>
    http.delete(`/scrum/task-attachments/${attachmentId}`).then((r) => r.data),

  // Issue links
  createLink: (body: { sourceId: string; targetId: string; type: TaskLinkType }) =>
    http.post(`/scrum/task-links`, body).then((r) => r.data),
  deleteLink: (linkId: string) => http.delete(`/scrum/task-links/${linkId}`).then((r) => r.data),

  // Labels / components / versions autocomplete
  listLabels: (projectId: string) =>
    http
      .get<{ labels: string[]; components: string[]; versions: string[] }>(
        `/projects/${projectId}/scrum/labels`
      )
      .then((r) => r.data),

  // Subtasks
  addSubtask: (taskId: string, title: string) =>
    http.post<{ subtask: ScrumSubtask }>(`/scrum/tasks/${taskId}/subtasks`, { title }).then((r) => r.data.subtask),
  updateSubtask: (subtaskId: string, body: { title?: string; completed?: boolean }) =>
    http.patch<{ subtask: ScrumSubtask }>(`/scrum/subtasks/${subtaskId}`, body).then((r) => r.data.subtask),
  deleteSubtask: (subtaskId: string) => http.delete(`/scrum/subtasks/${subtaskId}`).then((r) => r.data),

  // Comments
  addComment: (taskId: string, content: string) =>
    http.post<{ comment: ScrumComment }>(`/scrum/tasks/${taskId}/comments`, { content }).then((r) => r.data.comment),
  updateComment: (commentId: string, content: string) =>
    http.patch<{ comment: ScrumComment }>(`/scrum/comments/${commentId}`, { content }).then((r) => r.data.comment),
  deleteComment: (commentId: string) => http.delete(`/scrum/comments/${commentId}`).then((r) => r.data),

  // Sprints
  listSprints: (projectId: string) =>
    http.get<{ sprints: ScrumSprint[] }>(`/projects/${projectId}/scrum/sprints`).then((r) => r.data.sprints),
  createSprint: (projectId: string, body: Record<string, unknown>) =>
    http.post<{ sprint: ScrumSprint }>(`/projects/${projectId}/scrum/sprints`, body).then((r) => r.data.sprint),
  updateSprint: (sprintId: string, body: Record<string, unknown>) =>
    http.patch<{ sprint: ScrumSprint }>(`/scrum/sprints/${sprintId}`, body).then((r) => r.data.sprint),
  deleteSprint: (sprintId: string) => http.delete(`/scrum/sprints/${sprintId}`).then((r) => r.data),

  // Epics
  listEpics: (projectId: string) =>
    http.get<{ epics: ScrumEpic[] }>(`/projects/${projectId}/scrum/epics`).then((r) => r.data.epics),
  createEpic: (projectId: string, body: Record<string, unknown>) =>
    http.post<{ epic: ScrumEpic }>(`/projects/${projectId}/scrum/epics`, body).then((r) => r.data.epic),
  updateEpic: (epicId: string, body: Record<string, unknown>) =>
    http.patch<{ epic: ScrumEpic }>(`/scrum/epics/${epicId}`, body).then((r) => r.data.epic),
  deleteEpic: (epicId: string) => http.delete(`/scrum/epics/${epicId}`).then((r) => r.data),

  // Board columns
  listColumns: (projectId: string) =>
    http.get<{ columns: BoardColumn[] }>(`/projects/${projectId}/scrum/board-columns`).then((r) => r.data.columns),
  createColumn: (projectId: string, body: Record<string, unknown>) =>
    http.post<{ column: BoardColumn }>(`/projects/${projectId}/scrum/board-columns`, body).then((r) => r.data.column),
  updateColumn: (columnId: string, body: Record<string, unknown>) =>
    http.patch<{ column: BoardColumn }>(`/scrum/board-columns/${columnId}`, body).then((r) => r.data.column),
  deleteColumn: (columnId: string) => http.delete(`/scrum/board-columns/${columnId}`).then((r) => r.data),

  // Traceability links (Task ↔ TestCase / Bug)
  linkables: (projectId: string) =>
    http
      .get<{ testCases: LinkedTestCase[]; bugs: LinkedBug[] }>(`/projects/${projectId}/scrum/linkables`)
      .then((r) => r.data),
  setTaskTestCases: (taskId: string, testCaseIds: string[]) =>
    http
      .post<{ testCases: LinkedTestCase[] }>(`/scrum/tasks/${taskId}/test-cases`, { testCaseIds })
      .then((r) => r.data.testCases),
  setTaskBugs: (taskId: string, bugIds: string[]) =>
    http.post<{ bugs: LinkedBug[] }>(`/scrum/tasks/${taskId}/bugs`, { bugIds }).then((r) => r.data.bugs),

  // Members & activities
  listMembers: (projectId: string) =>
    http.get<{ members: ScrumMember[] }>(`/projects/${projectId}/scrum/members`).then((r) => r.data.members),
  listActivities: (projectId: string, limit = 50) =>
    http.get<{ activities: ScrumActivity[] }>(`/projects/${projectId}/scrum/activities?limit=${limit}`).then((r) => r.data.activities),
}

/** Central query-key factory so mutations can invalidate precisely. */
export const scrumKeys = {
  all: (projectId: string) => ["scrum", projectId] as const,
  tasks: (projectId: string, filters?: TaskFilters) =>
    ["scrum", projectId, "tasks", filters ?? {}] as const,
  task: (taskId: string) => ["scrum", "task", taskId] as const,
  sprints: (projectId: string) => ["scrum", projectId, "sprints"] as const,
  epics: (projectId: string) => ["scrum", projectId, "epics"] as const,
  columns: (projectId: string) => ["scrum", projectId, "columns"] as const,
  members: (projectId: string) => ["scrum", projectId, "members"] as const,
  linkables: (projectId: string) => ["scrum", projectId, "linkables"] as const,
  activities: (projectId: string) => ["scrum", projectId, "activities"] as const,
  labels: (projectId: string) => ["scrum", projectId, "labels"] as const,
}
