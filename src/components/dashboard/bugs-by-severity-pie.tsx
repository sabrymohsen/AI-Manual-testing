"use client"

import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Bug } from "@/components/ui/icons"
import { CHART_COLORS } from "@/lib/reports/colors"

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#d97706",
  Low: "#059669",
}

export function BugsBySeverityPie({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ name: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    fetch(`/api/projects/${projectId}/bug-reports?limit=500`)
      .then((r) => (r.ok ? r.json() : { bugReports: [] }))
      .then((d) => {
        const bugs = d.bugReports || []
        const counts: Record<string, number> = {}
        for (const b of bugs) {
          const sev = b.severity || "Unknown"
          counts[sev] = (counts[sev] || 0) + 1
        }
        setData(
          Object.entries(counts).map(([name, value]) => ({
            name,
            value,
          }))
        )
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [projectId])

  const total = data.reduce((a, d) => a + d.value, 0)

  return (
    <div className="p-4 border border-border shadow-sm rounded-xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground/60">Bugs by Severity</span>
        <Bug className="h-4 w-4 text-rose-500" />
      </div>
      <div className="h-48 w-full">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : total === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-300">No bugs</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={3}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={SEVERITY_COLORS[entry.name] || CHART_COLORS.neutral} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", borderRadius: 10, border: `1px solid ${CHART_COLORS.border}`, fontSize: 11 }}
                formatter={(value: number, name: string) => [`${value} bugs`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
