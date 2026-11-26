"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Check, X, Users } from "@/components/ui/icons"

interface Preview {
  email: string
  role: string
  status: string
  projectName: string
  invitedBy: string
}

export default function InviteAcceptPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const [pRes, meRes] = await Promise.all([
          fetch(`/api/invitations/${token}`),
          fetch("/api/me"),
        ])
        if (pRes.ok) setPreview((await pRes.json()).invitation)
        else setError((await pRes.json().catch(() => ({})))?.error || "Invitation not found")
        setLoggedIn(meRes.ok)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token])

  async function accept() {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || "Failed to accept"); return }
      setDone("accepted")
      setTimeout(() => router.push(`/projects/${data.projectId}/scrum`), 900)
    } finally {
      setWorking(false)
    }
  }

  async function decline() {
    setWorking(true)
    try {
      await fetch(`/api/invitations/${token}/decline`, { method: "POST" })
      setDone("declined")
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <span className="font-semibold text-primary tracking-tight">QA Engine</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
        ) : error && !preview ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : done === "accepted" ? (
          <div className="text-center py-6">
            <Check className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">You've joined {preview?.projectName}!</p>
            <p className="text-xs text-muted-foreground mt-1">Redirecting…</p>
          </div>
        ) : done === "declined" ? (
          <div className="text-center py-6">
            <X className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Invitation declined.</p>
          </div>
        ) : preview && (preview.status === "EXPIRED" || preview.status === "DECLINED") ? (
          <p className="text-sm text-muted-foreground">This invitation is no longer valid ({preview.status.toLowerCase()}).</p>
        ) : preview ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">You're invited</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-semibold">{preview.invitedBy}</span> invited you to join{" "}
              <span className="font-semibold">{preview.projectName}</span> as a{" "}
              <span className="font-semibold">{preview.role}</span>.
            </p>

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            {loggedIn ? (
              <div className="flex gap-2 mt-6">
                <button
                  onClick={accept}
                  disabled={working}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {working && <Loader2 className="h-4 w-4 animate-spin" />} Accept & Join
                </button>
                <button onClick={decline} disabled={working} className="rounded-lg border px-4 py-2 text-sm font-semibold text-muted-foreground">
                  Decline
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-muted-foreground">Sign in or create an account to accept this invitation.</p>
                <div className="flex gap-2">
                  <Link
                    href={`/register?email=${encodeURIComponent(preview.email)}&redirect=${encodeURIComponent(`/invite/${token}`)}`}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                  >
                    Create account
                  </Link>
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-muted-foreground"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
