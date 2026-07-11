import { create } from "zustand"

export interface AppNotification {
  id: string
  type: "MENTION" | "INVITATION" | "TASK_ASSIGNED" | "SPRINT_STARTED" | "COMMENT" | "SYSTEM" | string
  title: string
  body: string
  data?: Record<string, unknown> | null
  projectId: string | null
  project?: { id: string; name: string } | null
  actionUrl: string | null
  read: boolean
  readAt: string | Date | null
  createdAt: string | Date
}

interface NotificationStore {
  notifications: AppNotification[]
  unreadCount: number
  panelOpen: boolean
  filter: "all" | "unread"
  page: number
  hasMore: boolean
  loadingMore: boolean
  initialized: boolean

  setNotifications: (items: AppNotification[], hasMore: boolean) => void
  appendNotifications: (items: AppNotification[], hasMore: boolean) => void
  addNotification: (item: AppNotification) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  setPanelOpen: (open: boolean) => void
  setFilter: (filter: "all" | "unread") => void
  setUnreadCount: (count: number) => void
  setPage: (page: number) => void
  setLoadingMore: (loading: boolean) => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  panelOpen: false,
  filter: "all",
  page: 1,
  hasMore: false,
  loadingMore: false,
  initialized: false,

  setNotifications: (items, hasMore) =>
    set({ notifications: items, hasMore, page: 1, initialized: true }),

  appendNotifications: (items, hasMore) =>
    set((s) => {
      const known = new Set(s.notifications.map((n) => n.id))
      return {
        notifications: [...s.notifications, ...items.filter((n) => !known.has(n.id))],
        hasMore,
        page: s.page + 1,
      }
    }),

  addNotification: (item) =>
    set((s) => {
      if (s.notifications.some((n) => n.id === item.id)) return {}
      return {
        notifications: [item, ...s.notifications],
        unreadCount: item.read ? s.unreadCount : s.unreadCount + 1,
      }
    }),

  markRead: (id) =>
    set((s) => {
      const target = s.notifications.find((n) => n.id === id)
      return {
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read: true, readAt: new Date() } : n
        ),
        unreadCount: target && !target.read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }
    }),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true, readAt: new Date() })),
      unreadCount: 0,
    })),

  remove: (id) =>
    set((s) => {
      const target = s.notifications.find((n) => n.id === id)
      return {
        notifications: s.notifications.filter((n) => n.id !== id),
        unreadCount: target && !target.read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }
    }),

  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setFilter: (filter) => set({ filter }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setPage: (page) => set({ page }),
  setLoadingMore: (loadingMore) => set({ loadingMore }),
}))
