import { Terminal, Zap } from "lucide-react"

/** QA Engine brand mark used on the public pages (landing + auth). */
export function BrandMark({ size = "base" }: { size?: "base" | "sm" }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-white ${size === "sm" ? "text-sm" : "text-base"}`}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-500/30">
        <Zap className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} fill="currentColor" />
      </span>
      QA&nbsp;<span className="text-violet-400">Engine</span>
    </span>
  )
}

/** Console window showing a live QA session log — the hero motif of the public pages. */
export function TerminalMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0A0E1F] shadow-[0_8px_24px_rgba(0,0,0,0.08)] shadow-violet-950/50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-3 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground font-mono">
          <Terminal className="h-3 w-3" /> qa-os — live-session
        </span>
      </div>
      <div className={`font-mono text-[12px] leading-relaxed ${compact ? "p-4" : "p-5"} space-y-1.5`}>
        <p className="text-muted-foreground">$ <span className="text-slate-300">qa-os session start --project checkout --live</span></p>
        <p className="text-violet-400">▸ Launching embedded browser (CDP stream attached)</p>
        <p className="text-muted-foreground">▸ Recording session video… <span className="text-rose-400">● REC</span></p>
        <p className="text-emerald-400">✓ Step 1 · Open /checkout <span className="text-muted-foreground">— 1.2s</span></p>
        <p className="text-emerald-400">✓ Step 2 · Add item to cart <span className="text-muted-foreground">— 0.8s</span></p>
        <p className="text-rose-400">✗ Step 3 · Apply coupon &quot;SAVE10&quot; <span className="text-muted-foreground">— assertion failed</span></p>
        <p className="text-amber-400">▸ Bug drafted → BUG-112 &quot;Coupon not applied to total&quot;</p>
        {!compact && (
          <>
            <p className="text-muted-foreground">▸ Syncing BUG-112 to your tracker… <span className="text-emerald-400">work package #4821 ✓</span></p>
            <p className="text-muted-foreground">$ <span className="inline-block w-2 h-4 bg-violet-400 align-middle animate-pulse" /></p>
          </>
        )}
      </div>
    </div>
  )
}
