import { prisma } from "./db"

export type NotificationType =
  | "MENTION"
  | "INVITATION"
  | "TASK_ASSIGNED"
  | "SPRINT_STARTED"
  | "COMMENT"
  | "CHAT_MESSAGE"
  | "BUG_ASSIGNED"
  | "BUG_STATUS"
  | "TEST_CASE_ASSIGNED"
  | "TASK_MOVED"
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

/**
 * Hand a chat message saved over HTTP to the socket server, which broadcasts it
 * to the open conversation and bumps unread badges everywhere else. Without
 * this, messages sent while the sender's socket was down stayed invisible to
 * others until they reloaded.
 */
export async function pushChatMessage(payload: {
  message: unknown
  channel: { id: string; type: string; projectId: string }
  senderId: string
}) {
  try {
    await fetch(`${SOCKET_INTERNAL_URL}/internal/chat-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": INTERNAL_TOKEN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Socket server down: the message is saved and shows on the next load.
  }
}

/** An entity referenced from a chat message via `#`. */
export interface EntityMention {
  type: string
  id: string
  label: string
  key?: string
  url?: string
}

/**
 * Build the "new message in a channel" notifications.
 *
 * Shared by the HTTP send path and the socket server so both produce identical
 * payloads. Recipient selection stays with the caller — only the socket server
 * can see who is currently sitting in the channel room.
 */
export function buildChannelMessageNotifications(opts: {
  channel: { id: string; name: string | null; projectId: string | null; type?: string | null }
  senderName: string
  content: string
  recipientIds: string[]
  entityMentions?: EntityMention[] | null
}): NotificationInput[] {
  const { channel, senderName, content, recipientIds } = opts
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 140)
  const isDM = channel.type === "DIRECT"

  // Referenced entities make a message worth opening, so name them up front.
  const refs = (opts.entityMentions ?? [])
    .map((m) => m.key || m.label)
    .filter(Boolean)
    .slice(0, 3)
  const refHint = refs.length ? `. Mentions ${refs.join(", ")}` : ""

  return recipientIds.map((userId) => ({
    userId,
    type: "CHAT_MESSAGE" as const,
    title: isDM ? `${senderName} sent you a message` : `New message in #${channel.name || "channel"}`,
    body: isDM ? `${preview}${refHint}` : `${senderName}: ${preview}${refHint}`,
    projectId: channel.projectId ?? null,
    actionUrl: chatUrl(channel.projectId, channel.id),
    data: { channelId: channel.id },
  }))
}

/** Link that opens Team Chat on one conversation. */
export function chatUrl(projectId: string | null | undefined, channelId: string, messageId?: string) {
  if (!projectId) return "/dashboard"
  return `/projects/${projectId}/team-chat?channel=${channelId}${messageId ? `&message=${messageId}` : ""}`
}

/**
 * Who should hear about a new message. A public channel belongs to the whole
 * project, so it is everyone on the project, not only the people who happen to
 * have a ChannelMember row (until now that was just the channel's creator, so
 * public-channel messages notified almost nobody). Private channels and DMs
 * stay limited to their members.
 */
export async function channelAudienceIds(channel: { id: string; type: string; projectId: string }): Promise<string[]> {
  if (channel.type === "PUBLIC") {
    const project = await prisma.project.findUnique({
      where: { id: channel.projectId },
      select: { userId: true, projectMembers: { select: { userId: true } } },
    })
    if (!project) return []
    return Array.from(new Set([project.userId, ...project.projectMembers.map((m) => m.userId)].filter(Boolean) as string[]))
  }
  const members = await prisma.channelMember.findMany({ where: { channelId: channel.id }, select: { userId: true } })
  return members.map((m) => m.userId)
}

/**
 * Warn once at startup if the socket bridge URL looks wrong. A misconfigured
 * SOCKET_INTERNAL_URL fails silently — notifications still persist, they just
 * never arrive in real time, which is hard to spot.
 */
export function checkSocketBridgeConfig() {
  const configured = process.env.SOCKET_INTERNAL_URL
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[notifications] SOCKET_INTERNAL_URL is not set — falling back to ${SOCKET_INTERNAL_URL}. ` +
          `In production the socket server is rarely on localhost:3001, so real-time ` +
          `notification pushes will silently fail (they will still appear on reload).`
      )
    }
    return
  }
  try {
    // eslint-disable-next-line no-new
    new URL(configured)
  } catch {
    console.warn(`[notifications] SOCKET_INTERNAL_URL is not a valid URL: "${configured}"`)
  }
}
