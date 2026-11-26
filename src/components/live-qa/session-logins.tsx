"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, LogIn, Save } from "@/components/ui/icons"

/**
 * Saved logins inside a Live QA session, like a browser's password manager:
 * - Fill: puts a saved username + password into the page's sign-in form
 *   (optionally presses Enter). The password stays on the server.
 * - Save: the tester types a username and password into the page, names the
 *   login, and the server reads it from the page and stores it encrypted as a
 *   project credential (Owner/Admin only).
 */

export interface SavedLogin {
  id: string
  roleName: string
  username: string
}

export function SessionLogins({
  sessionId,
  logins,
  onSaved,
  notify,
}: {
  sessionId: string
  logins: SavedLogin[]
  onSaved: () => void
  notify: (message: string, type: "success" | "error") => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState("")
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  async function fill(id: string, submit: boolean) {
    setBusy(id + (submit ? ":submit" : ""))
    try {
      const res = await fetch(`/api/recording/${sessionId}/fill-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: id, submit }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not fill the sign-in form")
      notify(submit ? "Signed in with the saved login" : "Login filled in", "success")
      setOpen(false)
    } catch (e) {
      notify((e as Error).message, "error")
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    const roleName = name.trim()
    if (!roleName) return
    setBusy("save")
    try {
      const res = await fetch(`/api/recording/${sessionId}/save-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not save the login")
      notify(
        data.updated ? `Updated the saved password for ${data.credential.username}` : `Saved login "${roleName}" (${data.credential.username})`,
        "success"
      )
      setName("")
      onSaved()
    } catch (e) {
      notify((e as Error).message, "error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-foreground hover:bg-background"
        title="Saved logins: fill a username and password, or save the one you typed"
      >
        <KeyRound className="h-3.5 w-3.5 text-primary" />
        <span>Logins{logins.length ? ` (${logins.length})` : ""}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border bg-background p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold">Saved logins</p>
          {logins.length === 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">None yet. Type a username and password into the page, then save it below.</p>
          ) : (
            <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto">
              {logins.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{l.roleName}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="auto">{l.username}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => fill(l.id, false)}
                    className="h-6 rounded-md border px-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    title="Fill the username and password into the page"
                  >
                    {busy === l.id ? <BusyDot /> : "Fill"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => fill(l.id, true)}
                    className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    title="Fill and sign in"
                  >
                    {busy === l.id + ":submit" ? <BusyDot /> : <LogIn className="h-3 w-3" />}
                    Sign in
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t pt-2">
            <p className="mb-2 text-xs font-semibold">Save the login typed in the page</p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") save()
                }}
                placeholder="Name, e.g. Admin, Case worker"
                className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                disabled={!name.trim() || !!busy}
                onClick={save}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy === "save" ? <BusyDot /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved encrypted in this project (Owner or Admin). Same username again updates its password.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
