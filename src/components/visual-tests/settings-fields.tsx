"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Monitor, Smartphone, Tablet } from "lucide-react"
import { ModuleSelect } from "@/components/bug-reports/module-select"
import { ENVIRONMENT_PRESETS, environmentKey, type VisualBrowser, type VisualEnvironment } from "@/lib/visual-tests/environments"
import { MATCH_LEVEL_META } from "./shared"

export interface VisualSettings {
  environments: VisualEnvironment[]
  matchLevel: "Strict" | "Dynamic" | "IgnoreColors"
  captureType: "FullPage" | "Viewport"
  waitBeforeCaptureMs: number
  beforeCaptureScript: string
  suiteId: string
  credentialId: string
  autoMaintenance: boolean
}

export const DEFAULT_SETTINGS: VisualSettings = {
  environments: [ENVIRONMENT_PRESETS[0]],
  matchLevel: "Strict",
  captureType: "FullPage",
  waitBeforeCaptureMs: 0,
  beforeCaptureScript: "",
  suiteId: "",
  credentialId: "",
  autoMaintenance: true,
}

function EnvIcon({ env }: { env: VisualEnvironment }) {
  if (env.width <= 480) return <Smartphone className="h-4 w-4" />
  if (env.width <= 1024) return <Tablet className="h-4 w-4" />
  return <Monitor className="h-4 w-4" />
}

export function EnvironmentPicker({ value, onChange }: { value: VisualEnvironment[]; onChange: (_v: VisualEnvironment[]) => void }) {
  const [custom, setCustom] = useState<{ browser: VisualBrowser; width: string; height: string }>({ browser: "chromium", width: "1920", height: "1080" })
  const selected = new Set(value.map(v => v.key))
  const customs = value.filter(v => !ENVIRONMENT_PRESETS.some(p => p.key === v.key))

  const toggle = (env: VisualEnvironment) =>
    onChange(selected.has(env.key) ? value.filter(v => v.key !== env.key) : [...value, env])

  const addCustom = () => {
    const width = parseInt(custom.width, 10)
    const height = parseInt(custom.height, 10)
    if (!(width >= 240 && width <= 3840 && height >= 240 && height <= 4320)) return
    const env: VisualEnvironment = {
      key: environmentKey({ browser: custom.browser, width, height }),
      name: `${custom.browser === "chromium" ? "Chrome" : custom.browser === "firefox" ? "Firefox" : "Safari (WebKit)"} · ${width}×${height}`,
      browser: custom.browser,
      width,
      height,
      device: null,
    }
    if (!selected.has(env.key)) onChange([...value, env])
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {[...ENVIRONMENT_PRESETS, ...customs].map(env => (
          <label
            key={env.key}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${selected.has(env.key) ? "border-indigo-400 bg-indigo-50/60" : "hover:bg-slate-50"}`}
          >
            <input type="checkbox" checked={selected.has(env.key)} onChange={() => toggle(env)} className="h-4 w-4 accent-indigo-600" />
            <span className="text-slate-500"><EnvIcon env={env} /></span>
            <span className="flex-1">
              <span className="font-medium text-slate-800">{env.name}</span>
              <span className="ml-2 text-xs text-slate-500">{env.width}×{env.height}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Another size:</span>
        <select value={custom.browser} onChange={e => setCustom(c => ({ ...c, browser: e.target.value as VisualBrowser }))} className="h-8 rounded-md border bg-white px-2">
          <option value="chromium">Chrome</option>
          <option value="firefox">Firefox</option>
          <option value="webkit">Safari (WebKit)</option>
        </select>
        <input value={custom.width} onChange={e => setCustom(c => ({ ...c, width: e.target.value }))} className="h-8 w-20 rounded-md border px-2" inputMode="numeric" aria-label="Width" />
        <span className="text-slate-400">×</span>
        <input value={custom.height} onChange={e => setCustom(c => ({ ...c, height: e.target.value }))} className="h-8 w-20 rounded-md border px-2" inputMode="numeric" aria-label="Height" />
        <button type="button" onClick={addCustom} className="h-8 rounded-md border px-3 hover:bg-slate-50">Add</button>
      </div>
      {value.length === 0 && <p className="text-xs text-rose-600">Choose at least one.</p>}
    </div>
  )
}

export function CompareSettings({
  projectId,
  value,
  onChange,
}: {
  projectId: string
  value: VisualSettings
  onChange: (_v: VisualSettings) => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const [credentials, setCredentials] = useState<{ id: string; roleName: string; username: string }[] | null>(null)
  const set = <K extends keyof VisualSettings>(k: K, v: VisualSettings[K]) => onChange({ ...value, [k]: v })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/credentials`)
      .then(r => (r.ok ? r.json() : { credentials: [] }))
      .then(d => !cancelled && setCredentials(d.credentials || []))
      .catch(() => !cancelled && setCredentials([]))
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">How strict should the comparison be?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MATCH_LEVEL_META) as (keyof typeof MATCH_LEVEL_META)[]).map(level => (
            <label key={level} className={`cursor-pointer rounded-lg border p-3 text-sm ${value.matchLevel === level ? "border-indigo-400 bg-indigo-50/60" : "hover:bg-slate-50"}`}>
              <span className="flex items-center gap-2 font-medium text-slate-800">
                <input type="radio" name="matchLevel" checked={value.matchLevel === level} onChange={() => set("matchLevel", level)} className="accent-indigo-600" />
                {MATCH_LEVEL_META[level].label}
              </span>
              <span className="mt-1 block text-xs text-slate-500">{MATCH_LEVEL_META[level].hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">What should the screenshot include?</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { v: "FullPage" as const, label: "The whole page, top to bottom" },
            { v: "Viewport" as const, label: "Only what fits on the screen" },
          ].map(o => (
            <label key={o.v} className={`cursor-pointer rounded-lg border px-3 py-2 ${value.captureType === o.v ? "border-indigo-400 bg-indigo-50/60" : "hover:bg-slate-50"}`}>
              <input type="radio" name="captureType" checked={value.captureType === o.v} onChange={() => set("captureType", o.v)} className="mr-2 accent-indigo-600" />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={value.autoMaintenance} onChange={e => set("autoMaintenance", e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span>
          <span className="font-medium text-slate-800">Apply my decision to identical changes</span>
          <span className="block text-xs text-slate-500">Accepting a new logo on one page also accepts the same change on every other page, so you review it once.</span>
        </span>
      </label>

      <button type="button" onClick={() => setAdvanced(a => !a)} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        {advanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} More options
      </button>
      {advanced && (
        <div className="space-y-4 rounded-lg border bg-slate-50/50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-800">Module for bugs filed from this test</span>
              <ModuleSelect projectId={projectId} value={value.suiteId} onChange={v => set("suiteId", v)} className="h-9 w-full rounded-md border bg-white px-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-800">Sign in before capturing</span>
              <select value={value.credentialId} onChange={e => set("credentialId", e.target.value)} className="h-9 w-full rounded-md border bg-white px-2">
                <option value="">Don&apos;t sign in</option>
                {(credentials || []).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.roleName} ({c.username})
                  </option>
                ))}
              </select>
              {credentials && credentials.length === 0 && (
                <span className="block text-xs text-slate-500">No saved logins you can use. A project owner can add them under the project&apos;s credentials.</span>
              )}
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-800">Wait before each screenshot</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                value={Math.round(value.waitBeforeCaptureMs / 1000)}
                onChange={e => set("waitBeforeCaptureMs", Math.max(0, Math.min(30, Number(e.target.value) || 0)) * 1000)}
                className="h-9 w-24 rounded-md border bg-white px-2"
              />
              <span className="text-slate-500">seconds (for pages that keep loading after they appear)</span>
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-800">Run this JavaScript before each screenshot</span>
            <span className="block text-xs text-slate-500">For example, close a cookie banner: <code>document.querySelector(&apos;#cookie-accept&apos;)?.click()</code></span>
            <textarea
              value={value.beforeCaptureScript}
              onChange={e => set("beforeCaptureScript", e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-white p-2 font-mono text-xs"
              placeholder="// optional"
            />
          </label>
        </div>
      )}
    </div>
  )
}
