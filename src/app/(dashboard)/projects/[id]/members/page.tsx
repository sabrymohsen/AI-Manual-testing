"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Users, UserPlus, MoreHorizontal, Copy, Check, Trash2, Shield, Info, X, Loader2 } from "lucide-react"
import { usePermission } from "@/hooks/usePermission"
import { usePermissionStore } from "@/stores/permissionStore"
import { PROJECT_ROLES, type ProjectRole } from "@/lib/permissions"

interface Member {
  id: string
  userId: string
  role: ProjectRole
  isCreator: boolean
  joinedAt: string | null
  user: { id: string; name: string | null; email: string; avatarUrl: string | null }
}
interface Invitation {
  id: string
  email: string
  role: string
  status: string
  createdAt: string
  invitedBy?: { name: string | null; email: string } | null
}

const ROLE_BADGE: Record<string, string> = {
  Owner: "bg-purple-100 text-purple-700 border-purple-200",
  Admin: "bg-blue-100 text-blue-700 border-blue-200",
  Member: "bg-slate-100 text-slate-700 border-slate-200",
  Viewer: "bg-slate-50 text-slate-500 border-slate-200",
}
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-slate-100 text-slate-500",
}

function initials(name: string | null, email: string) {
  const s = (name || email).trim()
  return s.slice(0, 2).toUpperCase()
}

export default function MembersPage() {
  const params = useParams()
  const projectId = params.id as string
  const { can, canManageProject } = usePermission()
  const manage = canManageProject()

  const [tab, setTab] = useState<"members" | "invitations">("members")
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // NB: don't depend on `can` from usePermission() — it's a new function every
  // render, which would make `load` unstable and loop the effect. Read the
  // store directly instead.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const canInvite = usePermissionStore.getState().can("canInviteMembers")
      const [mRes, iRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`),
        canInvite ? fetch(`/api/projects/${projectId}/invitations`) : Promise.resolve(null),
      ])
      if (mRes.ok) setMembers((await mRes.json()).members || [])
      if (iRes && iRes.ok) setInvitations((await iRes.json()).invitations || [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  async function changeRole(userId: string, role: string) {
    setMenuFor(null)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) setError((await res.json().catch(() => ({})))?.error || "Failed to change role")
    load()
  }

  async function removeMember(userId: string) {
    setMenuFor(null)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" })
    if (!res.ok) setError((await res.json().catch(() => ({})))?.error || "Failed to remove member")
    load()
  }

  async function cancelInvite(id: string) {
    const res = await fetch(`/api/projects/${projectId}/invitations/${id}`, { method: "DELETE" })
    if (!res.ok) setError((await res.json().catch(() => ({})))?.error || "Failed to cancel invitation")
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-bold text-slate-900">Members</h1>
        </div>
        {can("canInviteMembers") && (
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">Manage project members and their permissions.</p>

      {!manage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Info className="h-4 w-4 shrink-0" />
          You have read-only access. You need admin permission to manage members.
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
          <button onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex gap-1 border-b mb-4">
        <button
          onClick={() => setTab("members")}
          className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "members" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}
        >
          Members ({members.length})
        </button>
        {can("canInviteMembers") && (
          <button
            onClick={() => setTab("invitations")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "invitations" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}
          >
            Invitations ({invitations.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tab === "members" ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-semibold px-4 py-2.5">Name</th>
                <th className="text-left font-semibold px-4 py-2.5">Email</th>
                <th className="text-left font-semibold px-4 py-2.5">Role</th>
                <th className="text-left font-semibold px-4 py-2.5">Joined</th>
                {manage && <th className="w-10 px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {m.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                          {initials(m.user.name, m.user.email)}
                        </div>
                      )}
                      <span className="font-medium text-slate-800">{m.user.name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{m.user.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[m.role] || ROLE_BADGE.Member}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  {manage && (
                    <td className="px-4 py-2.5 relative">
                      {!m.isCreator && (
                        <button onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="p-1 rounded hover:bg-slate-200">
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </button>
                      )}
                      {menuFor === m.id && (
                        <div className="absolute right-4 top-9 z-10 w-44 rounded-lg border bg-white shadow-lg py-1">
                          <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">Change role</div>
                          {PROJECT_ROLES.map((r) => (
                            <button
                              key={r}
                              onClick={() => changeRole(m.userId, r)}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${r === m.role ? "text-indigo-600 font-semibold" : "text-slate-700"}`}
                            >
                              <Shield className="h-3 w-3" /> {r}
                              {r === m.role && <Check className="h-3 w-3 ml-auto" />}
                            </button>
                          ))}
                          <div className="border-t my-1" />
                          <button
                            onClick={() => removeMember(m.userId)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" /> Remove from project
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-semibold px-4 py-2.5">Email</th>
                <th className="text-left font-semibold px-4 py-2.5">Role</th>
                <th className="text-left font-semibold px-4 py-2.5">Status</th>
                <th className="text-left font-semibold px-4 py-2.5">Invited by</th>
                <th className="text-left font-semibold px-4 py-2.5">Date</th>
                <th className="w-10 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invitations.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No invitations yet.</td></tr>
              )}
              {invitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{inv.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[inv.role] || ROLE_BADGE.Member}`}>{inv.role}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[inv.status] || STATUS_BADGE.PENDING}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{inv.invitedBy?.name || inv.invitedBy?.email || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5">
                    {inv.status === "PENDING" && (
                      <button onClick={() => cancelInvite(inv.id)} className="p-1 rounded hover:bg-red-50 text-red-600" title="Cancel invitation">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteModal
          projectId={projectId}
          isOwner={can("canManageMembers") && members.some((m) => m.isCreator && m.userId)}
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); load() }}
        />
      )}
    </div>
  )
}

function InviteModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string
  isOwner: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [value, setValue] = useState("")
  const [role, setRole] = useState<ProjectRole>("Member")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit() {
    setSubmitting(true)
    setErr(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value.trim(), role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data?.error || "Failed to invite"); return }
      if (data.type === "invitation") { setInviteUrl(data.inviteUrl); return }
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Invite Member to Project</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>

        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">No account found for that email. Share this invite link (valid 7 days):</p>
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-2">
              <input readOnly value={inviteUrl} className="flex-1 bg-transparent text-[11px] text-slate-700 outline-none" />
              <button
                onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button onClick={onDone} className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Email or Username</label>
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="jane@example.com or Jane Smith"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-xs cursor-pointer focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="Admin">Admin — manage sprints, epics & stories</option>
                <option value="Member">Member — can work on tasks</option>
                <option value="Viewer">Viewer — read-only access</option>
                <option value="Owner">Owner — full control</option>
              </select>
            </div>
            {err && <p className="text-[11px] text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
              <button
                onClick={submit}
                disabled={submitting || !value.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />} Send Invitation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
