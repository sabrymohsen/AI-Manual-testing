"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { io, Socket } from "socket.io-client"
import { toast } from "sonner"
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  MessageSquare,
  Mail,
  ClipboardList,
  Rocket,
  MessageCircle,
  Inbox,
} from "lucide-react"
import { useNotificationStore, AppNotification } from "@/stores/notificationStore"

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; accent: string; iconBg: string }> = {
  MENTION: { icon: MessageSquare, accent: "text-blue-600", iconBg: "bg-blue-50" },
  INVITATION: { icon: Mail, accent: "text-purple-600", iconBg: "bg-purple-50" },
  TASK_ASSIGNED: { icon: ClipboardList, accent: "text-green-600", iconBg: "bg-green-50" },
  SPRINT_STARTED: { icon: Rocket, accent: "text-orange-600", iconBg: "bg-orange-50" },
  COMMENT: { icon: MessageCircle, accent: "text-gray-600", iconBg: "bg-gray-100" },
  SYSTEM: { icon: Bell, accent: "text-slate-600", iconBg: "bg-slate-100" },
}

function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function NotificationBell({ token }: { token: string }) {
  const router = useRouter()
  const {
    notifications, unreadCount, panelOpen, filter, page, hasMore, loadingMore,
    setNotifications, appendNotifications, addNotification,
    markRead, markAllRead, remove,
    setPanelOpen, setFilter, setUnreadCount, setLoadingMore,
  } = useNotificationStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<Socket | null>(null)

  // Initial unread count for the badge.
  useEffect(() => {
    fetch("/api/notifications?unread=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUnreadCount(d.unreadCount) })
      .catch(() => {})
  }, [setUnreadCount])

  // Personal-room socket for real-time delivery.
  useEffect(() => {
    if (!token) return
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })
    socketRef.current = socket

    socket.on("notification", (n: AppNotification) => {
      addNotification(n)
      toast(n.title, { description: n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body })
    })

    return () => { socket.disconnect() }
  }, [token, addNotification])

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean, filterValue: "all" | "unread") => {
      setLoadingMore(true)
      try {
        const params = new URLSearchParams({ page: String(pageToLoad), limit: "20" })
        if (filterValue === "unread") params.set("filter", "unread")
        const res = await fetch(`/api/notifications?${params}`)
        if (res.ok) {
          const data = await res.json()
          if (replace) setNotifications(data.notifications, data.hasMore)
          else appendNotifications(data.notifications, data.hasMore)
          setUnreadCount(data.unreadCount)
        }
      } catch {
        // ignore — panel just shows what it has
      } finally {
        setLoadingMore(false)
      }
    },
    [setNotifications, appendNotifications, setUnreadCount, setLoadingMore]
  )

  // (Re)load list when the panel opens or the filter changes.
  useEffect(() => {
    if (panelOpen) loadPage(1, true, filter)
  }, [panelOpen, filter, loadPage])

  // Click outside closes the panel.
  useEffect(() => {
    if (!panelOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [panelOpen, setPanelOpen])

  async function handleMarkRead(n: AppNotification, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (n.read) return
    markRead(n.id)
    fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {})
  }

  async function handleMarkAllRead() {
    markAllRead()
    fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {})
  }

  async function handleDelete(n: AppNotification, e: React.MouseEvent) {
    e.stopPropagation()
    remove(n.id)
    fetch(`/api/notifications/${n.id}`, { method: "DELETE" }).catch(() => {})
  }

  function handleClick(n: AppNotification) {
    handleMarkRead(n)
    setPanelOpen(false)
    if (n.actionUrl) router.push(n.actionUrl)
  }

  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Notifications"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-bold">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b px-3 pt-1.5">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  filter === f
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
                {f === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-600">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Inbox className="h-10 w-10 text-slate-200" />
                <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Mentions, assignments, and project updates will show up here.
                </p>
              </div>
            ) : (
              <>
                {visible.map((n) => {
                  const meta = TYPE_META[n.type] || TYPE_META.SYSTEM
                  const Icon = meta.icon
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`group flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50 ${
                        !n.read ? "bg-indigo-50/40" : ""
                      }`}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconBg}`}>
                        <Icon className={`h-4 w-4 ${meta.accent}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`truncate text-[13px] ${!n.read ? "font-bold text-foreground" : "font-medium text-slate-700"}`}>
                            {n.title}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        {n.project && (
                          <span className="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            {n.project.name}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!n.read && (
                          <button
                            onClick={(e) => handleMarkRead(n, e)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(n, e)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {hasMore && (
                  <button
                    onClick={() => loadPage(page + 1, false, filter)}
                    disabled={loadingMore}
                    className="w-full py-2.5 text-center text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
