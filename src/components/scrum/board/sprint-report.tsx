"use client"

/**
 * Sprint report panel on the board: burndown (remaining work per day against
 * the ideal line) and velocity of recent sprints. The numbers come from the
 * same functions as the Reports page, built from each task's status history.
 */
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, } from "@/components/ui/icons"
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ReportData {
  burndown: {
    sprint: { id: string; name: string; startDate: string | null; endDate: string | null }
    totalPoints: number
    unit?: "points" | "issues"
    points: { label: string; date: string; ideal: number; actual: number | null }[]
  }
  velocity: { sprints: { sprintId: string; name: string; committed: number; completed: number }[]; averageVelocity: number }
}

export function SprintReportDialog({ projectId, sprintId, open, onOpenChange }: { projectId: string; sprintId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scrum", projectId, "sprint-report", sprintId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/scrum/sprints/${sprintId}/report`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Couldn't load the sprint report")
      return body as ReportData
    },
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  })

  const unit = data?.burndown.unit === "issues" ? "issues" : "pts"
  const today = new Date().toISOString().slice(0, 10)
  const todayPoint = data?.burndown.points.filter((p) => p.actual !== null).pop()
  const remaining = todayPoint?.actual ?? data?.burndown.totalPoints ?? 0
  const idealNow = data?.burndown.points.find((p) => p.date === today)?.ideal
  const daysLeft = data?.burndown.sprint.endDate
    ? Math.max(0, Math.ceil((new Date(data.burndown.sprint.endDate).getTime() - Date.now()) / 86_400_000))
    : null
  const behind = idealNow !== undefined && remaining > idealNow
  const velocityRows = (data?.velocity.sprints ?? []).slice(-6)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> {data?.burndown.sprint.name ?? "Sprint"} report
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-6"><Skeleton className="h-24 w-full" /><SkeletonLines lines={3} /></div>
        ) : error ? (
          <p className="py-8 text-sm text-destructive">{(error as Error).message}</p>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Committed" value={`${data.burndown.totalPoints} ${unit}`} />
              <Stat label="Remaining" value={`${remaining} ${unit}`} tone={behind ? "warn" : undefined} hint={idealNow !== undefined ? `ideal today: ${idealNow}` : undefined} />
              <Stat label="Days left" value={daysLeft === null ? "—" : String(daysLeft)} />
              <Stat label="Avg velocity" value={data.velocity.averageVelocity ? `${data.velocity.averageVelocity} pts` : "—"} hint={data.velocity.averageVelocity ? "last 3 finished sprints" : "after the first finished sprint"} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Burndown</h3>
              {data.burndown.totalPoints === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in this sprint yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.burndown.points} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, n: string) => [`${v} ${unit}`, n]} labelFormatter={(d: string) => d} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="linear" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeDasharray="5 4" dot={false} />
                      <Line type="stepAfter" dataKey="actual" name="Remaining" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.burndown.unit === "issues" && (
                <p className="mt-1 text-xs text-muted-foreground">No issue in this sprint has story points, so the chart counts issues.</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Velocity</h3>
              {velocityRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Velocity appears once a sprint has been started.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={velocityRows} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="committed" name="Committed" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="completed" name="Completed" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${tone === "warn" ? "text-amber-600" : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
