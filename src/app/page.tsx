import Link from "next/link"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
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
    projects: 12,
    testCases: 342,
    passedRuns: 1845,
    failedRuns: 24,
    openBugs: 5,
    coveragePercent: 94,
    recorderSessions: 120,
    agentRuns: 45
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors selection:bg-indigo-500 selection:text-white">
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 text-white p-2 rounded-xl shadow-md">
              <Cpu className="h-5 w-5 animate-pulse" />
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              AI Manual QA Tester
            </span>
          </div>

          {session && (
            <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <a href="#features" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">How It Works</a>
              <a href="#recorder" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Recorder</a>
              <a href="#agent" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">QA Agent</a>
              <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Dashboard</Link>
            </nav>
          )}

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 justify-center rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-5 shadow-lg shadow-indigo-600/10 transition-all hover:scale-[1.02]"
                >
                  Go to Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 h-10 px-4 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-4.5 shadow-md shadow-indigo-600/10 transition-all hover:scale-[1.02]"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Radial Gradient Background Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-indigo-500/5 via-purple-500/0 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 2. Hero Section */}
      <section className="py-20 md:py-28 max-w-5xl mx-auto px-4 text-center space-y-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 animate-bounce">
          <Sparkles className="h-3.5 w-3.5" /> Next-Gen Local-First QA Platform
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-white dark:via-indigo-100 dark:to-white bg-clip-text text-transparent">
          AI Manual QA Tester
        </h1>
        <p className="text-base sm:text-xl text-slate-500 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed font-medium">
          Create, record, execute, and report professional QA test cases with automation, smart locators, self-healing, and local-first QA agent assistance.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-6 shadow-xl shadow-indigo-600/15 transition-all hover:scale-[1.02]"
              >
                Go to Dashboard <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-semibold border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 h-12 px-6 transition-all"
              >
                <Plus className="h-5 w-5" /> Create Project
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-6 shadow-xl shadow-indigo-600/15 transition-all hover:scale-[1.02]"
              >
                Create Account <ChevronRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl text-base font-semibold border border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 h-12 px-6 transition-all"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* 3. Onboarding Quick-Start path for new signed-in users */}
      {session && hasNoProjects && (
        <section className="max-w-4xl mx-auto px-4 pb-12 animate-in fade-in duration-300">
          <div className="border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-950/10 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm border-l-4 border-l-indigo-600">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-950 dark:text-indigo-300">Welcome to AI Manual QA Tester!</h2>
              <p className="text-sm text-muted-foreground">Follow these 3 simple steps to start testing your application:</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <div className="h-8 w-8 rounded-full bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow">1</div>
                <h3 className="font-bold text-sm">Create a Project</h3>
                <p className="text-xs text-muted-foreground">Register your application workspace and configure environments.</p>
              </div>
              <div className="space-y-2">
                <div className="h-8 w-8 rounded-full bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-sm">2</div>
                <h3 className="font-bold text-sm">Configure credentials</h3>
                <p className="text-xs text-muted-foreground">Add project login roles and targets for safe browser validation.</p>
              </div>
              <div className="space-y-2">
                <div className="h-8 w-8 rounded-full bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center text-sm">3</div>
                <h3 className="font-bold text-sm">Record Test Cases</h3>
                <p className="text-xs text-muted-foreground">Launch the browser recorder toolbar to generate executable workflows.</p>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/projects"
                className="inline-flex items-center gap-1.5 justify-center rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-5 shadow transition-all hover:scale-[1.02]"
              >
                <Plus className="h-4.5 w-4.5" /> Create Your First Project
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 4. Feature Overview Cards Grid */}
      <section id="features" className="py-20 border-t bg-slate-100/40 dark:bg-slate-900/10">
        <div className="max-w-7xl mx-auto px-4 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight">Complete QA Execution Suite</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              A comprehensive toolkit for recording, managing, executing, and analyzing test cases locally.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Card 1: Projects Hub */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Folder className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Projects Hub</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Manage multiple QA projects, environments, credentials, modules, features, and components.
              </p>
              {session && (
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  Manage Projects <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 2: Test Cases Hub */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Test Cases Hub</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Create, organize, search, filter, import, execute, and manage test cases across all projects.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400">
                  Open Test Cases <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 3: Recorder Test Cases */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                <Play className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">Recorder Test Cases</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Record real user actions in the browser and convert them into executable test cases with smart locators.
              </p>
              {session && (
                <Link href="/test-cases?action=record" className="inline-flex items-center gap-1 text-xs font-bold text-pink-600 dark:text-pink-400">
                  Start Recorder <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 4: Execution Engine */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Execution Engine</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Run Playwright-based test cases with logs, screenshots, step results, and execution history.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Run Tests <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 5: Bug Reports */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Bug Reports</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Create and track bugs with severity, screenshots, failed steps, logs, and reproduction details.
              </p>
              {session && (
                <Link href="/bug-reports" className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
                  View Bugs <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 6: QA Agent Brain */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Cpu className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">QA Agent Brain</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Let the QA Agent scan your app, generate test plans, execute tests, and detect bugs automatically.
              </p>
              {session && (
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                  Launch QA Agent <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 7: Smart Locator Engine */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Smart Locator Engine</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Generate reliable locators using role, text, labels, CSS, XPath, and advanced context fallbacks.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 cursor-help">
                Intelligent Fallbacks
              </span>
            </div>

            {/* Card 8: Self-Healing Recorder */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <RefreshCw className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">Self-Healing Recorder</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Recover broken locators automatically when the UI changes and keep recorded tests stable.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 dark:text-sky-400 cursor-help">
                Automated UI Tracking
              </span>
            </div>

            {/* Card 9: Figma Visual QA */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-650 dark:text-violet-400 flex items-center justify-center">
                <Eye className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">Figma Visual QA</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Compare implemented pages against Figma designs, detect layout differences, and highlight mismatches.
              </p>
              {session && (
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400">
                  Start Visual Check <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 10: Requirements Coverage */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Requirements Coverage</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Link requirements to test cases and bugs, then track coverage gaps and QA readiness.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400">
                  View Coverage <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 11: QA Dashboard */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">QA Dashboard</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Monitor project health, test results, failed runs, open bugs, coverage, and risky areas.
              </p>
              {session && (
                <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400">
                  Open Dashboard <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Card 12: Reports & Export */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-background shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-10 w-10 rounded-xl bg-slate-500/10 text-slate-650 dark:text-slate-400 flex items-center justify-center">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base group-hover:text-slate-600 dark:group-hover:text-slate-355 transition-colors">Reports & Export</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Export QA results, test cases, bugs, execution evidence, and summaries to spreadsheet formats.
              </p>
              {session && (
                <Link href="/test-cases" className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Export Reports <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works Section */}
      <section id="how-it-works" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight">How It Works</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Start building a robust execution model and coverage matrix in just five simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative">
            {/* Step 1 */}
            <div className="space-y-4 relative flex flex-col items-center md:items-start text-center md:text-left">
              <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white font-extrabold flex items-center justify-center text-lg shadow-lg">1</div>
              <h3 className="font-bold text-base">Create Project</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Add target web application URLs, environments, server roles, and credentials.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-4 relative flex flex-col items-center md:items-start text-center md:text-left">
              <div className="h-12 w-12 rounded-2xl bg-indigo-650 text-white font-extrabold flex items-center justify-center text-lg shadow-lg">2</div>
              <h3 className="font-bold text-base">Create or Record</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Write test steps manually, upload Excel sheets, or record browser actions.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-4 relative flex flex-col items-center md:items-start text-center md:text-left">
              <div className="h-12 w-12 rounded-2xl bg-indigo-650 text-white font-extrabold flex items-center justify-center text-lg shadow-lg">3</div>
              <h3 className="font-bold text-base">Execute Tests</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Run automated Playwright jobs on the worker node with logs and screenshots.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-4 relative flex flex-col items-center md:items-start text-center md:text-left">
              <div className="h-12 w-12 rounded-2xl bg-indigo-650 text-white font-extrabold flex items-center justify-center text-lg shadow-lg">4</div>
              <h3 className="font-bold text-base">Detect Bugs</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Convert failed test runs into bug reports complete with steps and evidence.
              </p>
            </div>

            {/* Step 5 */}
            <div className="space-y-4 relative flex flex-col items-center md:items-start text-center md:text-left">
              <div className="h-12 w-12 rounded-2xl bg-indigo-650 text-white font-extrabold flex items-center justify-center text-lg shadow-lg">5</div>
              <h3 className="font-bold text-base">Improve Coverage</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Link requirements, detect uncovered features, and review quality scores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Recorder Highlight Section */}
      <section id="recorder" className="py-20 border-t bg-slate-100/40 dark:bg-slate-900/10">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-pink-700 dark:text-pink-300 bg-pink-500/10 border border-pink-500/20">
              Core Workflow
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Recorder-Based Test Case Creation
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Use your application normally while the recorder captures every meaningful action, generates smart locators, lets you add expected results, and saves the flow as an executable test case.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> External browser recording</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> Injected recorder toolbar</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> Smart locator capture</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> Expected result per step</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> Multiple test cases per session</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-pink-500" /> Replay and validation</li>
            </ul>

            {session && (
              <div className="pt-2">
                <Link
                  href="/test-cases"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-sm font-bold bg-pink-600 hover:bg-pink-700 text-white h-11 px-5 shadow-lg shadow-pink-600/10 transition-all hover:scale-[1.02]"
                >
                  Create Test Case by Recorder <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Interactive Mock representation of recorder toolbar */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-background shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5"><Monitor className="h-4 w-4 text-pink-500" /> Playwright Browser (Headless: false)</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            
            <div className="bg-slate-100 dark:bg-slate-900 rounded-xl p-3.5 space-y-3 border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">Url: https://app.example.com/checkout</span>
                <span className="font-bold text-pink-500">Recording...</span>
              </div>
              <div className="h-20 bg-background border border-dashed rounded-lg flex items-center justify-center text-xs text-slate-400">
                Mock Web App Interface
              </div>
            </div>

            <div className="border border-pink-500/20 bg-pink-500/5 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-pink-700 dark:text-pink-400 uppercase tracking-wider flex items-center gap-1"><Settings className="h-3.5 w-3.5" /> Floating Toolbar</span>
                <span className="text-[10px] bg-pink-500 text-white px-2 py-0.5 rounded font-black">Active Case: Verify Checkout</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-background border rounded p-2 text-xs">
                  <span>Step 1: Click "Proceed to checkout" button</span>
                  <span className="text-[10px] text-muted-foreground font-mono">css=.btn-checkout</span>
                </div>
                <div className="flex items-center justify-between bg-background border rounded p-2 text-xs">
                  <span>Step 2: Fill password: "********"</span>
                  <span className="text-[10px] text-muted-foreground font-mono">id=password</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. QA Agent Brain Section */}
      <section id="agent" className="py-20 border-t bg-background">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Visual Agent scanner logs preview */}
          <div className="order-2 lg:order-1 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-900 text-slate-105 p-5 font-mono text-xs space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-slate-400 font-bold">
              <span className="flex items-center gap-1.5"><Terminal className="h-4 w-4 text-blue-500" /> QA Agent Terminal Logs</span>
              <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded font-sans font-black">Scanning</span>
            </div>
            
            <div className="space-y-2.5">
              <p className="text-slate-400">[{new Date().toLocaleTimeString()}] INFO: Launching Autonomous QA Agent scanner...</p>
              <p className="text-slate-400">[{new Date().toLocaleTimeString()}] INFO: Fetching app DOM tree & visual layers...</p>
              <p className="text-blue-400">[{new Date().toLocaleTimeString()}] SCAN: Found 12 clickable elements, 3 form inputs</p>
              <p className="text-slate-400">[{new Date().toLocaleTimeString()}] PLAN: Generating safe smoke test path (6 actions)</p>
              <p className="text-emerald-400">[{new Date().toLocaleTimeString()}] EXECUTE: Completed step 1: Click "Login" button</p>
              <p className="text-emerald-400">[{new Date().toLocaleTimeString()}] EXECUTE: Completed step 2: Fill username credential</p>
              <p className="text-yellow-400">[{new Date().toLocaleTimeString()}] WARN: Missing label tag on element &lt;input name="otp"&gt;</p>
              <p className="text-rose-450">[{new Date().toLocaleTimeString()}] ERROR: Console log error detected on /submit: "Cannot read properties of undefined"</p>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/20">
              Autonomous QA
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              QA Agent Brain
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              The QA Agent can scan your web app, understand common UI patterns, generate test plans, run safe smoke tests, detect issues, and create reports.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> Free Rule-Based Mode</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> No paid AI API required</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> Optional local LLM support</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> Safe read-only mode</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> Playwright app scans</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" /> Automatic bug detection</li>
            </ul>

            {session && (
              <div className="pt-2">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-sm font-bold bg-blue-650 hover:bg-blue-700 text-white h-11 px-5 shadow-lg shadow-blue-600/10 transition-all hover:scale-[1.02]"
                >
                  Try QA Agent Brain <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 8. Free / Local-First Section */}
      <section className="py-20 border-t bg-slate-100/40 dark:bg-slate-900/10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-3xl p-8 md:p-12 shadow-sm text-center space-y-8 relative overflow-hidden">
            <div className="absolute right-0 top-0 h-40 w-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute left-0 bottom-0 h-40 w-40 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-2xl mx-auto space-y-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Free and Local-First by Default</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Core testing, recording, Playwright execution, rule-based QA Agent planning, screenshots, logs, and reports work locally without requiring paid AI APIs.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">No paid AI required</span>
              <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">Local Playwright execution</span>
              <span className="text-[11px] font-bold text-pink-700 dark:text-pink-300 bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20">Free rule-based QA agent</span>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Optional local AI via Ollama / LM Studio</span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-350 bg-slate-500/10 px-3 py-1 rounded-full border border-slate-500/20">Your test data stays in your workspace</span>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Safety Section */}
      <section className="py-20 border-t bg-background">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-500/10 border border-slate-500/20">
              Security Control
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Built with QA Safety Controls
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              The system prevents destructive automated actions by default, protects project boundaries, and keeps credentials isolated per project.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Project-level isolation</div>
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Credential isolation</div>
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Read-only agent mode</div>
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Destructive action blocking</div>
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Controlled recorder sessions</div>
              <div className="flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-slate-500" /> Clear execution logs</div>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
            <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-indigo-650"><ShieldAlert className="h-4.5 w-4.5 text-indigo-600" /> Core Isolation Policies</h3>
            <div className="space-y-3.5 text-xs text-slate-500">
              <div className="flex gap-2">
                <span className="h-5 w-5 bg-indigo-500/10 text-indigo-600 rounded-full flex items-center justify-center shrink-0 font-bold">1</span>
                <p><strong>Strict Project Sandbox:</strong> Test cases, requirements, locators, and screenshots cannot leak across projects.</p>
              </div>
              <div className="flex gap-2">
                <span className="h-5 w-5 bg-indigo-500/10 text-indigo-600 rounded-full flex items-center justify-center shrink-0 font-bold">2</span>
                <p><strong>Credential Shield:</strong> Login credentials are encrypted and scoped to the project. The recorder pre-fills roles safely without exposing actual passwords.</p>
              </div>
              <div className="flex gap-2">
                <span className="h-5 w-5 bg-indigo-500/10 text-indigo-600 rounded-full flex items-center justify-center shrink-0 font-bold">3</span>
                <p><strong>Agent Safeties:</strong> The QA Agent uses dry-run scans and blocks destructive clicks (like Delete or Clear database options) unless explicitly approved.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Dashboard Preview Section */}
      <section id="dashboard-preview" className="py-20 border-t bg-slate-100/40 dark:bg-slate-900/10">
        <div className="max-w-7xl mx-auto px-4 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight">Real-Time QA Metrics</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {session ? "Real-time statistics loaded from your workspace database." : "Preview metrics of a typical QA workspace."}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Projects */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Projects</span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100">{displayStats.projects}</h3>
              <p className="text-[10px] text-muted-foreground">Active codebases</p>
            </div>

            {/* Test Cases */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Test Cases</span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100">{displayStats.testCases}</h3>
              <p className="text-[10px] text-muted-foreground">Executable files</p>
            </div>

            {/* Passed Runs */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Passed Tests</span>
              <h3 className="text-3xl font-black text-emerald-600">{displayStats.passedRuns}</h3>
              <p className="text-[10px] text-muted-foreground">Successful runs</p>
            </div>

            {/* Failed Runs */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Failed Tests</span>
              <h3 className="text-3xl font-black text-red-600">{displayStats.failedRuns}</h3>
              <p className="text-[10px] text-muted-foreground">Triage logs pending</p>
            </div>

            {/* Open Bugs */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Open Bugs</span>
              <h3 className="text-3xl font-black text-orange-600">{displayStats.openBugs}</h3>
              <p className="text-[10px] text-muted-foreground">Active bug logs</p>
            </div>

            {/* Coverage */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Coverage %</span>
              <h3 className="text-3xl font-black text-indigo-650">{displayStats.coveragePercent}%</h3>
              <p className="text-[10px] text-muted-foreground">Linked requirements</p>
            </div>

            {/* Recorder Sessions */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Recorder Sessions</span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100">{displayStats.recorderSessions}</h3>
              <p className="text-[10px] text-muted-foreground">Recorded sessions</p>
            </div>

            {/* Agent Runs */}
            <div className="border border-slate-200 dark:border-slate-800 bg-background rounded-2xl p-5 space-y-2 shadow-sm text-center">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Agent Runs</span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100">{displayStats.agentRuns}</h3>
              <p className="text-[10px] text-muted-foreground">Agent execution scans</p>
            </div>
          </div>
        </div>
      </section>

      {/* 11. Call To Action Section */}
      <section className="py-20 md:py-24 bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 text-white text-center">
        <div className="max-w-4xl mx-auto px-4 space-y-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Ready to transform your QA workflow?</h2>
          <p className="text-sm sm:text-base text-slate-305 max-w-2xl mx-auto leading-relaxed font-medium">
            Get started with AI Manual QA Tester today and experience local-first automated test case generation, browser recording, and intelligent agent scans.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            {session ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-bold bg-white text-indigo-950 hover:bg-slate-100 h-12 px-6 shadow-xl transition-all hover:scale-[1.02]"
                >
                  Go to Dashboard <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-semibold border border-white/20 bg-transparent hover:bg-white/10 text-white h-12 px-6 transition-all"
                >
                  Create Project
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 justify-center rounded-xl text-base font-bold bg-white text-indigo-950 hover:bg-slate-100 h-12 px-6 shadow-xl transition-all hover:scale-[1.02]"
                >
                  Create Account <ChevronRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl text-base font-semibold border border-white/20 bg-transparent hover:bg-white/10 text-white h-12 px-6 transition-all"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer copyright */}
      <footer className="py-8 bg-slate-900 text-slate-400 border-t border-slate-800 text-xs font-semibold text-center">
        &copy; {new Date().getFullYear()} AI Manual QA Tester. All rights reserved. Built for local-first enterprise software validation.
      </footer>
    </div>
  )
}
