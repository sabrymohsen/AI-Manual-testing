"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Camera,
  User as UserIcon,
  Activity as ActivityIcon,
  ShieldCheck,
  Cpu,
  FolderKanban,
  ClipboardList,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { LocalAiPanel } from "@/components/desktop/local-ai-panel"
import { Textarea } from "@/components/ui/textarea"

interface Profile {
  id: string
  email: string
  name: string | null
  role: string
  avatarUrl: string | null
  bio: string | null
  jobTitle: string | null
  department: string | null
  phone: string | null
  timezone: string
  language: string
  theme: string
}

interface Stats {
  projects: number
  tasksAssigned: number
  tasksCompleted: number
}

interface ActivityEntry {
  id: string
  type: string
  description: string
  createdAt: string
  project?: { id: string; name: string } | null
}

const TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
]

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
]

const ACTIVITY_DOTS: Record<string, string> = {
  TASK_CREATED: "bg-blue-500",
  TASK_COMPLETED: "bg-green-500",
  SPRINT_STARTED: "bg-orange-500",
  SPRINT_COMPLETED: "bg-emerald-500",
  PROJECT_JOINED: "bg-purple-500",
  PROFILE_UPDATED: "bg-primary",
  FILE_UPLOADED: "bg-cyan-500",
  WORK_LOGGED: "bg-amber-500",
  PASSWORD_CHANGED: "bg-slate-500",
}

type Tab = "general" | "ai" | "activity" | "security"

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("general")
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t === "ai" || t === "activity" || t === "security") setTab(t)
  }, [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  // General form state
  const [form, setForm] = useState({
    name: "",
    jobTitle: "",
    department: "",
    phone: "",
    timezone: "UTC",
    language: "en",
    theme: "system",
    bio: "",
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Security form state
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/me?full=1")
        if (res.ok) {
          const data = await res.json()
          setProfile(data.user)
          setStats(data.stats)
          setActivity(data.activity || [])
          setForm({
            name: data.user.name || "",
            jobTitle: data.user.jobTitle || "",
            department: data.user.department || "",
            phone: data.user.phone || "",
            timezone: data.user.timezone || "UTC",
            language: data.user.language || "en",
            theme: data.user.theme || "system",
            bio: data.user.bio || "",
          })
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          jobTitle: form.jobTitle.trim() || null,
          department: form.department.trim() || null,
          phone: form.phone.trim() || null,
          timezone: form.timezone,
          language: form.language,
          theme: form.theme as "light" | "dark" | "system",
          bio: form.bio.trim() || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setProfile(data.user)
        window.dispatchEvent(new Event("profile-updated"))
        toast.success("Profile updated")
      } else {
        toast.error(data.error || "Failed to update profile")
      }
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are allowed")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be 2MB or smaller")
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/me/avatar", { method: "POST", body: fd })
      const data = await res.json()
      if (res.ok) {
        setProfile((p) => (p ? { ...p, avatarUrl: data.avatarUrl } : p))
        window.dispatchEvent(new Event("profile-updated"))
        toast.success("Avatar updated")
      } else {
        toast.error(data.error || "Upload failed")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (pwSaving) return
    if (!pw.current || !pw.next || !pw.confirm) {
      toast.error("All fields are required")
      return
    }
    if (pw.next.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }
    if (pw.next !== pw.confirm) {
      toast.error("New passwords don't match")
      return
    }
    setPwSaving(true)
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      })
      const data = await res.json()
      if (res.ok) {
        setPw({ current: "", next: "", confirm: "" })
        toast.success("Password changed successfully")
      } else {
        toast.error(data.error || "Failed to change password")
      }
    } catch {
      toast.error("Failed to change password")
    } finally {
      setPwSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }
  if (!profile) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Unable to load your profile.</div>
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "general", label: "General", icon: UserIcon },
    { id: "ai", label: "AI", icon: Cpu },
    { id: "activity", label: "Activity", icon: ActivityIcon },
    { id: "security", label: "Security", icon: ShieldCheck },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your personal information, activity, and security.</p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── GENERAL ── */}
      {tab === "general" && (
        <div className="mt-6 grid gap-8 md:grid-cols-[260px_1fr]">
          {/* Left: avatar + stats */}
          <div className="space-y-4">
            <div className="flex flex-col items-center rounded-xl border bg-card p-6">
              <div className="relative">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="h-28 w-28 rounded-full border object-cover" />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-3xl font-semibold uppercase text-white">
                    {(profile.name || profile.email)[0]}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary text-white shadow-md transition-colors hover:bg-primary/90 disabled:opacity-60"
                  title="Change photo"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <p className="mt-3 text-base font-semibold">{profile.name || profile.email}</p>
              {profile.jobTitle && <p className="text-xs text-muted-foreground">{profile.jobTitle}</p>}
              <span className="mt-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {profile.role}
              </span>
            </div>

            {stats && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: FolderKanban, label: "Projects", value: stats.projects, color: "text-primary bg-primary/10" },
                  { icon: ClipboardList, label: "Assigned", value: stats.tasksAssigned, color: "text-blue-600 bg-blue-50" },
                  { icon: CheckCircle2, label: "Done", value: stats.tasksCompleted, color: "text-green-600 bg-green-50" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center rounded-xl border bg-card px-2 py-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.color}`}>
                      <s.icon className="h-4 w-4" />
                    </span>
                    <span className="mt-1.5 text-lg font-semibold leading-none">{s.value}</span>
                    <span className="mt-1 text-[11px] font-medium text-muted-foreground">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: editable form */}
          <form onSubmit={handleSave} className="space-y-4 rounded-xl border bg-card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Full Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Job Title</Label>
                <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="e.g. QA Lead" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+20 …" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Timezone</Label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Language</Label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Theme</Label>
                <div className="flex gap-2">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, theme: t })}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        form.theme === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs font-semibold">Bio</Label>
                <span className={`text-[10px] ${form.bio.length > 500 ? "font-bold text-red-500" : "text-muted-foreground"}`}>
                  {form.bio.length}/500
                </span>
              </div>
              <Textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value.slice(0, 500) })}
                rows={4}
                placeholder="A short description about you…"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="bg-primary text-white hover:bg-primary/90">
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── ACTIVITY ── */}
      {tab === "activity" && (
        <div className="mt-6 rounded-xl border bg-card p-6">
          {activity.length === 0 ? (
            <div className="py-12 text-center">
              <ActivityIcon className="mx-auto h-10 w-10 text-slate-200" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No activity yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Actions like creating tasks, joining projects, and logging work will appear here.
              </p>
            </div>
          ) : (
            <ol className="relative space-y-5 border-l pl-6">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className={`absolute -left-[1.85rem] top-1 h-3 w-3 rounded-full border-2 border-background ${
                      ACTIVITY_DOTS[a.type] || "bg-slate-400"
                    }`}
                  />
                  <p className="text-sm font-medium text-foreground">{a.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                    {a.project && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{a.project.name}</span>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ── AI ── */}
      {tab === "ai" && (
        <div className="mx-auto mt-6 max-w-2xl">
          <LocalAiPanel />
        </div>
      )}

      {/* ── SECURITY ── */}
      {tab === "security" && (
        <div className="mx-auto mt-6 max-w-md">
          <form onSubmit={handlePasswordChange} className="space-y-4 rounded-xl border bg-card p-6">
            <div>
              <h3 className="text-sm font-semibold">Change password</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Use at least 8 characters. You&apos;ll stay signed in on this device.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Current password</Label>
              <Input
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New password</Label>
              <Input
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Confirm new password</Label>
              <Input
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                autoComplete="new-password"
                required
              />
              {pw.confirm && pw.next !== pw.confirm && (
                <p className="text-[11px] font-medium text-red-500">Passwords don&apos;t match</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={pwSaving || !pw.current || !pw.next || pw.next !== pw.confirm || pw.next.length < 8}
              className="w-full bg-primary text-white hover:bg-primary/90"
            >
              {pwSaving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Updating…
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
