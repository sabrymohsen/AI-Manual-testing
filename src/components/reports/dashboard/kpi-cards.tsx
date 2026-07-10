"use client"

import { memo } from "react"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { ArrowUp, ArrowDown, Minus, type LucideIcon } from "lucide-react"
import { KPI_ACCENTS } from "@/lib/reports/colors"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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
  el.classList.add("ring-2", "ring-indigo-400", "ring-offset-2")
  setTimeout(() => el.classList.remove("ring-2", "ring-indigo-400", "ring-offset-2"), 1600)
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
        : "bg-slate-100 text-slate-600"
  const TrendIcon = data.trend === "up" ? ArrowUp : data.trend === "down" ? ArrowDown : Minus

  const spark = data.sparkline.map((v, i) => ({ i, v }))

  return (
    <button
      onClick={() => scrollToTarget(data.targetId)}
      aria-label={`${data.label}: ${data.value}, ${data.change}`}
      className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", accent.iconBg)}>
          <Icon className={cn("h-5 w-5", accent.iconText)} />
        </div>
        <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", badgeCls)}>
          <TrendIcon className="h-3 w-3" />
          {data.change}
        </span>
      </div>

      <div className="mt-3 text-2xl font-bold text-slate-900">{data.value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{data.label}</div>

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
        <circle cx="12" cy="12" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="text-[11px] font-semibold text-slate-500">{Math.round(value)}%</span>
    </div>
  )
}

export function KPICards({ cards, loading }: { cards: KPICardData[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <KPICard key={c.key} data={c} />
      ))}
    </div>
  )
}
