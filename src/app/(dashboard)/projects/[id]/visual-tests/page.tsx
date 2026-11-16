"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Globe, ListChecks, Loader2, Play, Plus, ScanEye, Workflow, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EnvChips, RunStatusBadge, TEST_TYPE_LABEL, api, formatDate } from "@/components/visual-tests/shared"

interface TestRow {
  id: string
  name: string
  type: "FullWebsite" | "UrlList" | "Flow"
  startUrl: string
  pageCount: number
  environments: any[]
  suite: { id: string; name: string } | null
  testCase: { id: string; title: string } | null
  lastRun: null | {
    id: string
    status: any
    outcome: any
    createdAt: string
    totalScreens: number
    doneScreens: number
    passedCount: number
    unresolvedCount: number
    failedCount: number
    newCount?: number
  }
}

const TYPES = [
  {
    type: "FullWebsite",
    icon: Globe,
    title: "Whole website",
    text: "Give the site's address. Its sitemap is read and every page is checked on the browsers and screen sizes you pick.",
  },
  {
    type: "UrlList",
    icon: ListChecks,
    title: "List of pages",
    text: "Type or upload the pages that matter most (home, pricing, checkout) and check just those.",
  },
  {
    type: "Flow",
    icon: Workflow,
    title: "Steps in a test case",
    text: "Add a “Visually check this screen” step to any test case. Its screenshots show up here when the test case runs.",
  },
]

export default function VisualTestsPage() {
  const { id: projectId } = useParams() as { id: string }
  const router = useRouter()
  const [tests, setTests] = useState<TestRow[] | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ tests: TestRow[] }>(`/api/projects/${projectId}/visual-tests`)
      setTests(data.tests)
    } catch (err: any) {
      toast.error(err.message)
      setTests([])
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  // Keep the list current while anything is capturing.
  useEffect(() => {
    if (!tests?.some(t => t.lastRun && (t.lastRun.status === "Queued" || t.lastRun.status === "Running"))) return
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [tests, load])

  const run = async (testId: string) => {
    setStarting(testId)
    try {
      const { runId } = await api<{ runId: string }>(`/api/visual-tests/${testId}/runs`, { method: "POST" })
      router.push(`/projects/${projectId}/visual-tests/runs/${runId}`)
    } catch (err: any) {
      if (err.status === 409 && err.data?.runId) router.push(`/projects/${projectId}/visual-tests/runs/${err.data.runId}`)
      else toast.error(err.message)
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ScanEye className="h-6 w-6 text-indigo-600" /> Visual tests
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Take screenshots of your pages, compare them with the last approved screenshots, and review only what changed.
          </p>
        </div>
        <Button onClick={() => setChoosing(true)}>
          <Plus /> New visual test
        </Button>
      </div>

      {choosing && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">What would you like to test?</h2>
            <button onClick={() => setChoosing(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {TYPES.map(t => {
              const Icon = t.icon
              const content = (
                <>
                  <Icon className="h-6 w-6 text-indigo-600" />
                  <span className="mt-3 block font-semibold text-slate-900">{t.title}</span>
                  <span className="mt-1 block text-sm text-slate-600">{t.text}</span>
                </>
              )
              return t.type === "Flow" ? (
                <Link key={t.type} href={`/projects/${projectId}/test-cases`} className="rounded-lg border p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  {content}
                  <span className="mt-2 block text-xs font-medium text-indigo-700">Open test cases →</span>
                </Link>
              ) : (
                <Link key={t.type} href={`/projects/${projectId}/visual-tests/new?type=${t.type}`} className="rounded-lg border p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  {content}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {tests === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading visual tests…
        </div>
      ) : tests.length === 0 ? (
        !choosing && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center">
            <ScanEye className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-medium text-slate-800">No visual tests yet</p>
            <p className="mt-1 text-sm text-slate-500">Start with your whole website, or a short list of the pages you care about most.</p>
            <Button className="mt-4" onClick={() => setChoosing(true)}>
              <Plus /> New visual test
            </Button>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Browsers &amp; sizes</th>
                <th className="px-4 py-3">Last run</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${projectId}/visual-tests/${t.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                      {t.name}
                    </Link>
                    <div className="max-w-xs truncate text-xs text-slate-500">{t.type === "Flow" ? t.testCase?.title : t.startUrl}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{TEST_TYPE_LABEL[t.type]}</td>
                  <td className="px-4 py-3 text-slate-600">{t.type === "Flow" ? "—" : t.pageCount}</td>
                  <td className="px-4 py-3">
                    <EnvChips environments={t.environments} max={2} />
                  </td>
                  <td className="px-4 py-3">
                    {t.lastRun ? (
                      <Link href={`/projects/${projectId}/visual-tests/runs/${t.lastRun.id}`} className="space-y-1">
                        <RunStatusBadge status={t.lastRun.status} outcome={t.lastRun.outcome} newCount={t.lastRun.newCount} passedCount={t.lastRun.passedCount} />
                        <div className="text-xs text-slate-500">
                          {t.lastRun.status === "Running"
                            ? `${t.lastRun.doneScreens} of ${t.lastRun.totalScreens || "?"} screens`
                            : `${formatDate(t.lastRun.createdAt)}${t.lastRun.unresolvedCount ? ` · ${t.lastRun.unresolvedCount} to review` : ""}`}
                        </div>
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">Never run</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.type !== "Flow" && (
                      <Button size="sm" variant="outline" onClick={() => run(t.id)} disabled={starting === t.id}>
                        {starting === t.id ? <Loader2 className="animate-spin" /> : <Play />} Run
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
