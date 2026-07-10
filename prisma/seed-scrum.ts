/**
 * Seed for the spec-literal Scrum board (Task / BoardColumn / ScrumSprint /
 * ScrumEpic / Comment / Subtask / Activity). Idempotent: it resets ONLY the
 * demo "System Platform" (SYS) project's scrum data and recreates it, leaving
 * every other project and the existing Requirement-based board untouched.
 *
 *   Run:  npx tsx prisma/seed-scrum.ts
 */
import { PrismaClient, TaskStatus, TaskPriority, ScrumSprintStatus } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const PROJECT_ID = "scrum-sys-project"
const SPRINT_ID = "scrum-sys-sprint-active"

const USERS = [
  { id: "scrum-u1", email: "alex@qaengine.dev", name: "Alex Morgan", avatarUrl: "https://i.pravatar.cc/128?img=12", role: "admin" },
  { id: "scrum-u2", email: "sarah@qaengine.dev", name: "Sarah Kim", avatarUrl: "https://i.pravatar.cc/128?img=5", role: "manager" },
  { id: "scrum-u3", email: "emma@qaengine.dev", name: "Emma Watson", avatarUrl: "https://i.pravatar.cc/128?img=47", role: "member" },
  { id: "scrum-u4", email: "james@qaengine.dev", name: "James Lee", avatarUrl: "https://i.pravatar.cc/128?img=68", role: "member" },
  { id: "scrum-u5", email: "nina@qaengine.dev", name: "Nina Patel", avatarUrl: "https://i.pravatar.cc/128?img=32", role: "member" },
]

const EPICS = [
  { id: "scrum-epic-auth", title: "Authentication & Access", description: "OAuth, sessions, RBAC.", color: "#2563eb" },
  { id: "scrum-epic-platform", title: "Core Platform", description: "Database, APIs, infrastructure.", color: "#7c3aed" },
  { id: "scrum-epic-quality", title: "Quality & Docs", description: "Testing, documentation, DX.", color: "#059669" },
]

const COLUMNS = [
  { name: "To Do", status: TaskStatus.TODO, order: 0 },
  { name: "In Progress", status: TaskStatus.IN_PROGRESS, order: 1 },
  { name: "In Review", status: TaskStatus.REVIEW, order: 2 },
  { name: "Done", status: TaskStatus.DONE, order: 3 },
]

const d = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000)

type SeedTask = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  storyPoints: number
  branchName?: string
  dueDate?: Date
  progress: number
  epicId?: string
  assignees: string[]
  tags: string[]
  subtasks: { title: string; completed: boolean }[]
  comments: { authorId: string; content: string }[]
}

const TASKS: SeedTask[] = [
  {
    title: "Implement new authentication flow using OAuth 2.0",
    description: "Configure secure authorization endpoints, token verification middleware, and integrate Google OAuth.",
    status: TaskStatus.TODO, priority: TaskPriority.HIGHEST, storyPoints: 8, branchName: "feat/oauth-flow",
    dueDate: d(4), progress: 0, epicId: "scrum-epic-auth", assignees: ["scrum-u1"], tags: ["security", "auth"],
    subtasks: [
      { title: "Set up auth backend routes", completed: true },
      { title: "Integrate OAuth provider credentials", completed: false },
      { title: "Add token refresh handling", completed: false },
    ],
    comments: [{ authorId: "scrum-u1", content: "Need to verify scopes in production environments." }],
  },
  {
    title: "Design database schema for user profiles",
    description: "Analyze profile parameters, create PostgreSQL tables, migrate fields, run indexing.",
    status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, storyPoints: 5, dueDate: d(6), progress: 0,
    epicId: "scrum-epic-platform", assignees: ["scrum-u2"], tags: ["database"],
    subtasks: [
      { title: "Draft ER diagram", completed: true },
      { title: "Write migration", completed: false },
      { title: "Add indexes for search", completed: false },
    ],
    comments: [],
  },
  {
    title: "Update API documentation with new endpoints",
    description: "Document route specs, response payloads, error models, add sample curl requests.",
    status: TaskStatus.TODO, priority: TaskPriority.LOW, storyPoints: 2, dueDate: d(10), progress: 0,
    epicId: "scrum-epic-quality", assignees: [], tags: ["docs"], subtasks: [], comments: [],
  },
  {
    title: "Refactor legacy navigation component to new design system",
    description: "Replace legacy header code with responsive components aligned to design tokens.",
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, storyPoints: 5, branchName: "feat/nav-redesign",
    dueDate: d(-1), progress: 60, epicId: "scrum-epic-platform", assignees: ["scrum-u2", "scrum-u3"], tags: ["ui-ux"],
    subtasks: [
      { title: "Build nav shell", completed: true },
      { title: "Wire active states", completed: true },
      { title: "Mobile drawer", completed: false },
    ],
    comments: [{ authorId: "scrum-u3", content: "Mobile breakpoint still needs work." }],
  },
  {
    title: "Write integration tests for payment gateway",
    description: "Simulate card authorizations, recurring billing webhooks, and failure fallback modes.",
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, storyPoints: 8, branchName: "test/payments",
    dueDate: d(3), progress: 35, epicId: "scrum-epic-quality", assignees: ["scrum-u4"], tags: ["qa", "payments"],
    subtasks: [
      { title: "Mock gateway sandbox", completed: true },
      { title: "Happy-path suite", completed: false },
    ],
    comments: [],
  },
  {
    title: "Build client dashboard layout with responsive styling",
    description: "Implement modern grid framework with dark mode support.",
    status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, storyPoints: 5, branchName: "feat/dashboard",
    dueDate: d(5), progress: 45, epicId: "scrum-epic-platform", assignees: ["scrum-u1"], tags: ["ui-ux"],
    subtasks: [{ title: "KPI cards", completed: true }, { title: "Charts", completed: false }],
    comments: [],
  },
  {
    title: "Refactor session handlers to JWT cookies",
    description: "Secure session cookie config and add CSRF guard validation.",
    status: TaskStatus.REVIEW, priority: TaskPriority.HIGHEST, storyPoints: 13, branchName: "feat/jwt-auth",
    dueDate: d(2), progress: 90, epicId: "scrum-epic-auth", assignees: ["scrum-u2"], tags: ["security"],
    subtasks: [{ title: "Sign & verify JWT", completed: true }, { title: "CSRF middleware", completed: true }],
    comments: [{ authorId: "scrum-u2", content: "Ready for review — CSRF added." }],
  },
  {
    title: "Optimize viewport layouts in board view",
    description: "Fix text overflow, horizontal scroll shifts, and spacing metrics.",
    status: TaskStatus.REVIEW, priority: TaskPriority.MEDIUM, storyPoints: 3, branchName: "fix/viewport",
    dueDate: d(1), progress: 80, epicId: "scrum-epic-platform", assignees: ["scrum-u3"], tags: ["ui-ux"],
    subtasks: [], comments: [],
  },
  {
    title: "Configure security certificates for staging gateways",
    description: "Set up Let's Encrypt certs, renewal hooks, and force SSL redirects.",
    status: TaskStatus.DONE, priority: TaskPriority.HIGH, storyPoints: 3, dueDate: d(-3), progress: 100,
    epicId: "scrum-epic-auth", assignees: ["scrum-u1"], tags: ["security", "infra"],
    subtasks: [{ title: "Issue certs", completed: true }, { title: "Auto-renew cron", completed: true }],
    comments: [],
  },
  {
    title: "Draft release notes documentation for product scope",
    description: "Detail release notes, customer impact profiles, and upgrade sequences.",
    status: TaskStatus.DONE, priority: TaskPriority.LOW, storyPoints: 2, dueDate: d(-5), progress: 100,
    epicId: "scrum-epic-quality", assignees: ["scrum-u5"], tags: ["docs"],
    subtasks: [{ title: "Collect changelog", completed: true }],
    comments: [{ authorId: "scrum-u5", content: "Published to the wiki." }],
  },
]

async function main() {
  console.log("🌱 Seeding Scrum board (SYS)...")

  const passwordHash = await bcrypt.hash("password123", 12)
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, avatarUrl: u.avatarUrl },
      create: { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, passwordHash },
    })
  }
  // Own the demo project with a REAL developer account so the board is usable
  // when logged in as yourself (the API's requireProjectOwner checks userId).
  // Prefer an explicit email, else the first non-seed user, else fall back to
  // the seed user. Override with SCRUM_OWNER_EMAIL if desired.
  const ownerEmail = process.env.SCRUM_OWNER_EMAIL || "sabrymohsen94@gmail.com"
  const realOwner =
    (await prisma.user.findUnique({ where: { email: ownerEmail } })) ??
    (await prisma.user.findFirst({
      where: { NOT: { id: { startsWith: "scrum-u" } } },
      orderBy: { createdAt: "asc" },
    }))
  const ownerId = realOwner?.id ?? USERS[0].id

  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: { boardKey: "SYS", userId: ownerId },
    create: {
      id: PROJECT_ID,
      name: "System Platform",
      webAppUrl: "https://app.system-platform.example",
      description: "Demo project for the QA Engine Scrum board.",
      boardKey: "SYS",
      userId: ownerId,
    },
  })

  // Reset only this project's scrum data (cascades to subtasks/comments/activities).
  await prisma.task.deleteMany({ where: { projectId: PROJECT_ID } })
  await prisma.scrumSprint.deleteMany({ where: { projectId: PROJECT_ID } })
  await prisma.scrumEpic.deleteMany({ where: { projectId: PROJECT_ID } })
  await prisma.boardColumn.deleteMany({ where: { projectId: PROJECT_ID } })
  await prisma.projectMember.deleteMany({ where: { projectId: PROJECT_ID } })

  for (const u of USERS) {
    await prisma.projectMember.create({
      data: { projectId: PROJECT_ID, userId: u.id, role: u.role },
    })
  }
  // Add the real owner as an admin member too (skip if they were the seed fallback).
  if (realOwner && !USERS.some((u) => u.id === ownerId)) {
    await prisma.projectMember.create({
      data: { projectId: PROJECT_ID, userId: ownerId, role: "admin" },
    })
  }

  for (const c of COLUMNS) {
    await prisma.boardColumn.create({
      data: { projectId: PROJECT_ID, name: c.name, status: c.status, order: c.order },
    })
  }

  await prisma.scrumSprint.create({
    data: {
      id: SPRINT_ID, projectId: PROJECT_ID, name: "Sprint 24",
      goal: "Ship OAuth, profile schema, and the new dashboard layout.",
      status: ScrumSprintStatus.ACTIVE, startDate: d(-7), endDate: d(7),
    },
  })

  for (const e of EPICS) {
    await prisma.scrumEpic.create({
      data: { id: e.id, projectId: PROJECT_ID, title: e.title, description: e.description, color: e.color },
    })
  }

  let rank = 0
  for (const t of TASKS) {
    const task = await prisma.task.create({
      data: {
        projectId: PROJECT_ID,
        sprintId: SPRINT_ID,
        epicId: t.epicId ?? null,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        storyPoints: t.storyPoints,
        branchName: t.branchName ?? null,
        dueDate: t.dueDate ?? null,
        progress: t.progress,
        boardRank: rank++,
        tags: t.tags,
        assignees: { connect: t.assignees.map((id) => ({ id })) },
        subtasks: { create: t.subtasks },
        comments: { create: t.comments },
        activities: {
          create: [
            { action: "created", details: "Task created", userId: t.assignees[0] ?? ownerId },
            ...t.comments.map((c) => ({ action: "commented", details: c.content, userId: c.authorId })),
          ],
        },
      },
    })
    console.log(`  ✅ ${task.title.slice(0, 40)}… (SYS-${task.taskNumber})`)
  }

  console.log(`\n✨ Done. Project id: ${PROJECT_ID}`)
  console.log(`   Open: /projects/${PROJECT_ID}/scrum`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
