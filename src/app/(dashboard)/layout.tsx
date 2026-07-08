"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Bug,
  Settings,
  LogOut,
  Play,
  Video,
  Globe,
  Zap,
  ChevronDown,
  Layers,
  ChevronRight,
  Search,
  Activity,
  Sparkles,
  Info,
  X,
  Plus,
  FlaskConical,
  ListOrdered,
  ShieldCheck,
  Users,
  DollarSign,
  CreditCard,
  Shield,
  Cpu,
  FolderOpen,
  Camera
} from "lucide-react"
import { BackButton } from "@/components/ui/back-button"

interface ProjectOption {
  id: string
  name: string
  environment?: string
}

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

  // Project selector state
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>("")
  const [activeProjectStats, setActiveProjectStats] = useState<ProjectStats | null>(null)
  const [user, setUser] = useState<{ id: string; email: string; name: string | null; role: string } | null>(null)
  

  // Command bar search overlay state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch project list & setup active context
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects")
        if (res.ok) {
          const data = await res.json()
          const list = data.items || data.projects || []
          setProjects(list)

          // Load active project from localStorage
          const savedId = localStorage.getItem("activeProjectId")
          if (savedId && list.some((p: any) => p.id === savedId)) {
            setActiveProjectId(savedId)
          } else if (list.length > 0) {
            setActiveProjectId(list[0].id)
            localStorage.setItem("activeProjectId", list[0].id)
          }
        }
      } catch (err) {
        console.error("Error loading project list:", err)
      }
    }
    async function loadUser() {
      try {
        const res = await fetch("/api/me")
        if (res.ok) {
          const data = await res.json()
          console.log("LAYOUT LOADED USER:", data.user)
          setUser(data.user)
        } else {
          console.error("Failed to load user context, status:", res.status)
        }
      } catch (err) {
        console.error("Error loading user context:", err)
      }
    }
    loadProjects()
    loadUser()

    // Listen to Ctrl + K / Cmd + K keyboard shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch(prev => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

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

  function handleSelectProject(projectId: string) {
    setActiveProjectId(projectId)
    localStorage.setItem("activeProjectId", projectId)
    // Dispatch event to wake up page listeners
    window.dispatchEvent(new Event("projectChanged"))
  }

  // Navigation Items
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]

  const workflowItems = [
    { href: "/test-cases", label: "Test Cases", icon: FileText },
    { href: "/automation-hub", label: "Automation Hub", icon: Cpu },
    { href: "/live-qa-session", label: "Live QA Session", icon: FlaskConical },
    { href: "/recorder-studio", label: "Recorder Studio", icon: Video },
    { href: "/bug-reports", label: "Bug Reports", icon: Bug },
    { href: "/openproject-sync", label: "OpenProject Sync", icon: Globe },
  ]

  const managementItems = [
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/requirements", label: "Requirements", icon: Layers },
    { href: "/backlog", label: "Backlog", icon: ListOrdered },
  ]

  const configItems = [
    { href: "/settings", label: "Settings", icon: Settings },
  ]

  const getHref = (basePath: string) => {
    if (!activeProjectId) return basePath
    if (basePath === "/test-cases") return `/projects/${activeProjectId}/test-cases`
    if (basePath === "/automation-hub") return `/projects/${activeProjectId}/automation-hub`
    if (basePath === "/live-qa-session") return `/projects/${activeProjectId}/live-qa-session`
    if (basePath === "/recorder-studio") return `/projects/${activeProjectId}/recorder-studio`
    if (basePath === "/bug-reports") return `/projects/${activeProjectId}/bug-reports`
    if (basePath === "/openproject-sync") return `/projects/${activeProjectId}/openproject-sync`
    if (basePath === "/backlog") return `/projects/${activeProjectId}/backlog`
    if (basePath === "/requirements") return `/projects/${activeProjectId}/requirements`
    if (basePath === "/settings") return `/projects/${activeProjectId}/settings`
    return basePath
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      
      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-64 border-r bg-card flex flex-col overflow-y-auto shrink-0 select-none text-xs font-semibold">
        <div className="flex h-14 items-center border-b px-6 justify-between select-none">
          <Link href="/dashboard" className="font-extrabold text-indigo-700 text-sm tracking-tight flex items-center gap-1.5 uppercase">
            <Zap className="h-4.5 w-4.5 fill-current" /> QA OS Engine
          </Link>
          <button 
            onClick={() => setShowSearch(true)} 
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors border shadow-sm"
            title="Open command bar (Ctrl + K)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Global Project Selection dropdown */}
        {user?.role !== "Admin" && (
          <div className="p-4 border-b space-y-1.5 select-none">
            <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">Selected Scope</span>
            <select 
              value={activeProjectId} 
              onChange={(e) => handleSelectProject(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-indigo-500"
            >
              {projects.length === 0 ? (
                <option value="">-- No project --</option>
              ) : (
                projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
              )}
            </select>
          </div>
        )}

        <nav className="flex flex-col gap-1 p-4 flex-grow">
          {user?.role === "Admin" ? (
            <>
              <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Administration</span>
              
              <Link
                href="/admin?tab=users"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <Users className="h-4 w-4 shrink-0 text-indigo-600" />
                Users
              </Link>

              <Link
                href="/admin?tab=finance"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <DollarSign className="h-4 w-4 shrink-0 text-indigo-600" />
                Finance
              </Link>

              <Link
                href="/admin?tab=pricing"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <CreditCard className="h-4 w-4 shrink-0 text-indigo-600" />
                Subscription Panel
              </Link>

              <Link
                href="/admin?tab=trial"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                  pathname === "/admin" || pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                }`}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
                Free Trial
              </Link>
            </>
          ) : (
            <>
              {navItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}

              <div className="border-t my-2" />
              <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">QA Workflows</span>

              {workflowItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname.startsWith(dest + "/")
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}

              <div className="border-t my-2" />
              <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Management</span>

              {managementItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname.startsWith(dest + "/")
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}

              <div className="border-t my-2" />
              <span className="px-3 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Configuration</span>

              {configItems.map((item) => {
                const dest = getHref(item.href)
                const isActive = pathname === dest || pathname.startsWith(dest + "/")
                return (
                  <Link
                    key={item.href}
                    href={dest}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                      isActive ? "bg-indigo-50 text-indigo-700 font-bold" : "text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
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
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <BackButton />
          {children}
        </div>
      </main>



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

    </div>
  )
}
