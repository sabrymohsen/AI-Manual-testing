"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, KeyRound, Loader2, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/**
 * A BRD's test users: the people of the system it describes, with the logins
 * the tests use. Test cases generated from this BRD write each step as
 * "As <key>: …", and the Browser Agent logs every user in, in their own
 * browser. Passwords are stored encrypted and never shown again.
 */

interface TestUser {
  id: string
  role: string
  key: string
  username: string
  hasPassword: boolean
  loginUrl: string | null
  notes: string | null
}

interface Draft {
  role: string
  key: string
  username: string
  password: string
  loginUrl: string
  notes: string
}

const EMPTY: Draft = { role: "", key: "", username: "", password: "", loginUrl: "", notes: "" }
const input = "h-8 w-full rounded-md border bg-card px-2 text-[13px] font-normal text-foreground"

export function BrdTestUsers({ brdId }: { brdId: string }) {
  const [users, setUsers] = useState<TestUser[] | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<TestUser | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/brds/${brdId}/users`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(d.error || "Couldn't load the test users")
      setUsers([])
      return
    }
    setUsers(d.users || [])
    setSuggestions(d.suggestions || [])
    setCanManage(!!d.canManage)
  }, [brdId])

  useEffect(() => {
    void load()
  }, [load])

  const startNew = (role = "") => {
    setDraft({ ...EMPTY, role })
    setEditing("new")
  }
  const startEdit = (u: TestUser) => {
    setDraft({ role: u.role, key: u.key, username: u.username, password: "", loginUrl: u.loginUrl || "", notes: u.notes || "" })
    setEditing(u.id)
  }

  const save = async () => {
    if (!draft.role.trim() || !draft.username.trim()) return toast.error("Write the role and the username")
    setSaving(true)
    try {
      const isNew = editing === "new"
      const body: Record<string, string | null> = {
        role: draft.role.trim(),
        username: draft.username.trim(),
        loginUrl: draft.loginUrl.trim() || null,
        notes: draft.notes.trim() || null,
      }
      if (draft.key.trim()) body.key = draft.key.trim()
      if (draft.password) body.password = draft.password
      const res = await fetch(isNew ? `/api/brds/${brdId}/users` : `/api/brds/${brdId}/users/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Couldn't save the user")
      toast.success(isNew ? `Added ${d.user.role}` : "Saved")
      setEditing(null)
      setDraft(EMPTY)
      await load()
    } catch (e: any) {
      toast.error(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u: TestUser) => {
    const res = await fetch(`/api/brds/${brdId}/users/${u.id}`, { method: "DELETE" })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error || "Couldn't remove the user")
    toast.success(`Removed ${u.role}`)
    await load()
  }

  if (users === null) {
    return (
      <p className="flex items-center gap-2 p-6 text-[13px] font-normal text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    )
  }

  const form = (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Role (as the BRD names it)</span>
          <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Reviewer / المراجع" className={input} dir="auto" autoFocus />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Key in steps (optional)</span>
          <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="made from the role, e.g. reviewer" className={input} dir="auto" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Username</span>
          <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className={input} dir="ltr" autoComplete="off" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Password{editing !== "new" ? " (leave empty to keep it)" : ""}</span>
          <input
            type="password"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            className={input}
            dir="ltr"
            autoComplete="new-password"
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Login page (optional — the browser for this user opens here)</span>
          <input value={draft.loginUrl} onChange={(e) => setDraft({ ...draft, loginUrl: e.target.value })} placeholder="https://…" className={input} dir="ltr" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Notes (optional)</span>
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="e.g. belongs to the Riyadh branch" className={input} dir="auto" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (setEditing(null), setDraft(EMPTY))} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary" /> Test users of this BRD
            </h3>
            <p className="mt-0.5 max-w-2xl text-[13px] font-normal text-muted-foreground">
              The people of the system this BRD describes, with the logins tests use. Test cases generated from this BRD write each step as “As
              reviewer: …”, and the Browser Agent in Automation Hub logs every user in, in their own browser. Passwords are stored encrypted and never
              shown again, and are never sent to the AI.
            </p>
          </div>
          {canManage && editing === null && (
            <Button size="sm" onClick={() => startNew()}>
              <UserPlus className="h-4 w-4" /> Add user
            </Button>
          )}
        </div>

        {suggestions.length > 0 && canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-2.5">
            <span className="text-xs font-medium text-foreground">Roles this BRD mentions without a user:</span>
            {suggestions.map((r) => (
              <button
                key={r}
                onClick={() => startNew(r)}
                disabled={editing !== null}
                className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                dir="auto"
              >
                <Plus className="h-3 w-3" /> {r}
              </button>
            ))}
          </div>
        )}
        {!canManage && <p className="mt-3 text-xs font-normal text-muted-foreground">Only people who manage BRDs can add or change users.</p>}
      </div>

      {editing === "new" && form}

      {users.length === 0 && editing === null ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center">
          <p className="text-[13px] font-normal text-muted-foreground">No test users yet. Add the roles this BRD describes (applicant, reviewer, approver…) and their logins.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {users.map((u) =>
            editing === u.id ? (
              <div key={u.id} className="border-b p-3 last:border-b-0">
                {form}
              </div>
            ) : (
              <div key={u.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground" dir="auto">
                    {u.role}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">
                    In steps: <code className="rounded bg-muted px-1 font-mono text-foreground" dir="auto">As {u.key}:</code>
                    {u.notes ? <span dir="auto"> · {u.notes}</span> : null}
                  </p>
                </div>
                <div className="min-w-0 text-xs font-normal text-muted-foreground">
                  <p className="font-mono text-foreground" dir="ltr">
                    {u.username}
                  </p>
                  <p className="flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    {u.hasPassword ? "Password saved" : <span className="text-amber-700">No password</span>}
                  </p>
                </div>
                <div className="w-full min-w-0 truncate text-xs font-normal text-muted-foreground sm:w-56" dir="ltr" title={u.loginUrl || ""}>
                  {u.loginUrl || "Opens at the start page"}
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(u)} disabled={editing !== null} className="rounded p-1.5 hover:bg-muted disabled:opacity-40" title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => setRemoving(u)} disabled={editing !== null} className="rounded p-1.5 hover:bg-muted disabled:opacity-40" title="Remove">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-600" />
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.role ?? "user"}?`}
        description="Its login is deleted. Test cases that act as this user will stop before running until a user with the same key is added again."
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await remove(removing)
          setRemoving(null)
        }}
      />
    </div>
  )
}
