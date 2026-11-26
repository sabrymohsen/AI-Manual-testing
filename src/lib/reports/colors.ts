// Shared design tokens for the analytics dashboard (charts, badges, KPI accents).

export const CHART_COLORS = {
  primary: "#4f46e5", // indigo-600
  success: "#059669", // emerald-600
  danger: "#dc2626", // red-600
  warning: "#d97706", // amber-600
  info: "#0891b2", // cyan-600
  neutral: "#64748b", // slate-500
  // CSS variables so charts follow the light/dark theme.
  background: "hsl(var(--muted))",
  card: "hsl(var(--card))",
  border: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground) / 0.35)",
} as const

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#d97706",
  Low: "#059669",
}

export const STATUS_COLORS: Record<string, string> = {
  Passed: "#059669",
  Failed: "#dc2626",
  Blocked: "#d97706",
  Warning: "#d97706",
  Pending: "#94a3b8",
  Queued: "#94a3b8",
  Running: "#0891b2",
  // bug statuses
  Open: "#dc2626",
  InProgress: "#d97706",
  ReadyForRetest: "#0891b2",
  Reopened: "#ea580c",
  Resolved: "#059669",
  Closed: "#64748b",
  Rejected: "#64748b",
  Duplicate: "#94a3b8",
  // requirement statuses
  Draft: "#94a3b8",
  ReadyForTesting: "#0891b2",
  InTesting: "#d97706",
  Covered: "#059669",
  PartiallyCovered: "#d97706",
  Deprecated: "#64748b",
}

// Distinct series palette (team members, grouped bars, etc.).
export const PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0d9488",
]

/** KPI card accent classes keyed by a short color name. */
export const KPI_ACCENTS: Record<string, { iconBg: string; iconText: string; spark: string }> = {
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", spark: "#059669" },
  blue: { iconBg: "bg-blue-50", iconText: "text-blue-600", spark: "#2563eb" },
  rose: { iconBg: "bg-rose-50", iconText: "text-rose-600", spark: "#e11d48" },
  violet: { iconBg: "bg-violet-50", iconText: "text-violet-600", spark: "#7c3aed" },
  amber: { iconBg: "bg-amber-50", iconText: "text-amber-600", spark: "#d97706" },
  slate: { iconBg: "bg-slate-100", iconText: "text-slate-600", spark: "#64748b" },
}
