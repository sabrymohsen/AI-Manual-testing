/**
 * Presence freshness rules.
 *
 * `Presence.isOnline` on its own is a *sticky* flag: it is set true by the
 * heartbeat / socket join and only ever set false by the socket `disconnect`
 * handler. Any time that handler doesn't run — the container is redeployed or
 * SIGKILLed, the browser tab is closed while the network is down, a laptop
 * sleeps — the row is left `isOnline: true` forever and the user shows as
 * online permanently.
 *
 * So online is derived from `lastSeen` freshness instead: a user counts as
 * online only while they are still heartbeating. That is self-healing (it needs
 * no cleanup job and survives restarts) and correct across multiple replicas.
 */

/** How often the client posts /api/presence/heartbeat. */
export const PRESENCE_HEARTBEAT_MS = 25_000

/**
 * How long a presence row stays "online" after its last heartbeat. Two missed
 * heartbeats plus slack, so a brief hiccup doesn't flicker the dot.
 */
export const PRESENCE_TTL_MS = 70_000

/** True only when the user is flagged online *and* still heartbeating. */
export function isPresenceFresh(
  presence: { isOnline: boolean; lastSeen: Date | string | null | undefined },
  now: number = Date.now()
): boolean {
  if (!presence.isOnline || !presence.lastSeen) return false
  const lastSeen = new Date(presence.lastSeen).getTime()
  if (Number.isNaN(lastSeen)) return false
  return now - lastSeen < PRESENCE_TTL_MS
}

/** Prisma filter selecting rows whose "online" flag has gone stale. */
export function stalePresenceWhere(now: number = Date.now()) {
  return { isOnline: true, lastSeen: { lt: new Date(now - PRESENCE_TTL_MS) } }
}
