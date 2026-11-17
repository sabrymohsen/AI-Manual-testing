import Link from "next/link"
import { getSession } from "@/lib/auth"
import { BrandMark, TerminalMock } from "@/components/landing/qa-os"
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Brain,
  Bug,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Eye,
  Figma,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  History,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LineChart,
  ListChecks,
  MessageSquare,
  MousePointerClick,
  Play,
  Route,
  Settings,
  Shield,
  Sparkles,
  Trello,
  UserCircle,
  Users,
  Video,
  Wand2,
  Zap
} from "lucide-react"

/* ------------------------------------------------------------------ */
/* Feature data — names match the real in-app page titles exactly.     */
/* ------------------------------------------------------------------ */

type Feature = { icon: any; name: string; description: string }

const PLAN_FEATURES: Feature[] = [
  {
    icon: Trello,
    name: "Scrum Board",
    description:
      "Jira-style sprint planning: drag-and-drop backlog, kanban board, and a full task drawer with subtasks, work logs, attachments, watchers, and votes."
  },
  {
    icon: Layers,
    name: "Product Backlog",
    description:
      "A real Epic → Feature → Story hierarchy with workflow transitions, sprint start/complete, and a requirements kanban board alongside it."
  },
  {
    icon: FileSpreadsheet,
    name: "BRD Hub",
    description:
      "Upload, version, and preview business requirement documents (PDF + Word), edit them in a Word-style editor with docx export, and discuss sections with @mention comments."
  },
  {
    icon: LineChart,
    name: "Reports",
    description:
      "A live analytics dashboard: KPI tiles with sparklines, burndown, velocity, cumulative flow, defect trends, team radar, and a coverage funnel."
  },
  {
    icon: Users,
    name: "Members",
    description:
      "Two-tier access control — global admins plus per-project Owner, Admin, Member, and Viewer roles — with token-based email invitations."
  },
  {
    icon: LayoutDashboard,
    name: "Executive Monitoring Control",
    description:
      "The command dashboard: cross-project health, test and bug KPIs, and recent activity in one screen."
  }
]

const MANUAL_FEATURES: Feature[] = [
  {
    icon: FlaskConical,
    name: "Live QA Session",
    description:
      "Test inside an embedded browser streamed straight into the app. The whole session is video-recorded, and any moment becomes a bug with one click — annotated with arrows, highlights, and blur before it's filed."
  },
  {
    icon: History,
    name: "Live QA Session History",
    description:
      "Every ended session preserved with its recordings, screenshots, and the bugs it produced — each bug links back to the exact session it came from."
  },
  {
    icon: FileText,
    name: "Test Cases",
    description:
      "Manual and automated suites with priorities, structured steps, tags, bulk operations, and full execution history."
  },
  {
    icon: Bug,
    name: "Bug Reports",
    description:
      "Defects move through Open, In Progress, Ready for Retest, Reopened, and Closed — with severity, source, screenshots, repro steps, and bulk triage actions."
  },
  {
    icon: Camera,
    name: "Recorder Studio",
    description:
      "Click through your app in a real browser and replay the recording as an automated test on the local Playwright worker."
  },
  {
    icon: ListChecks,
    name: "Traceability Matrix",
    description:
      "Requirements Traceability as a live grid — every story linked to the tests that verify it, with untested requirements surfaced instantly."
  }
]

const HUB_TOOLS: Feature[] = [
  {
    icon: Play,
    name: "Test Studio",
    description: "Author and launch automated suites with test data, accessibility checks, and execution targets."
  },
  {
    icon: Camera,
    name: "Recorder",
    description: "Visual flow recorder that turns real browser sessions into repeatable automated tests."
  },
  {
    icon: FolderOpen,
    name: "Evidence",
    description: "Evidence Vault: screenshots, animated GIFs with a frame viewer and highlighter, plus live-streamed execution logs."
  },
  {
    icon: Route,
    name: "Trace Viewer",
    description: "Execution traces unpacked into timeline, network, console, and observability views."
  },
  {
    icon: Sparkles,
    name: "Diagnosis",
    description: "AI failure diagnosis with a full diagnostics bundle — trace, environment metadata, and a redaction scan."
  },
  {
    icon: Shield,
    name: "Heal Center",
    description: "Self-healing locators with a locator-health report and estimated resolution time per broken selector."
  },
  {
    icon: Activity,
    name: "Flake Map",
    description: "Flaky-test detection plus a wait-analysis profiler that flags reducible waits from real trace timings."
  },
  {
    icon: LayoutGrid,
    name: "Browser Matrix",
    description: "Local cross-browser grid plus Cloud & Parallel: BrowserStack config, Docker runs, and sequential-vs-parallel savings."
  },
  {
    icon: Eye,
    name: "Visual Diff",
    description: "Pixel-level baseline comparisons with a baseline manager, comparison runs, and tunable thresholds."
  },
  {
    icon: Video,
    name: "Video Lab",
    description: "Execution videos with trace-action markers, jump-to-failure, and ffmpeg clip export."
  },
  {
    icon: Bot,
    name: "AI Agent (MCP)",
    description: "Chat with your suite: command library, per-provider setup, real token and cost tracking, consent and budgets."
  },
  {
    icon: Settings,
    name: "Data & Config",
    description: "Engine properties editor, environment variables, AES-GCM encrypted secrets with an audit log, and live system logs."
  }
]

const AI_FEATURES: Feature[] = [
  {
    icon: Wand2,
    name: "AI Test Case Generator",
    description:
      "Generate structured test cases from your requirements — or straight from an uploaded document."
  },
  {
    icon: Brain,
    name: "QA Agent Brain",
    description:
      "An agent workspace that reasons over your project — requirements, tests, and bugs — to answer questions and draft work."
  },
  {
    icon: Figma,
    name: "Figma Visual QA",
    description:
      "Compare the live UI against your Figma designs and catch drift before users do."
  },
  {
    icon: MousePointerClick,
    name: "Element Locator Picker",
    description:
      "Point at any element in a live page and get a stable selector for your tests."
  },
  {
    icon: Database,
    name: "Test Data Manager",
    description:
      "Central datasets for your suites — shared between manual runs and the automation engine."
  },
  {
    icon: Route,
    name: "Reusable Step Library",
    description:
      "Author flows once, reuse them across test cases as shared building blocks."
  }
]

const COLLAB_FEATURES: Feature[] = [
  {
    icon: MessageSquare,
    name: "Team Chat",
    description:
      "Real-time channels and private DMs, scoped to your workspace — triage without leaving the app."
  },
  {
    icon: Bell,
    name: "Notification Center",
    description:
      "A real-time bell wired into everything: assignments, mentions, sync results, and run outcomes."
  },
  {
    icon: UserCircle,
    name: "Profiles",
    description:
      "Public member profiles with activity history, plus per-project teams and roles."
  },
  {
    icon: Globe,
    name: "OpenProject Sync",
    description:
      "Two-way sync pushes bugs and stories to OpenProject as work packages — with connection health, key mapping, and idempotent board placement. Team members sync from Jira, Azure DevOps, and OpenProject too."
  }
]

const PIPELINE = [
  "plan sprint",
  "author tests",
  "run live + automated",
  "diagnose & heal",
  "triage bugs",
  "sync & report"
]

const NAV_SECTIONS = [
  { href: "#plan", label: "Plan" },
  { href: "#manual", label: "Manual QA" },
  { href: "#automation", label: "Automation Hub" },
  { href: "#ai", label: "AI" },
  { href: "#collab", label: "Collaboration" }
]

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function SectionHeading({
  kicker,
  title,
  blurb,
  accent
}: {
  kicker: string
  title: string
  blurb: string
  accent: string
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.25em] ${accent}`}>{kicker}</p>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="text-[13.5px] text-muted-foreground leading-relaxed">{blurb}</p>
    </div>
  )
}

function FeatureCard({ feature, accent }: { feature: Feature; accent: string }) {
  return (
    <div className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 hover:border-violet-500/40 hover:bg-white/[0.05] transition-all">
      <div className={`h-10 w-10 rounded-xl border flex items-center justify-center mb-4 ${accent}`}>
        <feature.icon className="h-[18px] w-[18px]" />
      </div>
      <h3 className="font-semibold text-[14.5px] text-white mb-1.5">{feature.name}</h3>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{feature.description}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function Home() {
  const session = await getSession()

  const primaryCta = session
    ? { href: "/dashboard", label: "Open Dashboard" }
    : { href: "/register", label: "Get Started" }
  const secondaryCta = session
    ? { href: "/projects", label: "Projects" }
    : { href: "/login", label: "Sign In" }

  return (
    <div className="min-h-screen bg-[#060918] text-slate-100 font-sans antialiased selection:bg-violet-600 selection:text-white">
      {/* ===== NAV ===== */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060918]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BrandMark />
          <nav className="hidden md:flex items-center gap-5 text-[13px] font-semibold text-muted-foreground">
            {NAV_SECTIONS.map((s) => (
              <a key={s.href} href={s.href} className="hover:text-white transition-colors">
                {s.label}
              </a>
            ))}
            {session && (
              <Link href="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {!session && (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl text-[13px] font-semibold text-slate-300 hover:text-white h-10 px-4 transition-colors"
              >
                Sign In
              </Link>
            )}
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-1.5 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-semibold h-10 px-5 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-600/30 transition-all"
            >
              {primaryCta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.06)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)] pointer-events-none" />
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 h-[400px] w-[700px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-14 grid lg:grid-cols-2 gap-14 items-center">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-semibold text-violet-300 font-mono uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> system online · v4
            </span>

            <h1 className="text-4xl sm:text-[3.4rem] font-semibold tracking-tight leading-[1.04] text-white">
              The operating system for{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                quality engineering
              </span>
            </h1>

            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-lg">
              Plan sprints, run live QA sessions in an embedded browser, drive a 12-tool automation
              hub with self-healing tests, generate cases with AI, and sync everything to
              OpenProject — one workspace, end to end.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={primaryCta.href}
                className="inline-flex items-center gap-2 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold h-11 px-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-600/30 transition-all"
              >
                {primaryCta.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center gap-2 justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-semibold h-11 px-6 transition-all"
              >
                {secondaryCta.label}
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground font-medium pt-1">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Local-first
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Real-browser execution
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Session video recording
              </span>
            </div>
          </div>

          <TerminalMock />
        </div>

        {/* Stats strip */}
        <div className="relative border-t border-white/5 bg-white/[0.015]">
          <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              ["28+", "platform modules"],
              ["12", "automation hub tools"],
              ["4", "AI providers — incl. free local"],
              ["3", "trackers synced (OpenProject · Jira · Azure)"]
            ].map(([stat, label]) => (
              <div key={label} className="space-y-1">
                <p className="text-2xl font-semibold text-white font-mono">{stat}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PLAN & MANAGE ===== */}
      <section id="plan" className="border-t border-white/5 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          <SectionHeading
            kicker="// 01 · plan & manage"
            title="Sprints, requirements, and the paperwork — handled"
            blurb="Everything upstream of the first test: scrum ceremonies, a real requirements hierarchy, business requirement documents, and analytics that read from live data."
            accent="text-indigo-400"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLAN_FEATURES.map((f) => (
              <FeatureCard key={f.name} feature={f} accent="text-indigo-400 bg-primary/10 border-primary/20" />
            ))}
          </div>
        </div>
      </section>

      {/* ===== MANUAL TESTING ===== */}
      <section id="manual" className="border-t border-white/5 bg-white/[0.015] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          <SectionHeading
            kicker="// 02 · manual testing"
            title="Exploratory QA that leaves a paper trail"
            blurb="A live embedded browser, structured test cases, and a bug lifecycle built for retesting — every finding traceable back to the session, the step, and the story."
            accent="text-cyan-400"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MANUAL_FEATURES.map((f) => (
              <FeatureCard key={f.name} feature={f} accent="text-cyan-400 bg-cyan-500/10 border-cyan-500/20" />
            ))}
          </div>
        </div>
      </section>

      {/* ===== AUTOMATION HUB ===== */}
      <section id="automation" className="border-t border-white/5 scroll-mt-16 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-16 space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              kicker="// 03 · automation hub"
              title="Twelve tools. One engine."
              blurb="The Automation Hub wraps the execution engine in a full toolchain — from authoring and evidence to AI diagnosis, self-healing, flake analysis, and cross-browser scale."
              accent="text-violet-400"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-semibold text-violet-300 font-mono uppercase tracking-widest">
              <Cpu className="h-3.5 w-3.5" /> automation hub
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {HUB_TOOLS.map((f, i) => (
              <div
                key={f.name}
                className="group rounded-xl border border-white/10 bg-[#0A0E1F] p-4 hover:border-violet-500/40 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="h-9 w-9 rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-400 flex items-center justify-center">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-semibold text-[13.5px] text-white mb-1">{f.name}</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== AI ===== */}
      <section id="ai" className="border-t border-white/5 bg-white/[0.015] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          <SectionHeading
            kicker="// 04 · ai copilots"
            title="AI where it earns its keep"
            blurb="Generation, diagnosis, and design comparison — powered by Ollama running locally, Hugging Face, or OpenAI, with a free rule-based mode that needs no key at all."
            accent="text-emerald-400"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_FEATURES.map((f) => (
              <FeatureCard key={f.name} feature={f} accent="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-semibold text-muted-foreground">
            <span className="uppercase tracking-widest text-muted-foreground">providers:</span>
            {["Ollama (local)", "Hugging Face", "OpenAI", "rule-based · free"].map((p) => (
              <span key={p} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COLLABORATION & INTEGRATIONS ===== */}
      <section id="collab" className="border-t border-white/5 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          <SectionHeading
            kicker="// 05 · collaboration & sync"
            title="The whole team, in the loop"
            blurb="Chat, notifications, and profiles built in — and a sync layer that meets your tracker where it already lives."
            accent="text-sky-400"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLLAB_FEATURES.map((f) => (
              <FeatureCard key={f.name} feature={f} accent="text-sky-400 bg-sky-500/10 border-sky-500/20" />
            ))}
          </div>
        </div>
      </section>

      {/* ===== PIPELINE STRIP ===== */}
      <section id="pipeline" className="border-t border-white/5 bg-white/[0.015] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-12 space-y-6">
          <p className="text-center font-mono text-[11px] font-semibold text-violet-400 uppercase tracking-[0.25em]">
            // the pipeline
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[12px] font-semibold">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-slate-300">
                  {step}
                </span>
                {i < PIPELINE.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-violet-500" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA + FOOTER ===== */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center space-y-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-500/30 mx-auto">
            <Zap className="h-6 w-6" fill="currentColor" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Boot up your QA engine</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {session
              ? "Jump back into your workspace."
              : "Create an account and run your first live QA session in minutes."}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-2 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold h-11 px-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-600/30 transition-all"
            >
              {session ? "Open Dashboard" : "Create Free Account"} <ArrowRight className="h-4 w-4" />
            </Link>
            {!session && (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-semibold h-11 px-6 transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
        <footer className="border-t border-white/5 py-6 text-center">
          <p className="text-[11px] font-mono text-muted-foreground">
            © {new Date().getFullYear()} QA Engine — all systems nominal
          </p>
        </footer>
      </section>
    </div>
  )
}
