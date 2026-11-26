"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ShieldAlert,
  Briefcase,
  Building2,
  FolderKanban,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "@/components/ui/icons"

interface PublicUser {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  jobTitle: string | null
  department: string | null
  bio: string | null
  role: string
  createdAt: string
}

interface SharedProject {
  id: string
  name: string
  role: string
}

export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>()
  const router = useRouter()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [projects, setProjects] = useState<SharedProject[]>([])
  const [status, setStatus] = useState<"loading" | "ok" | "denied" | "missing">("loading")

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/users/${params.userId}`)
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          setProjects(data.sharedProjects)
          setStatus("ok")
        } else if (res.status === 403) {
          setStatus("denied")
        } else {
          setStatus("missing")
        }
      } catch {
        setStatus("missing")
      }
    }
    load()
  }, [params.userId])

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  if (status === "denied") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-10 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-400" />
        <h1 className="mt-4 text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You can only view profiles of people you share a project with.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Go back
        </button>
      </div>
    )
  }

  if (status === "missing" || !user) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-10 text-center">
        <h1 className="text-lg font-semibold">User not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This user doesn&apos;t exist or was removed.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header card */}
      <div className="rounded-xl border bg-card p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-24 w-24 shrink-0 rounded-full border object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-indigo-400 text-3xl font-semibold uppercase text-white">
              {(user.name || user.email)[0]}
            </div>
          )}
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-xl font-semibold">{user.name || user.email}</h1>
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                {user.role}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
              {user.jobTitle && (
                <span className="inline-flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5" /> {user.jobTitle}
                </span>
              )}
              {user.department && (
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> {user.department}
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" /> Joined {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
            {user.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{user.bio}</p>}
          </div>
        </div>
      </div>

      {/* Shared projects */}
      <div className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FolderKanban className="h-4 w-4 text-primary" />
          Shared projects
          <span className="ml-1 rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
            {projects.length}
          </span>
        </h2>
        {projects.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No shared projects.</p>
        ) : (
          <div className="mt-3 divide-y">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/scrum`}
                className="group flex items-center justify-between py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 px-1">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold uppercase text-primary">
                    {p.name.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.role}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
