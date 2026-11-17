"use client"

import { Suspense, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Check, ChevronDown, ChevronRight, FileUp, Folder, Loader2, Play, Save, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CompareSettings, DEFAULT_SETTINGS, EnvironmentPicker, type VisualSettings } from "@/components/visual-tests/settings-fields"
import { MATCH_LEVEL_META, api, pathOf } from "@/components/visual-tests/shared"
import { groupByFolder, isInExcludedFolder, normalizeUrl } from "@/lib/visual-tests/url-tools"

type TestType = "FullWebsite" | "UrlList"
interface FoundPage {
  url: string
  key: string
  folder: string
  source: string
}

function StepCard({
  n,
  title,
  open,
  done,
  summary,
  onOpen,
  children,
}: {
  n: number
  title: string
  open: boolean
  done: boolean
  summary?: React.ReactNode
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border bg-card ${open ? "shadow-sm ring-1 ring-indigo-100" : ""}`}>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-emerald-100 text-emerald-700" : open ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
        >
          {done && !open ? <Check className="h-4 w-4" /> : n}
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-foreground">{title}</span>
          {!open && summary && <span className="block text-sm text-muted-foreground">{summary}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-5 py-5">{children}</div>}
    </section>
  )
}

function Wizard() {
  const { id: projectId } = useParams() as { id: string }
  const router = useRouter()
  const search = useSearchParams()
  const type: TestType = search.get("type") === "UrlList" ? "UrlList" : "FullWebsite"

  const [step, setStep] = useState(1)
  const [startUrl, setStartUrl] = useState("")
  const [sitemapUrl, setSitemapUrl] = useState("")
  const [maxUrls, setMaxUrls] = useState(100)
  const [urlsText, setUrlsText] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanNotes, setScanNotes] = useState<string[]>([])
  const [pages, setPages] = useState<FoundPage[] | null>(null)
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set())
  const [excludedFolders, setExcludedFolders] = useState<string[]>([])
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["/"]))
  const [filter, setFilter] = useState("")
  const [settings, setSettings] = useState<VisualSettings>(DEFAULT_SETTINGS)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState<null | "save" | "run">(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isExcluded = (p: FoundPage) => excludedKeys.has(p.key) || (type === "FullWebsite" && isInExcludedFolder(p.url, excludedFolders))
  const includedCount = pages ? pages.filter(p => !isExcluded(p)).length : 0
  const groups = useMemo(() => groupByFolder((pages || []).filter(p => !filter || p.url.toLowerCase().includes(filter.toLowerCase()))), [pages, filter])

  const defaultName = () => {
    const n = normalizeUrl(startUrl || pages?.[0]?.url || "")
    const host = n ? new URL(n.url).hostname.replace(/^www\./, "") : "Site"
    return type === "FullWebsite" ? `${host} — whole site` : `${host} — key pages`
  }

  const scan = async () => {
    const base = normalizeUrl(startUrl)
    if (type === "FullWebsite" && !base) {
      toast.error("Enter the web address, for example https://example.com")
      return
    }
    if (type === "UrlList" && !urlsText.trim()) {
      toast.error("Enter at least one web address, or upload a file")
      return
    }
    setScanning(true)
    setScanNotes([])
    try {
      const data = await api<{ pages: FoundPage[]; notes?: string[]; method?: string }>(`/api/projects/${projectId}/visual-tests/discover`, {
        method: "POST",
        json: { type, startUrl: base?.url || "", sitemapUrl: sitemapUrl || null, maxUrls, urlsText },
      })
      setPages(data.pages)
      setScanNotes(data.notes || [])
      setExcludedKeys(new Set())
      if (!startUrl && data.pages[0]) setStartUrl(new URL(data.pages[0].url).origin)
      if (data.pages.length) {
        setOpenFolders(new Set(groupByFolder(data.pages).slice(0, 3).map(g => g.folder)))
        setStep(2)
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setScanning(false)
    }
  }

  const uploadFile = async (file: File) => {
    const form = new FormData()
    form.append("file", file)
    if (normalizeUrl(startUrl)) form.append("startUrl", normalizeUrl(startUrl)!.url)
    setScanning(true)
    try {
      const data = await api<{ pages: FoundPage[] }>(`/api/projects/${projectId}/visual-tests/parse-file`, { method: "POST", body: form })
      if (!data.pages.length) {
        toast.error("No web addresses were found in that file")
        return
      }
      setUrlsText(prev => [prev.trim(), ...data.pages.map(p => p.url)].filter(Boolean).join("\n"))
      toast.success(`${data.pages.length} web addresses read from ${file.name}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const toggleFolder = (folder: string, folderPages: FoundPage[]) => {
    if (type === "FullWebsite" && folder !== "/") {
      // Excluding a folder also covers pages the sitemap adds to it later.
      setExcludedFolders(f => (f.includes(folder) ? f.filter(x => x !== folder) : [...f, folder]))
      setExcludedKeys(k => {
        const next = new Set(k)
        folderPages.forEach(p => next.delete(p.key))
        return next
      })
      return
    }
    const allExcluded = folderPages.every(p => excludedKeys.has(p.key))
    setExcludedKeys(k => {
      const next = new Set(k)
      folderPages.forEach(p => (allExcluded ? next.delete(p.key) : next.add(p.key)))
      return next
    })
  }

  const save = async (andRun: boolean) => {
    if (!pages) return
    if (!settings.environments.length) {
      setStep(3)
      toast.error("Choose at least one browser or screen size")
      return
    }
    if (!includedCount) {
      setStep(2)
      toast.error("Include at least one page")
      return
    }
    setSaving(andRun ? "run" : "save")
    try {
      const base = normalizeUrl(startUrl) || normalizeUrl(pages[0].url)!
      const { id } = await api<{ id: string }>(`/api/projects/${projectId}/visual-tests`, {
        method: "POST",
        json: {
          name: name.trim() || defaultName(),
          type,
          startUrl: base.url,
          sitemapUrl: sitemapUrl || null,
          maxUrls: type === "FullWebsite" ? maxUrls : Math.max(maxUrls, pages.length),
          excludedFolders: type === "FullWebsite" ? excludedFolders : [],
          pages: pages.map(p => ({ url: p.url, excluded: excludedKeys.has(p.key), source: p.source })),
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
      if (andRun) {
        try {
          const { runId } = await api<{ runId: string }>(`/api/visual-tests/${id}/runs`, { method: "POST" })
          router.push(`/projects/${projectId}/visual-tests/runs/${runId}`)
          return
        } catch (err: any) {
          toast.error(`The test was saved, but the run could not start: ${err.message}`)
        }
      }
      router.push(`/projects/${projectId}/visual-tests/${id}`)
    } catch (err: any) {
      toast.error(err.message)
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Link href={`/projects/${projectId}/visual-tests`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Visual tests
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{type === "FullWebsite" ? "Test a whole website" : "Test a list of pages"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Answer one question at a time. Nothing is saved until the last step.</p>
      </div>

      <StepCard
        n={1}
        title={type === "FullWebsite" ? "Which website?" : "Which pages?"}
        open={step === 1}
        done={!!pages}
        onOpen={() => setStep(1)}
        summary={pages ? `${pages.length} page${pages.length === 1 ? "" : "s"} found${startUrl ? ` on ${startUrl}` : ""}` : undefined}
      >
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">{type === "FullWebsite" ? "Web address" : "Site address (optional, lets you write /pricing instead of the full address)"}</span>
            <input value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://example.com" className="h-10 w-full rounded-md border px-3" autoFocus />
          </label>

          {type === "FullWebsite" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-foreground">Sitemap address <span className="font-normal text-muted-foreground">(optional)</span></span>
                <input value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="Found automatically from robots.txt or /sitemap.xml" className="h-10 w-full rounded-md border px-3" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-foreground">Most pages to test</span>
                <input type="number" min={1} max={2000} value={maxUrls} onChange={e => setMaxUrls(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} className="h-10 w-full rounded-md border px-3" />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-foreground">Pages, one per line</span>
                <textarea
                  value={urlsText}
                  onChange={e => setUrlsText(e.target.value)}
                  rows={7}
                  placeholder={"https://example.com/\nhttps://example.com/pricing\n/checkout"}
                  className="w-full rounded-md border p-3 font-mono text-xs"
                />
              </label>
              <input ref={fileRef} type="file" accept=".txt,.csv,.xml,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={scanning}>
                <FileUp /> Upload a file (.txt, .csv, .xml sitemap, .xlsx)
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <Loader2 className="animate-spin" /> : <Search />}
              {type === "FullWebsite" ? (scanning ? "Reading the site…" : "Find pages") : "Read the list"}
            </Button>
            {scanning && type === "FullWebsite" && <span className="text-sm text-muted-foreground">This can take up to a minute on a large site.</span>}
          </div>
          {scanNotes.map(n => (
            <p key={n} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{n}</p>
          ))}
        </div>
      </StepCard>

      <StepCard
        n={2}
        title="Which of these pages should be checked?"
        open={step === 2}
        done={!!pages && includedCount > 0}
        onOpen={() => pages && setStep(2)}
        summary={pages ? `${includedCount} of ${pages.length} included${excludedFolders.length ? ` · ${excludedFolders.length} folder(s) left out` : ""}` : "Find the pages first"}
      >
        {pages && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{includedCount}</span> of {pages.length} pages included.{" "}
                {type === "FullWebsite" && "Unticking a folder also leaves out pages added to it later."}
              </p>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter pages" className="h-8 w-56 rounded-md border px-2 text-sm" />
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-lg border">
              {groups.map(g => {
                const folderExcluded = type === "FullWebsite" && excludedFolders.includes(g.folder)
                const included = g.pages.filter(p => !isExcluded(p)).length
                const open = openFolders.has(g.folder) || !!filter
                return (
                  <div key={g.folder} className="border-b last:border-0">
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!folderExcluded && included > 0}
                        ref={el => {
                          if (el) el.indeterminate = !folderExcluded && included > 0 && included < g.pages.length
                        }}
                        onChange={() => toggleFolder(g.folder, g.pages)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-1 text-left font-medium text-foreground"
                        onClick={() =>
                          setOpenFolders(s => {
                            const next = new Set(s)
                            next.has(g.folder) ? next.delete(g.folder) : next.add(g.folder)
                            return next
                          })
                        }
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <Folder className="h-4 w-4 text-muted-foreground" /> {g.folder === "/" ? "Top-level pages" : g.folder}
                        <span className="ml-1 font-normal text-muted-foreground">
                          {included}/{g.pages.length}
                        </span>
                      </button>
                    </div>
                    {open &&
                      g.pages.map(p => (
                        <label key={p.key} className="flex items-center gap-2 px-9 py-1.5 text-sm hover:bg-muted/50">
                          <input
                            type="checkbox"
                            checked={!isExcluded(p)}
                            disabled={folderExcluded}
                            onChange={() =>
                              setExcludedKeys(k => {
                                const next = new Set(k)
                                next.has(p.key) ? next.delete(p.key) : next.add(p.key)
                                return next
                              })
                            }
                            className="h-4 w-4 accent-indigo-600"
                          />
                          <span className="truncate text-foreground" title={p.url}>
                            {pathOf(p.url)}
                          </span>
                        </label>
                      ))}
                  </div>
                )
              })}
            </div>
            <Button onClick={() => setStep(3)} disabled={!includedCount}>
              Next
            </Button>
          </div>
        )}
      </StepCard>

      <StepCard
        n={3}
        title="Which browsers and screen sizes?"
        open={step === 3}
        done={step > 3 && settings.environments.length > 0}
        onOpen={() => pages && setStep(3)}
        summary={settings.environments.map(e => e.name).join(", ")}
      >
        <EnvironmentPicker value={settings.environments} onChange={environments => setSettings(s => ({ ...s, environments }))} />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => setStep(4)} disabled={!settings.environments.length}>
            Next
          </Button>
          {pages && settings.environments.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {includedCount} pages × {settings.environments.length} = {includedCount * settings.environments.length} screenshots per run
            </span>
          )}
        </div>
      </StepCard>

      <StepCard
        n={4}
        title="How should screenshots be compared?"
        open={step === 4}
        done={step > 4}
        onOpen={() => pages && setStep(4)}
        summary={`${MATCH_LEVEL_META[settings.matchLevel].label} · ${settings.captureType === "FullPage" ? "whole page" : "visible area"}`}
      >
        <CompareSettings projectId={projectId} value={settings} onChange={setSettings} />
        <Button className="mt-4" onClick={() => setStep(5)}>
          Next
        </Button>
      </StepCard>

      <StepCard n={5} title="Name it and start" open={step === 5} done={false} onOpen={() => pages && setStep(5)}>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">Test name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={defaultName()} className="h-10 w-full rounded-md border px-3" />
          </label>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            The first run has nothing to compare with, so every screenshot becomes the approved one. From the second run on, you&apos;ll only be asked about what changed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(true)} disabled={!!saving}>
              {saving === "run" ? <Loader2 className="animate-spin" /> : <Play />} Save and run now
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={!!saving}>
              {saving === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save without running
            </Button>
          </div>
        </div>
      </StepCard>
    </div>
  )
}

export default function NewVisualTestPage() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  )
}
