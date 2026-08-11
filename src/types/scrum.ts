// Shared client/server types for the spec-literal Scrum board.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "REVIEW" | "TESTING" | "DEPLOYED"
export type TaskPriority = "LOWEST" | "LOW" | "MEDIUM" | "HIGH" | "HIGHEST"
export type TaskType = "STORY" | "BUG" | "TASK" | "SUBTASK" | "EPIC" | "TEST_CASE"
export type TaskResolution = "DONE" | "WONT_FIX" | "DUPLICATE" | "CANNOT_REPRODUCE"
export type ScrumSprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED"

export type TaskLinkType = "blocks" | "is blocked by" | "relates to" | "duplicates" | "clones"

export interface TaskAttachment {
  id: string
  name: string
  url: string
  size: number
  mimeType: string
  taskId: string
  uploadedById: string | null
  uploadedBy: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
  createdAt: string
}

export interface WorkLog {
  id: string
  timeSpent: number // minutes
  description: string | null
  startedAt: string
  taskId: string
  userId: string | null
  user: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
  createdAt: string
}

export interface TaskLinkRef {
  id: string // link id
  type: string // phrased from this task's perspective
  createdAt: string
  task: {
    id: string
    key: string
    taskNumber: number
    title: string
    status: TaskStatus
    priority: TaskPriority
    type: TaskType
  }
}

export interface ScrumMember {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  role: string
}

export interface ScrumSubtask {
  id: string
  title: string
  description: string | null
  completed: boolean
  taskId: string
  assigneeId: string | null
  assignee: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
  createdAt: string
}

export interface ScrumComment {
  id: string
  content: string
  taskId: string
  authorId: string
  author: { id: string; name: string | null; email: string; avatarUrl: string | null }
  createdAt: string
  updatedAt: string
}

export interface ScrumActivity {
  id: string
  action: string
  details: string | null
  taskId: string
  userId: string | null
  user: { id: string; name: string | null; avatarUrl: string | null } | null
  createdAt: string
}

export interface ScrumEpic {
  id: string
  title: string
  description: string | null
  color: string
  projectId: string
  createdAt: string
  _count?: { tasks: number }
}

export interface ScrumSprint {
  id: string
  name: string
  goal: string | null
  status: ScrumSprintStatus
  startDate: string | null
  endDate: string | null
  projectId: string
  createdAt: string
  _count?: { tasks: number }
}

export interface BoardColumn {
  id: string
  name: string
  status: TaskStatus
  order: number
  wipLimit: number | null
  projectId: string
  createdAt: string
}

export interface LinkedTestCase {
  id: string
  title: string
  priority: string
  executionType: string
}

export interface LinkedBug {
  id: string
  bugKey: string | null
  title: string
  severity: string
  status: string
}

export interface ScrumTask {
  id: string
  taskNumber: number
  key: string // e.g. "SYS-101"
  title: string
  description: string | null
  type: TaskType
  resolution: TaskResolution | null
  status: TaskStatus
  priority: TaskPriority
  storyPoints: number | null
  dueDate: string | null
  branchName: string | null
  progress: number
  boardRank: number
  projectId: string
  sprintId: string | null
  epicId: string | null
  epic: { id: string; title: string; color: string } | null
  reporterId: string | null
  reporter: ScrumMember | null
  assignees: ScrumMember[]
  watchers: ScrumMember[]
  votedByIds?: string[]
  votes: number
  subtasks: ScrumSubtask[]
  comments?: ScrumComment[]
  activities?: ScrumActivity[]
  testCases?: LinkedTestCase[]
  bugs?: LinkedBug[]
  attachments?: TaskAttachment[]
  workLogs?: WorkLog[]
  links?: TaskLinkRef[]
  tags: string[]
  labels: string[]
  components: string[]
  fixVersions: string[]
  affectedVersions: string[]
  environment: string | null
  originalEstimate: number | null
  remainingEstimate: number | null
  timeSpent: number | null
  commentCount: number
  testCaseCount?: number
  bugCount?: number
  createdAt: string
  updatedAt: string
}

export interface TaskFilters {
  status?: TaskStatus[]
  priority?: TaskPriority[]
  assignee?: string[]
  sprint?: string
  epic?: string
  search?: string
  sort?: string
}
