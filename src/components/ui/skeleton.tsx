import { cn } from "@/lib/utils"

/** Loading placeholder shaped like the content it stands in for (SKILL.md B9: no spinners). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden {...props} />
}

/** A few text lines of placeholder, for lists and panels that are loading. */
function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-4/5", "w-3/5", "w-2/3", "w-1/2"]
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", widths[i % widths.length])} />
      ))}
    </div>
  )
}

/** Small pulsing dot for a button that is working (replaces a spinning icon). */
function BusyDot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-current", className)} aria-hidden />
}

export { Skeleton, SkeletonLines, BusyDot }
