"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Bug,
  LogOut,
  Play,
  Video,
  Zap,
  ChevronDown,
  ChevronRight,
  Search,
  Activity,
  Sparkles,
  Info,
  X,
  Plus,
  FlaskConical,
  Trello,
  ShieldCheck,
  Users,
  DollarSign,
  CreditCard,
  Shield,
  Cpu,
  FolderOpen,
  Camera,
  LineChart,
  Settings2,
  MessageSquare,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react"
import { BackButton } from "@/components/ui/back-button"
import { usePermissionStore } from "@/stores/permissionStore"
import { PermissionGate, GlobalAdminGate } from "@/components/permissions/PermissionGate"
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { Toaster } from "@/components/ui/sonner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { UserCircle2 } from "lucide-react"
import type { ProjectPermission } from "@/lib/permissions"

interface ProjectOption {
  id: string
  name: string
  environment?: string
  role: string
}

/** Key for the "last project the user was working in" hint. */
const ACTIVE_PROJECT_KEY = "activeProjectId"

interface ProjectStats {
  id: string
  name: string
  webAppUrl: string
  _count?: {
    testCases: number
    testRuns: number
    bugReports: number
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setActiveTab(params.get("tab"))
    }
  }, [pathname])

  // Project selector state
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [canCreateProject, setCanCreateProject] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string>("")
  const [activeProjectStats, setActiveProjectStats] = useState<ProjectStats | null>(null)
  const [user, setUser] = useState<{ id: string; email: string; name: string | null; role: string; avatarUrl?: string | null } | null>(null)
  const [token, setToken] = useState<string>("")
  // token is stored for the chat page to read via window.__CHAT_TOKEN__
  useEffect(() => { (window as any).__CHAT_TOKEN__ = token }, [token])
  

  // Command bar search overlay state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Board-style routes render edge to edge instead of inside the padded,
  // vertically-scrolling document container.
  const isFullBleed = useMemo(() => /^\/projects\/[^/]+\/scrum(\/|$)/.test(pathname), [pathname])

  // Collapsing the nav hands ~256px back to wide views like the Scrum board.
  const [navCollapsed, setNavCollapsed] = useState(false)
  useEffect(() => {
    setNavCollapsed(localStorage.getItem("navCollapsed") === "1")
  }, [])
  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => {
      localStorage.setItem("navCollapsed", c ? "0" : "1")
      return !c
    })
  }, [])

  // The project id in the URL, when we're on a project-scoped route. `/projects`
  // and `/projects/new` are not project ids.
  const urlProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)/)
    const id = match?.[1]
    return id && id !== "new" ? id : null
  }, [pathname])

  // Every project the user can actually open (owned *and* member-of). This has
  // to be the same list the switcher shows, otherwise the selected project and
  // the switcher disagree — /api/projects only returns projects the user
  // created, so a member-only user would resolve to no project at all.
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/my-projects")
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects || [])
        setCanCreateProject(!!data.canCreateProject)
      }
    } catch (err) {
      console.error("Error loading project list:", err)
    } finally {
      setProjectsLoaded(true)
    }
  }, [])

  // Fetch project list & setup active context
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/me")
        if (res.ok) {
          const data = await res.json()
          console.log("LAYOUT LOADED USER:", data.user)
          setUser(data.user)
          setToken(data.token)
        } else {
          console.error("Failed to load user context, status:", res.status)
        }
      } catch (err) {
        console.error("Error loading user context:", err)
      }
    }
    loadProjects()
    loadUser()

    // Profile page dispatches this after saving details / uploading a new
    // avatar so the header reflects the change immediately.
    const handleProfileUpdated = () => loadUser()
    window.addEventListener("profile-updated", handleProfileUpdated)

    // Pages that create / delete / leave a project dispatch this so the
    // switcher list stays in sync without a reload.
    const handleProjectsUpdated = () => loadProjects()
    window.addEventListener("projects-updated", handleProjectsUpdated)

    // Listen to Ctrl + K / Cmd + K keyboard shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch(prev => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("profile-updated", handleProfileUpdated)
      window.removeEventListener("projects-updated", handleProjectsUpdated)
    }
  }, [loadProjects])

  // Resolve which project is selected, in priority order:
  //   1. the project in the URL — that's where the user actually is
  //   2. the last project they selected (persisted in localStorage)
  //   3. their only project, when they have exactly one
  //   4. the first project in the list
  // The chosen id is written back to localStorage so it survives a reload and
  // a sign-out/sign-in on the same browser.
  const refetchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!projectsLoaded) return

    if (projects.length === 0) {
      // A project the user just created won't be in the cached list yet.
      if (urlProjectId && refetchedFor.current !== urlProjectId) {
        refetchedFor.current = urlProjectId
        loadProjects()
      } else if (activeProjectId) {
        setActiveProjectId("")
      }
      return
    }

    const has = (id: string | null) => !!id && projects.some((p) => p.id === id)

    if (urlProjectId && has(urlProjectId)) {
      if (urlProjectId !== activeProjectId) {
        setActiveProjectId(urlProjectId)
        localStorage.setItem(ACTIVE_PROJECT_KEY, urlProjectId)
      }
      return
    }
    // On a project URL we can't see — refetch once in case it's brand new.
    if (urlProjectId && refetchedFor.current !== urlProjectId) {
      refetchedFor.current = urlProjectId
      loadProjects()
      return
    }
    // Keep the current selection as long as it is still a project we can open.
    if (has(activeProjectId)) return

    const saved = localStorage.getItem(ACTIVE_PROJECT_KEY)
    const next = has(saved) ? (saved as string) : projects[0].id
    setActiveProjectId(next)
    localStorage.setItem(ACTIVE_PROJECT_KEY, next)
  }, [projectsLoaded, projects, urlProjectId, activeProjectId, loadProjects])

  // Fetch stats whenever activeProjectId changes
  useEffect(() => {
    if (!activeProjectId) {
      setActiveProjectStats(null)
      return
    }

    async function loadStats() {
      try {
        const res = await fetch(`/api/projects/${activeProjectId}`)
        if (res.ok) {
          const data = await res.json()
          setActiveProjectStats(data.project)
        }
      } catch (err) {
        console.error("Error loading project stats:", err)
      }
    }
    loadStats()
  }, [activeProjectId])

  // Hydrate the RBAC permission store for the active project.
  useEffect(() => {
    if (!activeProjectId) {
      usePermissionStore.getState().reset()
      return
    }
    let cancelled = false
    async function loadPermissions() {
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/membership`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          usePermissionStore.getState().setPermissions({
            globalRole: data.globalRole,
            projectRole: data.role,
            projectId: activeProjectId,
            permissions: data.permissions,
          })
        }
      } catch (err) {
        console.error("Error loading permissions:", err)
      }
    }
    loadPermissions()
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  function handleSelectProject(projectId: string) {
    setActiveProjectId(projectId)
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
    // Dispatch event to wake up page listeners
    window.dispatchEvent(new Event("projectChanged"))

    // If we're on a project-scoped page (e.g. the Scrum board at
    // /projects/[id]/scrum), swap the project id in the URL and client-side
    // navigate to the same section for the newly selected project — the page
    // re-renders with the new id and refetches, no full reload.
    const match = pathname.match(/^\/projects\/[^/]+\/([^/]+)/)
    if (match) {
      const section = match[1] // "scrum", "board", "test-cases", …
      const query = section === "board" && activeTab ? `?tab=${activeTab}` : ""
      router.push(`/projects/${projectId}/${section}${query}`)
    }
  }

  // Navigation Items. `permission` (optional) gates the item via PermissionGate.
  const navItems: { href: string; label: string; icon: any; permission?: ProjectPermission }[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/scrum", label: "Scrum Board", icon: Trello },
    { href: "/reports", label: "Reports", icon: LineChart, permission: "canAccessReports" },
    { href: "/members", label: "Members", icon: Users, permission: "canAccessMembers" },
  ]

  const workflowItems = [
    { href: "/test-cases", label: "Test Cases", icon: FileText },
    { href: "/brds", label: "BRD Hub", icon: FileSpreadsheet },
    { href: "/automation-hub", label: "Automation Hub", icon: Cpu },
    { href: "/team-chat", label: "Team Chat", icon: MessageSquare },
    { href: "/live-qa-session", label: "Live QA Session", icon: FlaskConical },
    { href: "/recorder-studio", label: "Recorder Studio", icon: Video },
    { href: "/visual-tests", label: "Visual Tests", icon: Camera },
    { href: "/bug-reports", label: "Bug Reports", icon: Bug },
  ]

  const managementItems = [
    { href: "/projects", label: "Projects", icon: FolderOpen },
  ]

  const getHref = (basePath: string) => {
    if (!activeProjectId) return basePath
    if (basePath === "/test-cases") return `/projects/${activeProjectId}/test-cases`
    if (basePath === "/automation-hub") return `/projects/${activeProjectId}/automation-hub`
    if (basePath === "/team-chat") return `/projects/${activeProjectId}/team-chat`
    if (basePath === "/live-qa-session") return `/projects/${activeProjectId}/live-qa-session`
    if (basePath === "/recorder-studio") return `/projects/${activeProjectId}/recorder-studio`
    if (basePath === "/visual-tests") return `/projects/${activeProjectId}/visual-tests`
    if (basePath === "/bug-reports") return `/projects/${activeProjectId}/bug-reports`
    if (basePath === "/brds") return `/projects/${activeProjectId}/brds`
    if (basePath.startsWith("/board")) {
      const query = basePath.includes("?") ? basePath.substring(basePath.indexOf("?")) : ""
      return `/projects/${activeProjectId}/board${query}`
    }
    if (basePath === "/scrum") return `/projects/${activeProjectId}/scrum`
    if (basePath === "/requirements") return `/projects/${activeProjectId}/requirements`
    if (basePath === "/members") return `/projects/${activeProjectId}/members`
    return basePath
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      
      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside
        className={`${navCollapsed ? "w-14" : "w-64"} border-r bg-card flex flex-col overflow-y-auto overflow-x-hidden shrink-0 select-none text-xs font-semibold transition-[width] duration-200`}
      >
        <div className={`flex h-14 items-center border-b select-none ${navCollapsed ? "justify-center px-2" : "px-6 justify-between"}`}>
          {!navCollapsed && (
            <Link href="/dashboard" className="font-extrabold text-indigo-700 text-sm tracking-tight flex items-center gap-1.5 uppercase">
              <Zap className="h-4.5 w-4.5 fill-current" /> QA Engine
            </Link>
          )}
          <div className="flex items-center gap-1">
            {!navCollapsed && (
              <button
                onClick={() => setShowSearch(true)}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors border shadow-sm"
                title="Open command bar (Ctrl + K)"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={toggleNav}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
              title={navCollapsed ? "Expand sidebar" : "Collapse sidebar (more room for the board)"}
              aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Global Project Switcher (with per-project role badges) */}
        {user?.role !== "Admin" && !navCollapsed && (
          <ProjectSwitcher
            projects={projects}
            canCreateProject={canCreateProject}
            loading={!projectsLoaded}
            activeProjectId={activeProjectId}
            onSelect={handleSelectProject}
          />
        )}

        <nav className="flex flex-col gap-1 p-4 flex-grow">
          {user?.role === "Admin" ? (
            <>
              {!navCollapsed && <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Administration</span>}
              
              <Link
                href="/admin?tab=users"
                title={navCollapsed ? "Users" : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <Users className="h-4 w-4 shrink-0 text-indigo-600" />
                {!navCollapsed && "Users"}
              </Link>

              <Link
                href="/admin?tab=finance"
                title={navCollapsed ? "Finance" : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <DollarSign className="h-4 w-4 shrink-0 text-indigo-600" />
                {!navCollapsed && "Finance"}
              </Link>

              <Link
                href="/admin?tab=pricing"
                title={navCollapsed ? "Subscription Panel" : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <CreditCard className="h-4 w-4 shrink-0 text-indigo-600" />
                {!navCollapsed && "Subscription Panel"}
              </Link>

              <Link
                href="/admin?tab=trial"
                title={navCollapsed ? "Free Trial" : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
                {!navCollapsed && "Free Trial"}
              </Link>
            </>
          ) : (
            <>
              {navItems.map((item) => {
                const dest = getHref(item.href)
                const hasTab = item.href.includes("?tab=")
                const targetTab = hasTab ? item.href.split("?tab=")[1] : null
                
                const isTabActive = hasTab 
                  ? (pathname.includes("/board") && activeTab === targetTab)
                  : (pathname.includes("/board") && !activeTab && item.href.endsWith("/board"))
                
                const isActive = isTabActive || (pathname === dest && !hasTab)
                const link = (
                  <Link
                    key={item.href}
                    href={dest}
                    title={navCollapsed ? item.label : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-700 rounded-l-none pl-2" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-700" : ""}`} />
                    {!navCollapsed && item.label}
                  </Link>
                )
                return item.permission ? (
                  <PermissionGate key={item.href} permission={item.permission}>
                    {link}
                  </PermissionGate>
                ) : (
                  link
                )
              })}

              <div className="border-t my-2" />
              {!navCollapsed && <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">QA Workflows</span>}

              {workflowItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname.startsWith(dest + "/")
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    title={navCollapsed ? item.label : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-700 rounded-l-none pl-2" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-700" : ""}`} />
                    {!navCollapsed && item.label}
                  </Link>
                )
              })}

              <div className="border-t my-2" />
              {!navCollapsed && <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Management</span>}

              {managementItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname.startsWith(dest + "/")
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    title={navCollapsed ? item.label : undefined}
                    className={`flex items-center rounded-lg py-2 text-xs transition-colors ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-700 rounded-l-none pl-2" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-700" : ""}`} />
                    {!navCollapsed && item.label}
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        {/* User signout */}
        <div className="mt-auto p-4 border-t bg-accent/5">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!navCollapsed && "Sign Out"}
            </button>
          </form>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top header: notifications + user menu */}
        <header className="flex h-12 shrink-0 items-center justify-end gap-1.5 border-b bg-background px-4">
          <NotificationBell token={token} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-accent"
                title="Account"
              >
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold uppercase text-indigo-700">
                    {(user?.name || user?.email || "?")[0]}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">
                <p className="truncate font-bold">{user?.name || "My account"}</p>
                <p className="truncate font-normal text-muted-foreground">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")} className="gap-2 text-xs">
                <UserCircle2 className="h-4 w-4" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" })
                  window.location.href = "/login"
                }}
                className="gap-2 text-xs text-red-600 focus:text-red-600"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {/* The Scrum board is a full-bleed app view, not a document: the
            standard page padding and vertical scroll cost it ~64px of width and
            break its internal min-h-0 scroll chain, which is what made the
            columns feel cramped. It manages its own header and scrolling. */}
        {isFullBleed ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <BackButton />
            {children}
          </div>
        )}
      </main>

      <Toaster position="top-right" richColors />



      {/* ── COMMAND BAR SEARCH OVERLAY ────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[500px] bg-background rounded-2xl shadow-2xl border flex flex-col overflow-hidden max-h-[400px] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex items-center justify-between gap-3 bg-accent/10 select-none">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Command Search: test cases, bugs, projects..." 
                  className="pl-9 h-9 w-full bg-background border rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <button onClick={() => setShowSearch(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-semibold">
              <span className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Quick Actions</span>
              <div className="space-y-1.5">
                <div 
                  onClick={() => { setShowSearch(false); router.push(getHref("/live-qa-session")) }}
                  className="p-2.5 rounded-lg hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between text-slate-700"
                >
                  <span className="flex items-center gap-2 font-bold"><Play className="h-4 w-4 text-indigo-500" /> Go to Live QA Session</span>
                  <ChevronRight className="h-4 w-4 opacity-55" />
                </div>
                <div 
                  onClick={() => { setShowSearch(false); router.push(getHref("/recorder-studio")) }}
                  className="p-2.5 rounded-lg hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between text-slate-700"
                >
                  <span className="flex items-center gap-2 font-bold"><Video className="h-4 w-4 text-indigo-500" /> Go to Recorder Studio</span>
                  <ChevronRight className="h-4 w-4 opacity-55" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Chat is now a dedicated page at /projects/[projectId]/team-chat */}

    </div>
  )
}
