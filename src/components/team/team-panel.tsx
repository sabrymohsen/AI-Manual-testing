"use client"

import { useState } from "react"
import { useProjectTeam } from "@/hooks/use-project-team"
import { RefreshCw, Plus, Trash2, UserPlus, Link2, Users } from "lucide-react"

/**
 * Projects → Team tab. Syncs the assignee pool from the connected management
 * tool (Jira/Azure/OpenProject/ClickUp), supports manual add, and inline
 * free-text role editing. Consumed everywhere via <AssigneeSelect>.
 */
export function TeamPanel({
  projectId,
  providerName,
  connected,
}: {
  projectId: string
  providerName?: string | null
  connected?: boolean
}) {
  const { members, loading, sync, addManual, updateMember, removeMember } = useProjectTeam(projectId)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", email: "", role: "" })

  async function handleSync() {
    setSyncing(true)
    setMsg(null)
    const r = await sync()
    setSyncing(false)
    setMsg(r.ok ? `Synced ${r.synced} member(s) from ${r.provider}.` : r.error || "Sync failed")
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    const r = await addManual({
      name: form.name.trim(),
      email: form.email.trim() || null,
      role: form.role.trim() || null,
    })
    if (r.ok) setForm({ name: "", email: "", role: "" })
  }

  const label = providerName || "management tool"

  return (
    <div className="space-y-6">
      {/* Header + sync */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="h-4.5 w-4.5 text-primary" /> Project Team
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The assignee pool for this project — used across Bug Reports, Test Cases and more. Pull users
            from your connected tool, then set an optional role for each.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSync}
            disabled={!connected || syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : `Sync from ${label}`}
          </button>
          {!connected && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600">
              <Link2 className="h-3 w-3" /> Connect an integration to sync users.
            </span>
          )}
          {msg && <span className="text-[10px] text-muted-foreground">{msg}</span>}
        </div>
      </div>

      {/* Manual add */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-muted-foreground" /> Add a member manually
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@team.com" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Role</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="QA Lead" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <button onClick={handleAdd} disabled={!form.name.trim()} className="inline-flex h-[38px] items-center gap-1 rounded-md bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Member table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] text-muted-foreground">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={`border-b last:border-0 ${m.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {m.name}
                    {!m.active && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.email || "—"}</td>
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={m.role ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (m.role ?? "")) updateMember(m.id, { role: v || null })
                      }}
                      placeholder="add role…"
                      className="w-32 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-input focus:border-input focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.source === "manual" ? "bg-amber-100 text-amber-700" : "bg-primary/15 text-primary"}`}>
                      {m.source === "manual" ? "manual" : m.provider || "synced"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => removeMember(m.id)} className="text-muted-foreground hover:text-red-600" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No team members yet. Sync from your tool or add one manually."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
