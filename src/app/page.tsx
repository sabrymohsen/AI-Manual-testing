import Link from "next/link"
import { ArrowRight, Check, ChevronDown, Download, Globe2, Languages, Sparkles, Zap } from "lucide-react"
import { getSession } from "@/lib/auth"
import { AppPreview } from "@/components/landing/app-preview"
import { DesktopDownloadCards } from "@/components/auth/desktop-downloads"
import { AI_POINTS, FAQ, FEATURE_GROUPS, FLOW } from "@/components/landing/features"

/* Public website: what QA Engine is, every feature (real page names), the AI,
   and the desktop app downloads. Light first, on the app's own theme tokens. */

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Zap className="h-4 w-4" fill="currentColor" />
      </span>
      QA Engine
    </span>
  )
}

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#ai", label: "AI" },
  { href: "#download", label: "Desktop app" },
  { href: "#faq", label: "FAQ" },
]

function SectionTitle({ kicker, title, blurb, center }: { kicker: string; title: string; blurb?: string; center?: boolean }) {
  return (
    <div className={`max-w-2xl space-y-3 ${center ? "mx-auto text-center" : ""}`}>
      <p className="text-[13px] font-medium text-primary">{kicker}</p>
      <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[34px]">{title}</h2>
      {blurb && <p className="text-[15px] leading-relaxed text-muted-foreground">{blurb}</p>}
    </div>
  )
}

export default async function Home() {
  const session = await getSession()
  const primary = session ? { href: "/dashboard", label: "Open the app" } : { href: "/register", label: "Get started free" }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="QA Engine home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            {!session && (
              <Link href="/login" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                Sign in
              </Link>
            )}
            <Link
              href={primary.href}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              {primary.label}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,hsl(var(--primary)/0.14),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI that knows QA · Arabic &amp; English
              </span>
              <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[54px]">
                One workspace for your <span className="text-primary">whole QA process</span>
              </h1>
              <p className="max-w-xl text-[16px] leading-relaxed text-muted-foreground">
                QA Engine takes you from the business requirements document to tested, tracked releases: AI finds the requirements, writes the
                test cases and drafts the bugs — your team reviews, runs and ships.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href={primary.href}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  {primary.label} <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#download"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                >
                  <Download className="h-4 w-4" /> Download the app
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
                {["Works in the browser", "Mac & Windows app", "Free AI on your computer"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <AppPreview />
          </div>
        </section>

        {/* ── The flow ── */}
        <section className="border-y border-border bg-[hsl(var(--sidebar))]">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <p className="mb-4 text-center text-[13px] text-muted-foreground">Everything connected, from the first document to the final report</p>
            <ol className="flex flex-wrap items-center justify-center gap-2">
              {FLOW.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium shadow-sm">
                    <s.icon className="h-3.5 w-3.5 text-primary" /> {s.label}
                  </span>
                  {i < FLOW.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl space-y-24 px-4 py-24 sm:px-6">
            <SectionTitle
              center
              kicker="Features"
              title="Everything a QA team needs"
              blurb="Plan, test, automate, track and collaborate — each part below is a page in the app, with the same name."
            />
            {FEATURE_GROUPS.map((g) => (
              <div key={g.id} id={g.id} className="scroll-mt-20 space-y-8">
                <SectionTitle kicker={g.label} title={g.title} blurb={g.blurb} />
                <div className={`grid gap-4 ${g.features.length === 1 ? "" : g.features.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                  {g.features.map((f) => (
                    <article key={f.name} className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <f.icon className="h-[18px] w-[18px]" />
                        </span>
                        <h3 className="text-[16px] font-semibold">{f.name}</h3>
                      </div>
                      <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">{f.summary}</p>
                      <ul className={`grid gap-2 ${g.features.length === 1 ? "sm:grid-cols-2" : ""}`}>
                        {f.points.map((p) => (
                          <li key={p} className="flex gap-2 text-[13px] text-foreground/90">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {p}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── AI ── */}
        <section id="ai" className="scroll-mt-16 border-y border-border bg-[hsl(var(--sidebar))]">
          <div className="mx-auto max-w-6xl space-y-12 px-4 py-24 sm:px-6">
            <SectionTitle
              kicker="AI"
              title="AI you can trust with your test plan"
              blurb="Helpful where it saves time, careful where mistakes cost you — and always reviewed by a person before it counts."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {AI_POINTS.map((p) => (
                <div key={p.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <p.icon className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="mb-1.5 text-[15px] font-semibold">{p.title}</h3>
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Languages className="h-4 w-4" /> Arabic and English documents
              </span>
              <span className="flex items-center gap-1.5">
                <Globe2 className="h-4 w-4" /> Ollama · Kimi · OpenAI · Anthropic · Gemini
              </span>
            </div>
          </div>
        </section>

        {/* ── Download ── */}
        <section id="download" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-24 sm:px-6">
            <SectionTitle
              kicker="Desktop app"
              title="QA Engine on your Mac or PC"
              blurb="Its own window and dock icon, stays signed in, updates itself with one click — and uses Ollama on your computer for free, private AI."
            />
            <DesktopDownloadCards />
            <div className="grid gap-4 text-[13px] text-muted-foreground sm:grid-cols-3">
              <p>
                <span className="font-medium text-foreground">1. Install.</span> Mac: open the file and drag QA Engine to Applications. Windows: run
                the setup.
              </p>
              <p>
                <span className="font-medium text-foreground">2. First launch.</span> Mac: System Settings → Privacy &amp; Security → Open Anyway.
                Windows: More info → Run anyway.
              </p>
              <p>
                <span className="font-medium text-foreground">3. Sign in.</span> Use the same account as the website. If Ollama is installed, the
                app finds it by itself.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
            <SectionTitle kicker="FAQ" title="Questions people ask" />
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final call ── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg sm:px-12">
            <h2 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">Start testing smarter today</h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] opacity-90">
              Create your account, upload your first BRD and get test cases in minutes.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              <Link
                href={primary.href}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[14px] font-medium text-primary shadow-sm transition-opacity hover:opacity-90"
              >
                {primary.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#download"
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
              >
                <Download className="h-4 w-4" /> Download the app
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-5">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-foreground">
                {n.label}
              </a>
            ))}
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} QA Engine</p>
        </div>
      </footer>
    </div>
  )
}
