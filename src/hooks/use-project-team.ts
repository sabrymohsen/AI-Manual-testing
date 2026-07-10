"use client"

import { useCallback, useEffect, useState } from "react"

export interface TeamMember {
  id: string
  projectId: string
  source: "synced" | "manual"
  provider: string | null
  externalId: string | null
  name: string
  email: string | null
  role: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Loads a project's assignee pool (ProjectTeamMember) and exposes CRUD + sync.
 * Plain fetch to match the app's convention (React Query is scoped to Scrum).
 */
export function useProjectTeam(projectId: string | null | undefined) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/team`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load team")
      setMembers(Array.isArray(data.members) ? data.members : [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    reload()
  }, [reload])

  const sync = useCallback(async () => {
    if (!projectId) return { ok: false, error: "No project" }
    const res = await fetch(`/api/projects/${projectId}/team/sync`, { method: "POST" })
    const data = await res.json()
    if (res.ok) setMembers(Array.isArray(data.members) ? data.members : members)
    return res.ok ? { ok: true, synced: data.synced, provider: data.provider } : { ok: false, error: data.error }
  }, [projectId, members])

  const addManual = useCallback(
    async (payload: { name: string; email?: string | null; role?: string | null }) => {
      if (!projectId) return { ok: false }
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) await reload()
      return res.ok ? { ok: true, member: data.member } : { ok: false, error: data.error }
    },
    [projectId, reload]
  )

  const updateMember = useCallback(
    async (memberId: string, patch: Partial<Pick<TeamMember, "role" | "name" | "email" | "active">>) => {
      if (!projectId) return { ok: false }
      // optimistic
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, ...patch } as TeamMember : m)))
      const res = await fetch(`/api/projects/${projectId}/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) await reload()
      return { ok: res.ok }
    },
    [projectId, reload]
  )

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!projectId) return { ok: false }
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      const res = await fetch(`/api/projects/${projectId}/team/${memberId}`, { method: "DELETE" })
      if (!res.ok) await reload()
      return { ok: res.ok }
    },
    [projectId, reload]
  )

  return { members, loading, error, reload, sync, addManual, updateMember, removeMember }
}
