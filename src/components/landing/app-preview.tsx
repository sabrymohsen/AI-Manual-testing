import { Bug, CheckCircle2, FileSpreadsheet, FileText, FlaskConical, KanbanSquare, Loader2, Sparkles, XCircle } from "lucide-react"

/**
 * A drawn (HTML, not a screenshot) preview of the app for the website hero:
 * a requirement from a BRD, its generated test cases with results, and the
 * background-AI tray — the product's core loop in one picture.
 */
export function AppPreview() {
  const nav = [
    { icon: KanbanSquare, label: "Scrum Board" },
    { icon: FileText, label: "Test Cases" },
    { icon: FileSpreadsheet, label: "BRD Hub", active: true },
    { icon: FlaskConical, label: "Live QA Session" },
    { icon: Bug, label: "Bug Reports" },
  ]
  const tests = [
    { title: "Accepts a valid national ID and fills the form", ok: true },
    { title: "Rejects an ID with fewer than 10 digits", ok: true },
    { title: "Shows an error when the ID service is down", ok: false },
  ]
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-primary/20 via-violet-400/10 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/10">
        {/* window bar */}
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ms-3 text-[11px] text-muted-foreground">QA Engine</span>
        </div>
        <div className="grid grid-cols-[150px_1fr] text-[12px] max-sm:grid-cols-1">
          {/* sidebar */}
          <div className="space-y-0.5 border-e border-border bg-[hsl(var(--sidebar))] p-2 max-sm:hidden">
            {nav.map((n) => (
              <div
                key={n.label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${n.active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <n.icon className="h-3.5 w-3.5" /> {n.label}
              </div>
            ))}
          </div>
          {/* content */}
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="shrink-0 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">US-1.01</span>
              <span className="truncate font-semibold text-foreground">Request emergency housing</span>
              <span className="ms-auto shrink-0 whitespace-nowrap rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 max-sm:hidden dark:text-emerald-400">
                On board · HSG-12
              </span>
            </div>
            <p className="rounded-md border-s-2 border-primary/40 bg-muted/50 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
              “As a case worker, I want to submit an emergency housing request so the family gets housing right away.”
            </p>
            <div className="space-y-1.5">
              {tests.map((t) => (
                <div key={t.title} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  {t.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                  <span className="truncate text-foreground">{t.title}</span>
                  {!t.ok && <span className="ms-auto shrink-0 rounded bg-rose-500/10 px-1.5 text-[10px] text-rose-600">BUG-112</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* background AI tray */}
      <div className="absolute -bottom-14 end-6 w-64 rounded-lg border border-border bg-card p-2.5 text-[11.5px] shadow-lg max-sm:hidden">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-violet-500" /> AI is working
        </p>
        <p className="flex items-center gap-1.5 text-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" /> Generating 3 test cases for FR-04
        </p>
      </div>
    </div>
  )
}
