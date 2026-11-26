"use client"

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { FileCheck } from "@/components/ui/icons"
import { CHART_COLORS } from "@/lib/reports/colors"

const STATUS_COLORS: Record<string, string> = {
  Passed: "#059669",
  Failed: "#dc2626",
  Blocked: "#d97706",
  Warning: "#d97706",
  Queued: "#94a3b8",
  Running: "#0891b2",
  Skipped: "#64748b",
  "Not run": "#94a3b8",
}

const LABEL: Record<string, string> = { NotExecuted: "Not run" }

/**
 * Latest result of each test case (TestCase.lastStatus), which counts manual
 * runs from Test Cases, automated runs and Automation Hub runs alike.
 * `byStatus` is null while the dashboard metrics are loading.
 */
export function TestsByStatusPie({ byStatus }: { byStatus: Record<string, number> | null }) {
  const loading = byStatus === null
  const data = Object.entries(byStatus ?? {})
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ name: LABEL[key] ?? key, value }))

  const total = data.reduce((a, d) => a + d.value, 0)

  return (
    <div className="p-4 border border-border shadow-sm rounded-xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground/60">Tests by Status</span>
        <FileCheck className="h-4 w-4 text-primary" />
      </div>
      <div className="h-48 w-full">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : total === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-300">No tests</div>
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
                  <Cell key={index} fill={STATUS_COLORS[entry.name] || CHART_COLORS.neutral} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", borderRadius: 10, border: `1px solid ${CHART_COLORS.border}`, fontSize: 11 }}
                formatter={(value: number, name: string) => [`${value} tests`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
