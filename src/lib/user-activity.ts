import { prisma } from "./db"

export type UserActivityType =
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "SPRINT_STARTED"
  | "SPRINT_COMPLETED"
  | "PROJECT_JOINED"
  | "PROFILE_UPDATED"
  | "FILE_UPLOADED"
  | "WORK_LOGGED"
  | "PASSWORD_CHANGED"

/** Fire-and-forget entry in the profile-page activity feed. Never throws. */
export async function logUserActivity(
  userId: string,
  type: UserActivityType,
  description: string,
  projectId?: string | null
) {
  try {
    await prisma.userActivity.create({
      data: { userId, type, description, projectId: projectId ?? null },
    })
  } catch (err) {
    console.error("logUserActivity failed:", err)
  }
}
