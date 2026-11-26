"use client"

import { memo } from "react"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { ArrowUp, ArrowDown, Minus, type LucideIcon } from "@/components/ui/icons"
import { KPI_ACCENTS } from "@/lib/reports/colors"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { CountUp } from "@/components/ui/count-up"

/** Count up the leading number of a value like "13 pts" or "42%"; leave "14 / 14" as is. */
function AnimatedValue({ value }: { value: string }) {
  const m = /^(\d+)([^\d/]*)$/.exec(value.replace(/,/g, ""))
  if (!m) return <>{value}</>
  return (
    <>
      <CountUp value={Number(m[1])} />
      {m[2]}
    </>
  )
}

/** A change of zero ("+0", "+0%", "0/0") says nothing, so no badge is shown. */
const isNoChange = (c: string) => /^[+-]?0%?$/.test(c.trim()) || /^0\s*\/\s*0$/.test(c.trim())

export interface KPICardData {
  key: string
  label: string
  value: string
  change: string
  trend: "up" | "down" | "neutral"
  icon: LucideIcon
  color: keyof typeof KPI_ACCENTS
  sparkline: number[]
  progress?: number // 0..100, renders a ring instead of a sparkline
  targetId?: string // scrolls & highlights this element on click
  goodDirection?: "up" | "down" // which trend is "good" (colors the badge)
}

function scrollToTarget(id?: string) {
  if (!id) return
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.classList.add("ring-2", "ring-primary", "ring-offset-2")
  setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 1600)
}

const KPICard = memo(function KPICard({ data }: { data: KPICardData }) {
  const accent = KPI_ACCENTS[data.color]
  const Icon = data.icon
  const good = data.goodDirection ?? "up"
  // Badge color: green when the trend matches the good direction, red when opposite.
  const badgeGood = data.trend === "neutral" ? "neutral" : data.trend === good ? "good" : "bad"
  const badgeCls =
    badgeGood === "good"
      ? "bg-emerald-50 text-emerald-700"
      : badgeGood === "bad"
        ? "bg-rose-50 text-rose-700"
        : "bg-muted text-muted-foreground"
  const TrendIcon = data.trend === "up" ? ArrowUp : data.trend === "down" ? ArrowDown : Minus

  const spark = data.sparkline.map((v, i) => ({ i, v }))

  return (
    <button
      onClick={() => scrollToTarget(data.targetId)}
      aria-label={`${data.label}: ${data.value}, ${data.change}`}
      className="hover-lift group flex flex-col rounded-2xl border border-border bg-card p-6 text-left shadow-sm hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 ease-out-soft group-hover:scale-110", accent.iconBg)}>
          <Icon className={cn("h-5 w-5", accent.iconText)} />
        </div>
        {!isNoChange(data.change) && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", badgeCls)}>
            {data.trend !== "neutral" && <TrendIcon className="h-3 w-3" aria-hidden />}
            {data.change}
          </span>
        )}
      </div>

      <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedValue value={data.value} />
      </div>
      <div className="caption-4 mt-1 text-muted-foreground">{data.label}</div>

      <div className="mt-2 h-6">
        {data.progress != null ? (
          <ProgressRing value={data.progress} color={accent.spark} />
        ) : data.sparkline.length > 1 ? (
          <ResponsiveContainer width="100%" height={24}>
            <LineChart data={spark} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
              <Line type="monotone" dataKey="v" stroke={accent.spark} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </button>
  )
})

function ProgressRing({ value, color }: { value: number; color: string }) {
  const r = 9
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, value)) / 100)
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="text-xs font-semibold text-muted-foreground">{Math.round(value)}%</span>
    </div>
  )
}

export function KPICards({ cards, loading }: { cards: KPICardData[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <KPICard key={c.key} data={c} />
      ))}
    </div>
  )
}
