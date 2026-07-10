"use client"

/**
 * Reusable report chart primitives (recharts for data charts + inline SVG for the
 * funnel / defect-lifecycle "flow" diagrams). Kept presentational and fixed-size
 * so they capture cleanly for PDF/Word export via html2canvas.
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts"
import type { CountBucket, TrendPoint } from "@/lib/reports/types"

// Brand-neutral, print-safe palette.
export const PALETTE = ["#4f46e5", "#059669", "#dc2626", "#d97706", "#0891b2", "#7c3aed", "#db2777", "#65a30d"]
const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#059669",
}
const STATUS_COLORS: Record<string, string> = {
  Open: "#dc2626", Reopened: "#dc2626", InProgress: "#d97706", ReadyForRetest: "#0891b2",
  Resolved: "#059669", Closed: "#64748b", Rejected: "#94a3b8", Duplicate: "#94a3b8",
  Passed: "#059669", Failed: "#dc2626", Blocked: "#d97706", Warning: "#d97706",
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white break-inside-avoid">
      <h3 className="text-xs font-extrabold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

export function StatTiles({ tiles }: { tiles: Array<{ label: string; value: string | number; tone?: string }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((t, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-3 bg-white">
          <div className="text-[9px] uppercase font-extrabold text-slate-400">{t.label}</div>
          <div className={`text-xl font-extrabold ${t.tone || "text-slate-800"}`}>{t.value}</div>
        </div>
      ))}
    </div>
  )
}

export function TrendLine({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <EmptyChart />
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="passRate" name="Pass rate" stroke="#4f46e5" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BucketBar({ data, colorBy }: { data: CountBucket[]; colorBy?: "severity" | "status" }) {
  if (!data.length) return <EmptyChart />
  return (
    <div style={{ width: "100%", height: Math.max(180, data.length * 34) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={90} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={
                colorBy === "severity" ? (SEVERITY_COLORS[d.label] || PALETTE[i % PALETTE.length])
                  : colorBy === "status" ? (STATUS_COLORS[d.label] || PALETTE[i % PALETTE.length])
                    : PALETTE[i % PALETTE.length]
              } />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StatusPie({ data, colorBy }: { data: CountBucket[]; colorBy?: "status" | "severity" }) {
  const filtered = data.filter((d) => d.value > 0)
  if (!filtered.length) return <EmptyChart />
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={78} label={{ fontSize: 10 }}>
            {filtered.map((d, i) => (
              <Cell key={i} fill={
                colorBy === "severity" ? (SEVERITY_COLORS[d.label] || PALETTE[i % PALETTE.length])
                  : (STATUS_COLORS[d.label] || PALETTE[i % PALETTE.length])
              } />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CoverageDonut({ covered, uncovered }: { covered: number; uncovered: number }) {
  const data = [{ label: "Covered", value: covered }, { label: "Uncovered", value: uncovered }]
  const total = covered + uncovered
  if (total === 0) return <EmptyChart />
  return (
    <div style={{ width: "100%", height: 220 }} className="relative">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={80}>
            <Cell fill="#059669" />
            <Cell fill="#e2e8f0" />
          </Pie>
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ height: 220 }}>
        <span className="text-lg font-extrabold text-slate-800">{Math.round((covered / total) * 100)}%</span>
      </div>
    </div>
  )
}

/** Test-execution funnel: Total → Executed → Passed. */
export function ExecutionFunnel({ total, executed, passed }: { total: number; executed: number; passed: number }) {
  const stages = [
    { label: "Total cases", value: total, color: "#4f46e5" },
    { label: "Executed", value: executed, color: "#0891b2" },
    { label: "Passed", value: passed, color: "#059669" },
  ]
  const max = Math.max(total, 1)
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100)
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-[10px] font-bold text-slate-500 text-right shrink-0">{s.label}</div>
            <div className="flex-1 bg-slate-100 rounded h-7 overflow-hidden">
              <div className="h-full flex items-center justify-end pr-2 text-[10px] font-extrabold text-white"
                style={{ width: `${Math.max(pct, 6)}%`, background: s.color }}>
                {s.value}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Defect lifecycle flow: Open → In Progress → Fixed → Closed. */
export function DefectLifecycleFlow({ open, inProgress, fixed, closed }: { open: number; inProgress: number; fixed: number; closed: number }) {
  const stages = [
    { label: "Open", value: open, color: "#dc2626" },
    { label: "In Progress", value: inProgress, color: "#d97706" },
    { label: "Fixed", value: fixed, color: "#059669" },
    { label: "Closed", value: closed, color: "#64748b" },
  ]
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="rounded-lg px-3 py-3 text-center min-w-[74px]" style={{ background: `${s.color}14`, border: `1px solid ${s.color}55` }}>
            <div className="text-lg font-extrabold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[9px] font-bold text-slate-500">{s.label}</div>
          </div>
          {i < stages.length - 1 && <span className="text-slate-300 text-lg">→</span>}
        </div>
      ))}
    </div>
  )
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((c, i) => <th key={i} className="text-left py-1.5 px-2 font-extrabold text-slate-500 uppercase text-[9px]">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="py-4 text-center text-slate-400 italic">No data</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              {r.map((cell, j) => <td key={j} className="py-1.5 px-2 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyChart() {
  return <div className="h-[180px] flex items-center justify-center text-slate-400 italic text-xs">No data in range</div>
}
