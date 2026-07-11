import { prisma } from "./db"

export type NotificationType =
  | "MENTION"
  | "INVITATION"
  | "TASK_ASSIGNED"
  | "SPRINT_STARTED"
  | "COMMENT"
  | "SYSTEM"

export interface NotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown> | null
  projectId?: string | null
  actionUrl?: string | null
}

const SOCKET_INTERNAL_URL = process.env.SOCKET_INTERNAL_URL || "http://localhost:3001"
const INTERNAL_TOKEN = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "your-secret-key"

const notificationInclude = {
  project: { select: { id: true, name: true } },
} as const

/**
 * Persist notifications and push them to each recipient's personal socket
 * room (`user:{userId}`) in real time. The socket server runs as a separate
 * process, so the push goes over a localhost HTTP endpoint it exposes;
 * failures there are swallowed — the notification is already persisted and
 * will appear on the next fetch.
 */
export async function notify(input: NotificationInput | NotificationInput[]) {
  const inputs = Array.isArray(input) ? input : [input]
  if (inputs.length === 0) return []

  const created = await prisma.$transaction(
    inputs.map((n) =>
      prisma.notification.create({
        data: {
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          data: (n.data as any) ?? undefined,
          projectId: n.projectId ?? null,
          actionUrl: n.actionUrl ?? null,
        },
        include: notificationInclude,
      })
    )
  )

  pushToSocket(created).catch(() => {})
  return created
}

async function pushToSocket(notifications: unknown[]) {
  try {
    await fetch(`${SOCKET_INTERNAL_URL}/internal/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ notifications }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Socket server not running — persisted notification still shows on next load.
  }
}
