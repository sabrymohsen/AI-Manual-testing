import Link from "next/link"
import { getSession } from "@/lib/auth"
import { BrandMark, TerminalMock } from "@/components/landing/qa-os"
import {
  ArrowRight,
  Bug,
  CheckCircle2,
  ChevronRight,
  FileText,
  FlaskConical,
  Globe,
  Layers,
  ListOrdered,
  MonitorPlay
} from "lucide-react"

const FEATURES = [
  {
    icon: FlaskConical,
    name: "Live QA Session",
    description: "Test inside an embedded browser streamed straight into the app. The whole session is video-recorded, and any moment becomes a bug with one click.",
    accent: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20"
  },
  {
    icon: FileText,
    name: "Test Cases",
    description: "Manual and automated suites with priorities, structured steps, and full execution history — run automation on a local Playwright worker.",
    accent: "text-violet-400 bg-violet-500/10 border-violet-500/20"
  },
  {
    icon: ListOrdered,
    name: "Epic → Feature → Story",
    description: "A real requirements hierarchy. Plan the backlog across epics and trace every story down to the test cases that verify it.",
    accent: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
  },
  {
    icon: Bug,
    name: "Bug Reports",
    description: "Defects move through Open, In Progress, Ready for Retest, Reopened, and Closed — with severity, screenshots, and repro steps attached.",
    accent: "text-rose-400 bg-rose-500/10 border-rose-500/20"
  },
  {
    icon: Globe,
    name: "OpenProject Sync",
    description: "Two-way sync pushes bugs and stories to OpenProject as work packages, with connection health and project key mapping.",
    accent: "text-sky-400 bg-sky-500/10 border-sky-500/20"
  },
  {
    icon: Layers,
    name: "Requirements Traceability",
    description: "A live coverage view that links requirements to tests and instantly surfaces the ones nothing verifies yet.",
    accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
  }
]

const PIPELINE = ["plan backlog", "author tests", "run live / automated", "triage bugs", "sync openproject"]

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
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-slate-400">
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#pipeline" className="hover:text-white transition-colors">Pipeline</a>
            {session && (
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {!session && (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl text-[13px] font-bold text-slate-300 hover:text-white h-10 px-4 transition-colors"
              >
                Sign In
              </Link>
            )}
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-1.5 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-bold h-10 px-5 shadow-lg shadow-violet-600/30 transition-all"
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

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 grid lg:grid-cols-2 gap-14 items-center">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-bold text-violet-300 font-mono uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> system online · v3
            </span>

            <h1 className="text-4xl sm:text-[3.4rem] font-black tracking-tight leading-[1.04] text-white">
              The operating system for{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                quality engineering
              </span>
            </h1>

            <p className="text-[15px] text-slate-400 leading-relaxed max-w-lg">
              Run live QA sessions in an embedded browser, manage manual and automated test cases,
              trace an Epic → Feature → Story hierarchy down to every test, and push bugs straight
              into OpenProject.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={primaryCta.href}
                className="inline-flex items-center gap-2 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold h-11 px-6 shadow-lg shadow-violet-600/30 transition-all"
              >
                {primaryCta.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center gap-2 justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-bold h-11 px-6 transition-all"
              >
                <MonitorPlay className="h-4 w-4" /> {secondaryCta.label}
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-slate-500 font-medium pt-1">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Local-first</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Real-browser execution</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Session video recording</span>
            </div>
          </div>

          <TerminalMock />
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="platform" className="border-t border-white/5 bg-white/[0.015] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          <div className="max-w-2xl space-y-3">
            <p className="font-mono text-[11px] font-bold text-violet-400 uppercase tracking-[0.25em]">// core modules</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Everything QA, wired into one engine</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-violet-500/30 hover:bg-white/[0.05] transition-all">
                <div className={`h-10 w-10 rounded-xl border flex items-center justify-center mb-4 ${f.accent}`}>
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-extrabold text-[14.5px] text-white mb-1.5">{f.name}</h3>
                <p className="text-[12.5px] text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PIPELINE STRIP ===== */}
      <section id="pipeline" className="border-t border-white/5 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[12px] font-bold">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-slate-300">{step}</span>
                {i < PIPELINE.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-violet-500" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA + FOOTER ===== */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Boot up your QA engine</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {session ? "Jump back into your workspace." : "Create an account and run your first live QA session in minutes."}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-2 justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold h-11 px-6 shadow-lg shadow-violet-600/30 transition-all"
            >
              {session ? "Open Dashboard" : "Create Free Account"} <ArrowRight className="h-4 w-4" />
            </Link>
            {!session && (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-bold h-11 px-6 transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
        <footer className="border-t border-white/5 py-6 text-center">
          <p className="text-[11px] font-mono text-slate-600">© {new Date().getFullYear()} QA OS ENGINE — all systems nominal</p>
        </footer>
      </section>
    </div>
  )
}
