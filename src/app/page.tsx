import Link from "next/link"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import InteractiveShowcase from "@/components/landing/interactive-showcase"
import {
  Play,
  FileText,
  Plus,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  Zap,
  CheckCircle,
  AlertCircle,
  Activity,
  Bug,
  Folder,
  Database,
  Search,
  Eye,
  Settings,
  Cpu,
  RefreshCw,
  HelpCircle,
  Terminal,
  Lock,
  Download,
  Info,
  ShieldAlert,
  ChevronRight,
  Monitor,
  LayoutGrid,
  FileSpreadsheet
} from "lucide-react"

export default async function Home() {
  let stats = null
  let hasNoProjects = false
  const session = await getSession()

  if (session?.user) {
    try {
      const userId = session.user.id
      const [
        totalProjects,
        totalTestCases,
        passedRuns,
        failedRuns,
        openBugs,
        totalRequirements,
        uncoveredRequirements,
        totalRecorderSessions,
        totalAgentRuns
      ] = await Promise.all([
        prisma.project.count({ where: { userId } }),
        prisma.testCase.count({ where: { project: { userId } } }),
        prisma.testRun.count({ where: { project: { userId }, status: "Passed" } }),
        prisma.testRun.count({ where: { project: { userId }, status: "Failed" } }),
        prisma.bugReport.count({
          where: {
            project: { userId },
            status: { in: ["Open", "InProgress", "ReadyForRetest", "Reopened"] }
          }
        }),
        prisma.requirement.count({ where: { project: { userId } } }),
        prisma.requirement.count({
          where: {
            project: { userId },
            testCases: { none: {} }
          }
        }),
        prisma.recordingSession.count({ where: { project: { userId } } }),
        prisma.qAAgentRun.count({ where: { project: { userId } } })
      ])

      const coveragePercent = totalRequirements > 0
        ? Math.round(((totalRequirements - uncoveredRequirements) / totalRequirements) * 100)
        : 100

      stats = {
        projects: totalProjects,
        testCases: totalTestCases,
        passedRuns,
        failedRuns,
        openBugs,
        coveragePercent,
        recorderSessions: totalRecorderSessions,
        agentRuns: totalAgentRuns
      }

      if (totalProjects === 0) {
        hasNoProjects = true
      }
    } catch (err) {
      console.error("Failed to load landing page stats:", err)
    }
  }

  // Fallback demo/preview stats if not signed in or fail to load
  const displayStats = stats || {
    projects: 8,
    testCases: 247,
    passedRuns: 1482,
    failedRuns: 14,
    openBugs: 3,
    coveragePercent: 91,
    recorderSessions: 94,
    agentRuns: 38
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 transition-colors selection:bg-indigo-500 selection:text-white relative overflow-hidden font-sans">
      
      {/* Mesh gradients for modern background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-[30%] right-[-10%] w-[60%] h-[60%] bg-purple-900/15 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Subtle grid background overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-900/80 bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 text-white p-1.5 rounded-xl shadow-lg shadow-indigo-500/10">
              <Cpu className="h-5 w-5 animate-pulse" />
            </div>
            <span className="font-black text-base tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Antigravity QA
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-400">
            <a href="#features" className="hover:text-indigo-400 transition-colors">FEATURES</a>
            <a href="#how-it-works" className="hover:text-indigo-400 transition-colors">HOW IT WORKS</a>
            <a href="#interactive-suite" className="hover:text-indigo-400 transition-colors">QA SIMULATIONS</a>
            {session && (
              <Link href="/dashboard" className="hover:text-indigo-400 transition-colors">DASHBOARD</Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 justify-center rounded-xl text-xs font-extrabold bg-indigo-650 hover:bg-indigo-700 text-white h-9 px-4.5 shadow-lg shadow-indigo-650/15 transition-all hover:scale-[1.02]"
              >
                Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl text-xs font-bold border border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-300 h-9 px-4 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-xl text-xs font-extrabold bg-indigo-650 hover:bg-indigo-700 text-white h-9 px-4 shadow-lg shadow-indigo-650/15 transition-all hover:scale-[1.02]"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="py-20 md:py-28 max-w-5xl mx-auto px-6 text-center space-y-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> LOCAL-FIRST AUTONOMOUS QA PLATFORM
        </div>
        <h1 className="text-4xl sm:text-7xl font-black tracking-tight leading-[1.05] bg-gradient-to-r from-white via-indigo-100 to-slate-200 bg-clip-text text-transparent">
          Next-Gen AI & Manual<br/>QA Workspace
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
          Create, record, and execute professional QA test cases with local automation workers, self-healing recorder toolbars, visual diff slider regression, and an autonomous QA Agent.
        </p>

        <div className="flex flex-wrap gap-4 justify-center pt-2">
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-sm font-bold bg-indigo-650 hover:bg-indigo-700 text-white h-11 px-5 shadow-xl shadow-indigo-600/15 transition-all hover:scale-[1.02]"
              >
                Go to Dashboard <ArrowRight className="h-4.5 w-4.5" />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-sm font-semibold border border-slate-800 bg-slate-900/35 hover:bg-slate-900 text-slate-300 h-11 px-5 transition-all"
              >
                <Plus className="h-4.5 w-4.5" /> Create Project
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-sm font-bold bg-indigo-650 hover:bg-indigo-700 text-white h-11 px-5 shadow-xl shadow-indigo-600/15 transition-all hover:scale-[1.02]"
              >
                Create Account <ChevronRight className="h-4.5 w-4.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl text-sm font-semibold border border-slate-800 bg-slate-900/35 hover:bg-slate-900 text-slate-300 h-11 px-5 transition-all"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* 3. Interactive Showcase Live Demo Simulator */}
      <section id="interactive-suite" className="py-8 max-w-7xl mx-auto px-6 space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            Interactive Test Suite Simulations
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            Explore how Antigravity manages self-healing browser execution, agent scans, and visual comparison.
          </p>
        </div>
        <InteractiveShowcase />
      </section>

      {/* 4. Onboarding Quick-Start path for new signed-in users */}
      {session && hasNoProjects && (
        <section className="max-w-4xl mx-auto px-6 pb-12 animate-in fade-in duration-300">
          <div className="border border-indigo-550/20 bg-indigo-950/10 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm border-l-4 border-l-indigo-500">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-indigo-300">Welcome to your new QA workspace!</h2>
              <p className="text-xs text-slate-400">Complete these three steps to deploy automated testing across your application:</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <div className="h-7 w-7 rounded-full bg-indigo-650 text-white font-extrabold flex items-center justify-center text-xs shadow">1</div>
                <h3 className="font-bold text-xs text-slate-200">Create a Project</h3>
                <p className="text-[11px] text-slate-450">Register application workspace targets, URLs, and environments.</p>
              </div>
              <div className="space-y-2">
                <div className="h-7 w-7 rounded-full bg-indigo-900/50 text-indigo-300 font-extrabold flex items-center justify-center text-xs">2</div>
                <h3 className="font-bold text-xs text-slate-200">Add Credentials</h3>
                <p className="text-[11px] text-slate-450">Provide testing roles and credentials for automated session logs.</p>
              </div>
              <div className="space-y-2">
                <div className="h-7 w-7 rounded-full bg-indigo-900/50 text-indigo-300 font-extrabold flex items-center justify-center text-xs">3</div>
                <h3 className="font-bold text-xs text-slate-200">Record Test Cases</h3>
                <p className="text-[11px] text-slate-450">Deploy the browser toolbar recorder to capture steps and locators.</p>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/projects"
                className="inline-flex items-center gap-1.5 justify-center rounded-xl text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white h-9 px-4.5 shadow transition-all hover:scale-[1.02]"
              >
                <Plus className="h-4 w-4" /> Create Your First Project
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 5. Features Grid */}
      <section id="features" className="py-20 border-t border-slate-900 bg-slate-950/20">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white">Full-Stack QA Suite</h2>
            <p className="text-xs text-slate-400 font-medium">
              Everything you need to orchestrate manual testing, local automation workers, and coverage requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Card 1: Projects Hub */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Folder className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-indigo-400 transition-colors">Projects Hub</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Manage target URLs, staging environments, testing login roles, modules, and component hierarchies.
              </p>
              {session && (
                <Link href="/projects" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                  Manage Projects <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 2: Test Cases Suite */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-purple-400 transition-colors">Test Cases Hub</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Manage details, priority parameters, custom scripts, and trace execution status history lists.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-400">
                  Open Test Cases <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 3: Toolbar Recorder */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                <Play className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-pink-400 transition-colors">Browser Recorder</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Launch external browser instances directly and capture step actions, alt keys, values, and targets.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-[11px] font-bold text-pink-400">
                  Start Recorder <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 4: Local Test Worker */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Activity className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors">Local Worker</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Execute automated Playwright test loops locally via background BullMQ queues with logs and screenshots.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  Run Tests <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 5: Triage Bug Reports */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
                <Bug className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-red-400 transition-colors">Bug Reports</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Log and triage bugs. Automatically generate screenshots, console logs, and step reproduction details.
              </p>
              {session && (
                <Link href="/bug-reports" className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
                  View Bugs <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 6: AI QA Agent Brain */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Cpu className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-blue-400 transition-colors">QA Agent Brain</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Crawl DOM hierarchies, build action trees, and auto-detect exceptions or console bugs without setup.
              </p>
              {session && (
                <Link href="/projects" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400">
                  Launch QA Agent <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Card 7: Smart Locator Engine */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Search className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-amber-400 transition-colors">Smart Locators</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Collect role, label, text, class, and XPath fallbacks simultaneously for highly robust validation.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 cursor-help">
                Multi-layer selectors
              </span>
            </div>

            {/* Card 8: Self-Healing Algorithms */}
            <div className="border border-slate-900 rounded-2xl p-5 space-y-4 bg-slate-900/30 hover:border-slate-800 transition-all group relative overflow-hidden">
              <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <RefreshCw className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-bold text-sm text-slate-200 group-hover:text-sky-400 transition-colors">Self-Healing</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Detect locator drift automatically when frontend changes occur, repairing tests dynamically.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 cursor-help">
                Automatic recovery
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. How It Works Section */}
      <section id="how-it-works" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white">How It Works</h2>
            <p className="text-xs text-slate-400 font-medium">
              Start building a robust execution model and coverage matrix in just five simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
            <div className="space-y-3 p-4 rounded-2xl border border-slate-900/50 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white font-extrabold flex items-center justify-center text-xs shadow-lg">1</div>
              <h3 className="font-bold text-xs text-slate-200">Register Target</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Add application target URLs, staging environments, and login credentials safely.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-2xl border border-slate-900/50 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="h-8 w-8 rounded-lg bg-indigo-650 text-white font-extrabold flex items-center justify-center text-xs shadow-lg">2</div>
              <h3 className="font-bold text-xs text-slate-200">Record Actions</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Launch browser loops and record user steps, assertions, and inputs interactively.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-2xl border border-slate-900/50 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="h-8 w-8 rounded-lg bg-indigo-650 text-white font-extrabold flex items-center justify-center text-xs shadow-lg">3</div>
              <h3 className="font-bold text-xs text-slate-200">Verify Executions</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Execute runs locally via the background worker queue with screen verification captures.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-2xl border border-slate-900/50 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="h-8 w-8 rounded-lg bg-indigo-650 text-white font-extrabold flex items-center justify-center text-xs shadow-lg">4</div>
              <h3 className="font-bold text-xs text-slate-200">Triage Bugs</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                File detailed bugs from failed tests. Sync status outputs to OpenProject instances.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-2xl border border-slate-900/50 bg-slate-900/20 hover:border-slate-800 transition-all">
              <div className="h-8 w-8 rounded-lg bg-indigo-650 text-white font-extrabold flex items-center justify-center text-xs shadow-lg">5</div>
              <h3 className="font-bold text-xs text-slate-200">Close Gaps</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Link test coverage to epics and requirements to trace application quality maps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Safety Sandbox and Local-First Architecture */}
      <section className="py-20 border-t border-slate-900 bg-slate-950/30">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              SECURITY & PRIVACY BY DESIGN
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Local-First & Isolated Sandbox
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-medium">
              Antigravity runs completely on your hardware. Project credentials, database records, execution reports, and recording outputs are kept isolated within your local workspace node.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-300">
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-indigo-400" /> Project-level partition</div>
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-indigo-400" /> Encrypted credential keys</div>
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-indigo-400" /> Read-only agent bounds</div>
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-indigo-400" /> Self-contained worker process</div>
            </div>
          </div>

          <div className="border border-slate-900 bg-slate-900/10 p-6 rounded-2xl space-y-4">
            <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-indigo-400">
              <ShieldAlert className="h-4 w-4 text-indigo-400" /> Active Security Controls
            </h3>
            <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed">
              <div>
                <p className="font-bold text-slate-200">1. Safe AI Boundaries</p>
                <p className="text-[11px] mt-0.5 text-slate-400">The QA Agent is restricted from triggering modifications (e.g. DELETE requests) unless explicitly white-listed or manually confirmed.</p>
              </div>
              <div>
                <p className="font-bold text-slate-200">2. Local Credentials Store</p>
                <p className="text-[11px] mt-0.5 text-slate-400">Credentials and API sync tokens are encrypted locally in your database instance and never shared with third-party servers.</p>
              </div>
              <div>
                <p className="font-bold text-slate-200">3. Playwright Sandbox Container</p>
                <p className="text-[11px] mt-0.5 text-slate-400">Browser execution scripts are isolated within a dedicated sub-process to prevent environment drift.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Dashboard Metrics Preview */}
      <section id="dashboard-preview" className="py-20 border-t border-slate-900 bg-slate-955/10">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white">QA Metrics Console</h2>
            <p className="text-xs text-slate-400 font-medium">
              {session ? "Workspace statistics retrieved directly from your project database." : "Typical metrics summary inside a QA workspace."}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            
            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Total Projects</span>
              <h3 className="text-2xl font-black text-white">{displayStats.projects}</h3>
              <p className="text-[9px] text-slate-500">Active environments</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Test Cases</span>
              <h3 className="text-2xl font-black text-white">{displayStats.testCases}</h3>
              <p className="text-[9px] text-slate-500">Executable scripts</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Passed Tests</span>
              <h3 className="text-2xl font-black text-emerald-500">{displayStats.passedRuns}</h3>
              <p className="text-[9px] text-slate-500">Validation success</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Failed Runs</span>
              <h3 className="text-2xl font-black text-red-500">{displayStats.failedRuns}</h3>
              <p className="text-[9px] text-slate-500">Triage pending</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Open Bugs</span>
              <h3 className="text-2xl font-black text-orange-500">{displayStats.openBugs}</h3>
              <p className="text-[9px] text-slate-500">Active reports</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Requirements coverage</span>
              <h3 className="text-2xl font-black text-indigo-400">{displayStats.coveragePercent}%</h3>
              <p className="text-[9px] text-slate-500">Quality score</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Recorder Sessions</span>
              <h3 className="text-2xl font-black text-white">{displayStats.recorderSessions}</h3>
              <p className="text-[9px] text-slate-500">Recorded streams</p>
            </div>

            <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-5 space-y-1 text-center hover:border-slate-800 transition-all">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Agent Scans</span>
              <h3 className="text-2xl font-black text-white">{displayStats.agentRuns}</h3>
              <p className="text-[9px] text-slate-500">Autonomous sweeps</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Call To Action Section */}
      <section className="py-20 md:py-24 bg-gradient-to-tr from-slate-950 via-indigo-950/40 to-slate-950 text-white text-center border-t border-slate-900 relative">
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Transform your QA lifecycle today</h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Configure local projects, record web interactions, auto-generate locators, and trace execution plans on a fully integrated platform.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-xs font-bold bg-white text-indigo-950 hover:bg-slate-100 h-11 px-6 shadow-xl transition-all hover:scale-[1.02]"
              >
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white h-11 px-6 shadow-xl transition-all hover:scale-[1.02]"
                >
                  Get Started for Free
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl text-xs font-semibold border border-slate-800 bg-transparent hover:bg-slate-900 text-white h-11 px-6 transition-all"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-center text-[10px] text-slate-500 font-bold tracking-wider">
        © {new Date().getFullYear()} ANTIGRAVITY QA PLATFORM. ALL RIGHTS RESERVED.
      </footer>
    </div>
  )
}
