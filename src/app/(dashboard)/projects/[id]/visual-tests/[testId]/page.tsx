"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Loader2, Play, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CompareSettings, EnvironmentPicker, type VisualSettings } from "@/components/visual-tests/settings-fields"
import { EnvChips, RunStatusBadge, TEST_TYPE_LABEL, api, formatDate, formatDuration, pathOf } from "@/components/visual-tests/shared"
import { isInExcludedFolder } from "@/lib/visual-tests/url-tools"

type Tab = "runs" | "pages" | "settings" | "regions"

export default function VisualTestDetailPage() {
  const { id: projectId, testId } = useParams() as { id: string; testId: string }
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<Tab>("runs")
  const [starting, setStarting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/visual-tests/${testId}`))
    } catch (err: any) {
      toast.error(err.message)
    }
  }, [testId])
  useEffect(() => {
    load()
  }, [load])

  const running = data?.runs?.find((r: any) => r.status === "Queued" || r.status === "Running")
  useEffect(() => {
    if (!running) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [running, load])

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }
  const test = data.test

  const run = async () => {
    setStarting(true)
    try {
      const { runId } = await api<{ runId: string }>(`/api/visual-tests/${testId}/runs`, { method: "POST" })
      router.push(`/projects/${projectId}/visual-tests/runs/${runId}`)
    } catch (err: any) {
      if (err.status === 409 && err.data?.runId) router.push(`/projects/${projectId}/visual-tests/runs/${err.data.runId}`)
      else toast.error(err.message)
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <Link href={`/projects/${projectId}/visual-tests`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Visual tests
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{test.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{TEST_TYPE_LABEL[test.type]}</span>
            <span className="text-slate-300">·</span>
            {test.type === "Flow" ? (
              <Link href={`/projects/${projectId}/test-cases/${test.testCase?.id}/edit`} className="text-indigo-700 hover:underline">
                {test.testCase?.title}
              </Link>
            ) : (
              <a href={test.startUrl} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                {test.startUrl}
              </a>
            )}
            <span className="text-slate-300">·</span>
            <EnvChips environments={test.environments} />
          </p>
        </div>
        <div className="flex gap-2">
          {data.canDelete && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          {test.type !== "Flow" &&
            (running ? (
              <Button onClick={() => router.push(`/projects/${projectId}/visual-tests/runs/${running.id}`)}>
                <Loader2 className="animate-spin" /> View the run in progress
              </Button>
            ) : (
              <Button onClick={run} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Play />} Run now
              </Button>
            ))}
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            ["runs", `Runs (${data.runs.length})`],
            ...(test.type !== "Flow" ? [["pages", `Pages (${data.pages.filter((p: any) => !p.excluded && !p.removedAt).length})`]] : []),
            ["regions", `Ignored areas (${data.regions.length})`],
            ["settings", "Settings"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "runs" && <RunsTab projectId={projectId} runs={data.runs} baselineCount={data.baselineCount} />}
      {tab === "pages" && <PagesTab test={test} pages={data.pages} onChanged={load} />}
      {tab === "regions" && <RegionsTab regions={data.regions} pages={data.pages} environments={test.environments} onChanged={load} />}
      {tab === "settings" && <SettingsTab projectId={projectId} test={test} onSaved={load} />}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${test.name}”?`}
        description={`This deletes ${data.runs.length} run(s), every screenshot review and ${data.baselineCount} approved image(s). Bugs already filed stay.`}
        confirmLabel="Delete test"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await api(`/api/visual-tests/${testId}`, { method: "DELETE" })
          router.push(`/projects/${projectId}/visual-tests`)
        }}
      />
    </div>
  )
}

function RunsTab({ projectId, runs, baselineCount }: { projectId: string; runs: any[]; baselineCount: number }) {
  if (!runs.length) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-600">
        This test has not run yet. The first run records the approved screenshots.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{baselineCount} approved screenshot(s) on file.</p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Took</th>
              <th className="px-4 py-3">Screens</th>
              <th className="px-4 py-3">Pages added / removed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link href={`/projects/${projectId}/visual-tests/runs/${r.id}`}>
                    <RunStatusBadge status={r.status} outcome={r.outcome} newCount={r.newCount} passedCount={r.passedCount} />
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <Link href={`/projects/${projectId}/visual-tests/runs/${r.id}`} className="hover:text-indigo-700">
                    {formatDate(r.startedAt || r.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDuration(r.startedAt, r.completedAt)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {r.status === "Running" ? (
                    `${r.doneScreens} of ${r.totalScreens || "?"}`
                  ) : (
                    <span className="space-x-2">
                      {r.newCount > 0 && r.newCount === r.passedCount ? (
                        <span className="text-sky-700">{r.newCount} new baseline{r.newCount === 1 ? "" : "s"}</span>
                      ) : (
                        <span className="text-emerald-700">
                          {r.passedCount - (r.newCount || 0)} passed{r.newCount > 0 ? ` · ${r.newCount} new` : ""}
                        </span>
                      )}
                      {r.unresolvedCount > 0 && <span className="text-amber-700">{r.unresolvedCount} to review</span>}
                      {r.failedCount > 0 && <span className="text-rose-700">{r.failedCount} failed</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.addedPages || r.removedPages ? `+${r.addedPages} / −${r.removedPages}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PagesTab({ test, pages, onChanged }: { test: any; pages: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState("")
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState("")
  const [show, setShow] = useState<"included" | "excluded" | "removed">("included")

  const rows = useMemo(
    () =>
      pages
        .map(p => ({ ...p, folderExcluded: isInExcludedFolder(p.url, test.excludedFolders) }))
        .filter(p =>
          show === "removed" ? !!p.removedAt : show === "excluded" ? !p.removedAt && (p.excluded || p.folderExcluded) : !p.removedAt && !p.excluded && !p.folderExcluded
        )
        .filter(p => !filter || p.url.toLowerCase().includes(filter.toLowerCase())),
    [pages, test.excludedFolders, show, filter]
  )

  const setExcluded = async (pageIds: string[], excluded: boolean) => {
    setBusy(true)
    try {
      await api(`/api/visual-tests/${test.id}/pages`, { method: "PATCH", json: { pageIds, excluded } })
      onChanged()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    setBusy(true)
    try {
      const r = await api<{ added: number; alreadyThere: number }>(`/api/visual-tests/${test.id}/pages`, { method: "POST", json: { urlsText: adding } })
      toast.success(`${r.added} page(s) added${r.alreadyThere ? `, ${r.alreadyThere} were already in the test` : ""}`)
      setAdding("")
      onChanged()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["included", "excluded", "removed"] as const).map(s => (
            <button key={s} onClick={() => setShow(s)} className={`rounded-full border px-3 py-1 text-sm ${show === s ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>
              {s === "included" ? "Being tested" : s === "excluded" ? "Left out" : "No longer in sitemap"}
            </button>
          ))}
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter" className="ml-auto h-8 w-48 rounded-md border px-2 text-sm" />
        </div>
        {test.type === "FullWebsite" && (
          <p className="text-xs text-slate-500">
            Pages come from the sitemap and are refreshed on every run. Up to {test.maxUrls} pages are tested.
            {test.excludedFolders.length > 0 && ` Folders left out: ${test.excludedFolders.join(", ")}.`}
          </p>
        )}
        <div className="max-h-[520px] overflow-y-auto rounded-xl border bg-white">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nothing here.</p>
          ) : (
            rows.map(p => (
              <div key={p.id} className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-slate-700 hover:text-indigo-700" title={p.url}>
                  {pathOf(p.url)}
                </a>
                <span className="text-xs text-slate-400">{p.source}</span>
                {show !== "removed" &&
                  (p.folderExcluded ? (
                    <span className="text-xs text-slate-500">folder left out</span>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setExcluded([p.id], !p.excluded)}>
                      {p.excluded ? <Eye /> : <EyeOff />} {p.excluded ? "Include" : "Leave out"}
                    </Button>
                  ))}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="space-y-2 rounded-xl border bg-white p-4">
        <p className="text-sm font-medium text-slate-800">Add pages</p>
        <textarea value={adding} onChange={e => setAdding(e.target.value)} rows={6} placeholder={"One address per line\n/pricing"} className="w-full rounded-md border p-2 font-mono text-xs" />
        <Button size="sm" onClick={add} disabled={busy || !adding.trim()}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  )
}

function RegionsTab({ regions, pages, environments, onChanged }: { regions: any[]; pages: any[]; environments: any[]; onChanged: () => void }) {
  const pageName = (key: string | null) => (key ? pathOf(pages.find(p => p.urlKey === key)?.url) || key : "Every page")
  const envName = (key: string | null) => (key ? environments.find(e => e.key === key)?.name || key : "every browser & size")
  if (!regions.length) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">
        No ignored areas. Draw one on a screenshot while reviewing a run, for example over a rotating banner or a clock.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Applies to</th>
            <th className="px-4 py-3">Area</th>
            <th className="px-4 py-3">Note</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {regions.map(r => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="px-4 py-3 text-slate-700">
                {pageName(r.screenKey)} · {envName(r.envKey)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.width}×{r.height} at ({r.x}, {r.y})
              </td>
              <td className="px-4 py-3 text-slate-600">{r.note || "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const res = await api<{ updated: { status: string }[] }>(`/api/visual-tests/regions/${r.id}`, { method: "DELETE" })
                      const back = res.updated.filter(u => u.status === "Unresolved").length
                      toast.success(back ? `Area removed. ${back} screen(s) of the latest run need review again.` : "Area removed")
                      onChanged()
                    } catch (err: any) {
                      toast.error(err.message)
                    }
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SettingsTab({ projectId, test, onSaved }: { projectId: string; test: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: test.name,
    startUrl: test.startUrl,
    sitemapUrl: test.sitemapUrl || "",
    maxUrls: test.maxUrls,
    excludedFolders: (test.excludedFolders || []).join("\n"),
  })
  const [settings, setSettings] = useState<VisualSettings>({
    environments: test.environments,
    matchLevel: test.matchLevel,
    captureType: test.captureType,
    waitBeforeCaptureMs: test.waitBeforeCaptureMs,
    beforeCaptureScript: test.beforeCaptureScript || "",
    suiteId: test.suiteId || "",
    credentialId: test.credentialId || "",
    autoMaintenance: test.autoMaintenance,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/visual-tests/${test.id}`, {
        method: "PATCH",
        json: {
          name: form.name,
          ...(test.type !== "Flow"
            ? {
                startUrl: form.startUrl,
                sitemapUrl: form.sitemapUrl || null,
                maxUrls: Number(form.maxUrls) || 100,
                excludedFolders: form.excludedFolders.split(/\n|,/).map((s: string) => s.trim()).filter(Boolean),
              }
            : {}),
          environments: settings.environments,
          matchLevel: settings.matchLevel,
          captureType: settings.captureType,
          waitBeforeCaptureMs: settings.waitBeforeCaptureMs,
          beforeCaptureScript: settings.beforeCaptureScript || null,
          suiteId: settings.suiteId || null,
          credentialId: settings.credentialId || null,
          autoMaintenance: settings.autoMaintenance,
        },
      })
      toast.success("Saved. The next run uses these settings.")
      onSaved()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 rounded-xl border bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-800">Name</span>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 w-full rounded-md border px-2" />
        </label>
        {test.type !== "Flow" && (
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-800">Web address</span>
            <input value={form.startUrl} onChange={e => setForm(f => ({ ...f, startUrl: e.target.value }))} className="h-9 w-full rounded-md border px-2" />
          </label>
        )}
        {test.type === "FullWebsite" && (
          <>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-800">Sitemap address</span>
              <input value={form.sitemapUrl} onChange={e => setForm(f => ({ ...f, sitemapUrl: e.target.value }))} placeholder="Found automatically" className="h-9 w-full rounded-md border px-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-800">Most pages to test</span>
              <input type="number" value={form.maxUrls} onChange={e => setForm(f => ({ ...f, maxUrls: e.target.value }))} className="h-9 w-full rounded-md border px-2" />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-800">Folders to leave out</span>
              <textarea value={form.excludedFolders} onChange={e => setForm(f => ({ ...f, excludedFolders: e.target.value }))} rows={3} placeholder={"/blog/\n/careers/"} className="w-full rounded-md border p-2 font-mono text-xs" />
            </label>
          </>
        )}
      </div>
      {test.type === "Flow" ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Checkpoints are captured in the browser and screen size the test case runs in, so there is nothing to choose here.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Browsers and screen sizes</p>
          <p className="text-xs text-slate-500">Adding one gives it its own approved screenshots on the next run. Removing one keeps its history.</p>
          <EnvironmentPicker value={settings.environments} onChange={environments => setSettings(s => ({ ...s, environments }))} />
        </div>
      )}
      <CompareSettings projectId={projectId} value={settings} onChange={setSettings} />
      <Button onClick={save} disabled={saving || (test.type !== "Flow" && !settings.environments.length)}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
      </Button>
    </div>
  )
}
