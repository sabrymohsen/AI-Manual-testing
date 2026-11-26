import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CaretDown, Check, X } from "@phosphor-icons/react/dist/ssr"
import { getSession } from "@/lib/auth"
import { AppPreview } from "@/components/landing/app-preview"
import { DesktopDownloadCards } from "@/components/auth/desktop-downloads"
import { AI_POINTS, BENEFITS, FAQ, NAV, PROBLEMS, STEPS, TRACKERS } from "@/components/landing/features"
import { Logo } from "@/components/landing/logo"
import { SiteNav } from "@/components/landing/site-nav"
import { RevealObserver, TaglineReveal } from "@/components/landing/motion"

/* Public website, built to SKILL.md: one audience (QA teams that test from
   requirement documents), one primary action (create an account), dark theme
   on the approved surfaces, Geist, Phosphor icons, named text styles. */

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: "QA Engine: test cases and bugs from your requirements document",
  description:
    "Upload a BRD in Arabic or English. QA Engine finds what needs testing, drafts the test cases and bugs, and syncs them with Jira, Azure DevOps, OpenProject or ClickUp.",
  openGraph: {
    title: "QA Engine",
    description: "From the requirements document to a tested, tracked release.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "QA Engine", description: "From the requirements document to a tested, tracked release." },
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
const EASE = "duration-300 ease-out-soft"

function PrimaryCta({ href, label, large }: { href: string; label: string; large?: boolean }) {
  return (
    <Link
      href={href}
      className={`${large ? "button-md px-4 py-3" : "button-md px-3 py-2"} inline-flex items-center gap-2 rounded-xl bg-white text-black transition-[transform,opacity] ${EASE} hover:opacity-90 active:scale-[0.98] ${FOCUS}`}
    >
      {label} <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  )
}

function SectionHead({ kicker, title, text, center }: { kicker: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={`max-w-[680px] space-y-4 ${center ? "mx-auto text-center" : ""}`}>
      <p className="caption-1 text-white/50">{kicker}</p>
      <h2 className="heading-3 text-white max-sm:text-3xl">{title}</h2>
      {text && <p className="body-3 text-white/60">{text}</p>}
    </div>
  )
}

export default async function Home() {
  const session = await getSession()
  const primary = session ? { href: "/dashboard", label: "Open the app" } : { href: "/register", label: "Create a free account" }

  return (
    <div className="min-h-screen bg-black font-sans text-white antialiased">
      <a
        href="#main"
        className="button-sm fixed left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-white px-3 py-2 text-black transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <noscript>
        <style>{`.reveal{opacity:1!important;transform:none!important}.tagline-word{color:#fff!important}`}</style>
      </noscript>
      <RevealObserver />
      <SiteNav primary={primary} signedIn={!!session} />

      <main id="main">
        {/* ── Hero ── */}
        <section className="px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
          <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <p className="caption-1 mb-6 rounded-lg border border-white/10 bg-[#181818] px-3 py-1 text-white/60">
              For QA teams that test from requirement documents
            </p>
            <h1 className="heading-1 hero-gradient-dark max-w-[680px] pb-2 max-sm:text-5xl">
              Test cases and bugs, <br className="max-sm:hidden" />
              straight from your BRD
            </h1>
            <p className="body-3 mt-6 max-w-[680px] text-white/60 sm:text-lg">
              Upload a BRD in Arabic or English. QA Engine finds what needs testing, drafts the test cases and the bugs, and your team
              reviews, runs and ships.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <PrimaryCta href={primary.href} label={primary.label} large />
              <p className="caption-2 text-white/50">Free account. Works in the browser, on Mac and on Windows.</p>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <span className="caption-2 text-white/40">Syncs with</span>
              {TRACKERS.map((t) => (
                <span key={t} className="title-4 text-white/70">
                  {t}
                </span>
              ))}
            </div>
            <div className="reveal mt-16 w-full">
              <AppPreview />
            </div>
          </div>
        </section>

        {/* ── Problem → solution ── */}
        <section id="product" className="scroll-mt-24 border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="reveal mx-auto max-w-6xl space-y-12">
            <SectionHead
              kicker="Why teams switch"
              title="Testing from a BRD should not mean copying it by hand"
              text="The same information usually gets rewritten in three places: the document, the test sheet and the tracker. QA Engine keeps it in one."
            />
            <div className="grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((p) => (
                <article key={p.before} className="rounded-2xl border border-white/10 bg-[#181818] p-6">
                  <p className="body-6 flex gap-3 text-white/50">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden /> {p.before}
                  </p>
                  <div className="my-4 h-px bg-white/10" />
                  <p className="body-5 flex gap-3 text-white">
                    <Check weight="bold" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> {p.after}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tagline reveal ── */}
        <section className="px-4 py-24 sm:px-6 sm:py-32">
          <TaglineReveal lines={["Every requirement gets a test.", "Every failed test gets a bug", "your developers can act on."]} />
        </section>

        {/* ── Benefits ── */}
        <section className="border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl space-y-16">
            <div className="reveal">
              <SectionHead
                kicker="What you get"
                title="One workspace for the whole QA process"
                text="Each part below is a page in the app, with the same name you will see in the sidebar."
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {BENEFITS.map((b, i) => (
                <article
                  key={b.id}
                  id={b.id}
                  className={`reveal flex flex-col gap-6 rounded-2xl border border-white/10 bg-[#181818] p-6 sm:p-8 ${i === 0 ? "lg:col-span-2" : ""}`}
                >
                  <div className="space-y-3">
                    <p className="caption-3 text-white/40">{b.label}</p>
                    <h3 className="heading-5 text-white">{b.title}</h3>
                    <p className="body-6 max-w-[680px] text-white/60">{b.text}</p>
                  </div>
                  <ul className={`grid gap-3 ${i === 0 ? "md:grid-cols-3" : ""}`}>
                    {b.points.map((p) => (
                      <li key={p} className="body-6 flex gap-3 text-white/80">
                        <Check weight="bold" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {b.pages.map((pg) => (
                      <span key={pg.name} className="caption-4 inline-flex items-center gap-2 rounded-lg bg-[#272727] px-3 py-2 text-white/80">
                        <pg.icon className="h-4 w-4" aria-hidden /> {pg.name}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="scroll-mt-24 border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl space-y-12">
            <div className="reveal">
              <SectionHead kicker="How it works" title="Three steps from document to bug report" center />
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="reveal rounded-2xl border border-white/10 bg-[#181818] p-6">
                  <div className="mb-6 flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#272727] text-white">
                      <s.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="caption-3 font-mono text-white/30">0{i + 1}</span>
                  </div>
                  <h3 className="title-2 mb-2 text-white">{s.title}</h3>
                  <p className="body-6 text-white/60">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── AI ── */}
        <section id="ai" className="scroll-mt-24 border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
            <div className="reveal">
              <SectionHead
                kicker="AI"
                title="AI you can trust with your test plan"
                text="It saves time where it helps and stays careful where mistakes cost you. A person reviews everything before it counts."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {AI_POINTS.map((p) => (
                <div key={p.title} className="reveal rounded-2xl border border-white/10 bg-[#181818] p-6">
                  <p.icon className="mb-4 h-6 w-6 text-white" aria-hidden />
                  <h3 className="title-3 mb-2 text-white">{p.title}</h3>
                  <p className="body-6 text-white/60">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Desktop app ── */}
        <section id="download" className="scroll-mt-24 border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="reveal mx-auto max-w-6xl space-y-12">
            <SectionHead
              kicker="Desktop app"
              title="QA Engine on your Mac or PC"
              text="Its own window and dock icon. It stays signed in, updates in one click, and runs free, private AI with Ollama on your computer."
            />
            <DesktopDownloadCards />
            <ol className="grid gap-6 sm:grid-cols-3">
              {[
                ["Install", "On Mac, open the file and drag QA Engine to Applications. On Windows, run the setup."],
                ["Open it the first time", "On Mac, open System Settings, Privacy and Security, then Open Anyway. On Windows, click More info, then Run anyway."],
                ["Sign in", "Use the same account as the website. If Ollama is installed, the app finds it by itself."],
              ].map(([t, d], i) => (
                <li key={t} className="space-y-2">
                  <p className="title-4 text-white">
                    {i + 1}. {t}
                  </p>
                  <p className="body-6 text-white/60">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-24 border-t border-white/10 px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div className="reveal">
              <SectionHead kicker="FAQ" title="Questions people ask" />
            </div>
            <div className="reveal divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#181818]">
              {FAQ.map((f) => (
                <details key={f.q} className="group [&_summary::-webkit-details-marker]:hidden">
                  <summary
                    className={`title-4 flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-4 text-white transition-colors ${EASE} hover:bg-white/5 ${FOCUS}`}
                  >
                    {f.q}
                    <CaretDown
                      className="h-4 w-4 shrink-0 text-white/50 transition-transform duration-500 ease-out-soft group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="body-6 px-6 pb-4 text-white/60">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Risk reversal + final CTA (same action as the hero) ── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="reveal mx-auto max-w-6xl rounded-2xl border border-white/10 bg-[#181818] px-6 py-16 text-center sm:px-12">
            <h2 className="heading-3 mx-auto max-w-[680px] text-white max-sm:text-3xl">Upload your first BRD today</h2>
            <p className="body-3 mx-auto mt-4 max-w-[680px] text-white/60">
              Create a free account and get your first test cases in minutes. No install needed, and the AI can run for free on your own computer.
            </p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta href={primary.href} label={primary.label} large />
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
              {["Free account", "Works in the browser", "Nothing saved without your review"].map((t) => (
                <li key={t} className="caption-2 flex items-center gap-2 text-white/60">
                  <Check weight="bold" className="h-4 w-4 text-emerald-400" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`caption-2 rounded-md text-white/50 transition-colors ${EASE} hover:text-white ${FOCUS}`}>
                {n.label}
              </a>
            ))}
            {!session && (
              <Link href="/login" className={`caption-2 rounded-md text-white/50 transition-colors ${EASE} hover:text-white ${FOCUS}`}>
                Sign in
              </Link>
            )}
          </nav>
          <p className="caption-5 text-white/40">© {new Date().getFullYear()} QA Engine</p>
        </div>
      </footer>
    </div>
  )
}
