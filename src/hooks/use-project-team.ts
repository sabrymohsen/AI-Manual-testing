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
// Every assignee picker on a page used to load the team on its own (3+ requests
// per page). Share one request per project briefly; changes reload for real.
const teamCache = new Map<string, { at: number; promise: Promise<{ ok: boolean; data: any }> }>()
function loadTeam(projectId: string, fresh: boolean) {
  const hit = teamCache.get(projectId)
  if (!fresh && hit && Date.now() - hit.at < 15_000) return hit.promise
  const promise = fetch(`/api/projects/${projectId}/team`).then(async (res) => ({ ok: res.ok, data: await res.json() }))
  teamCache.set(projectId, { at: Date.now(), promise })
  promise.catch(() => teamCache.delete(projectId))
  return promise
}

export function useProjectTeam(projectId: string | null | undefined) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (fresh: boolean) => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const { ok, data } = await loadTeam(projectId, fresh)
      if (!ok) throw new Error(data.error || "Failed to load team")
      setMembers(Array.isArray(data.members) ? data.members : [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])
  const reload = useCallback(() => load(true), [load])

  useEffect(() => {
    load(false)
  }, [load])

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
