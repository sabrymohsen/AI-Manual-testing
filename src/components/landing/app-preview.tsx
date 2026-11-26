import { Bug, CheckCircle, FileText, Kanban, ListChecks, Sparkle, TestTube, XCircle } from "@phosphor-icons/react/dist/ssr"

/**
 * A drawn (HTML, not a screenshot) picture of the app for the website hero:
 * a user story from a BRD, its generated test cases with results, and the
 * background AI tray. The product's core loop in one picture.
 */
export function AppPreview() {
  const nav = [
    { icon: Kanban, label: "Scrum Board" },
    { icon: ListChecks, label: "Test Cases" },
    { icon: FileText, label: "BRD Hub", active: true },
    { icon: TestTube, label: "Live QA Session" },
    { icon: Bug, label: "Bug Reports" },
  ]
  const tests = [
    { title: "Accepts a valid national ID and fills the form", ok: true },
    { title: "Rejects an ID with fewer than 10 digits", ok: true },
    { title: "Shows an error when the ID service is down", ok: false },
  ]
  return (
    <div className="relative mx-auto w-full max-w-4xl" aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#181818]">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#1F1F1F] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-white/20" />
          <span className="h-3 w-3 rounded-full bg-white/20" />
          <span className="h-3 w-3 rounded-full bg-white/20" />
          <span className="caption-5 ms-3 text-white/50">QA Engine</span>
        </div>
        <div className="grid grid-cols-[176px_1fr] max-sm:grid-cols-1">
          {/* sidebar */}
          <div className="space-y-1 border-e border-white/10 p-2 max-sm:hidden">
            {nav.map((n) => (
              <div
                key={n.label}
                className={`caption-4 flex items-center gap-2 rounded-lg px-2 py-2 ${n.active ? "bg-white/10 text-white" : "text-white/50"}`}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </div>
            ))}
          </div>
          {/* content */}
          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="caption-3 shrink-0 rounded-md bg-primary/20 px-2 py-0.5 text-[hsl(235_80%_80%)]">US 1.01</span>
              <span className="title-4 truncate text-white">Request emergency housing</span>
              <span className="caption-4 ms-auto shrink-0 rounded-md bg-emerald-400/10 px-2 py-0.5 text-emerald-300 max-sm:hidden">On board · HSG 12</span>
            </div>
            <p className="caption-2 rounded-lg border border-white/10 bg-[#1F1F1F] px-3 py-2 text-white/60">
              “As a case worker, I want to submit an emergency housing request so the family gets housing right away.”
            </p>
            <div className="space-y-2">
              {tests.map((t) => (
                <div key={t.title} className="caption-2 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
                  {t.ok ? (
                    <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle weight="fill" className="h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <span className="truncate text-white/90">{t.title}</span>
                  {!t.ok && <span className="caption-3 ms-auto shrink-0 rounded-md bg-rose-400/10 px-2 text-rose-300">BUG 112</span>}
                </div>
              ))}
            </div>
            {/* background AI tray */}
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#272727] px-3 py-2">
              <Sparkle weight="fill" className="h-4 w-4 shrink-0 text-violet-300" />
              <span className="caption-2 text-white/80">AI is writing 3 test cases for FR 04</span>
              <span className="ms-auto flex gap-1">
                <span className="h-1 w-4 animate-pulse rounded-full bg-white/40" />
                <span className="h-1 w-4 animate-pulse rounded-full bg-white/20 [animation-delay:150ms]" />
                <span className="h-1 w-4 animate-pulse rounded-full bg-white/10 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
