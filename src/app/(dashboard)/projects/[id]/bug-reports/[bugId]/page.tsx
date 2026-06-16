"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface BugReport {
  id: string
  title: string
  severity: string
  priority: string
  environment: string
  roleUsed: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  screenshotPath: string | null
  consoleLogs: string | null
  networkErrors: string | null
  browser: string
  viewport: string
  createdAt: string
  testRun?: {
    testCase?: {
      title: string
      module: string
      moduleRelation?: { name: string } | null
      feature?: { name: string } | null
      component?: { name: string } | null
    } | null
  } | null
}

export default function BugReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [bug, setBug] = useState<BugReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/bug-reports/${params.bugId}`)
      .then((res) => res.json())
      .then((data) => {
        setBug(data.bugReport)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.id, params.bugId])

  function downloadMarkdown() {
    if (!bug) return

    const markdown = `# Bug Report: ${bug.title}
    
**Date**: ${new Date(bug.createdAt).toLocaleString()}
**Severity**: ${bug.severity}
**Priority**: ${bug.priority}
**Environment**: ${bug.environment}
**Role Used**: ${bug.roleUsed}
**Browser**: ${bug.browser}
**Viewport**: ${bug.viewport}

## Steps to Reproduce
${bug.stepsToReproduce}

## Expected Result
${bug.expectedResult}

## Actual Result
${bug.actualResult}

${bug.consoleLogs ? `## Console Logs\n\`\`\`\n${bug.consoleLogs}\n\`\`\`\n` : ""}
${bug.networkErrors ? `## Network Errors\n\`\`\`\n${bug.networkErrors}\n\`\`\`\n` : ""}
`

    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bug-report-${bug.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-muted-foreground">Loading bug details...</p>
  if (!bug) return <p className="text-destructive">Bug report not found</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push(`/projects/${params.id}`)}
            className="mb-2"
          >
            &larr; Back to Project
          </Button>
          {bug.testRun?.testCase && (
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
              {[
                bug.testRun.testCase.moduleRelation?.name || bug.testRun.testCase.module || "General",
                bug.testRun.testCase.feature?.name,
                bug.testRun.testCase.component?.name,
                bug.testRun.testCase.title
              ].filter(Boolean).join(" / ")}
            </div>
          )}
          <h1 className="text-3xl font-bold">{bug.title}</h1>
          <p className="text-sm text-muted-foreground">
            Logged on {new Date(bug.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={downloadMarkdown}>
            Export Markdown
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="border rounded-lg p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold border-b pb-2">Steps to Reproduce</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{bug.stepsToReproduce}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold border-b pb-2">Expected Result</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{bug.expectedResult}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold border-b pb-2">Actual Result</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{bug.actualResult}</p>
            </div>
          </div>

          {bug.screenshotPath && (
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="text-lg font-semibold border-b pb-2">Failure Screenshot</h3>
              <div className="mt-4 overflow-hidden rounded border max-w-full">
                <img
                  src={`/api/files/${encodeURIComponent(bug.screenshotPath)}`}
                  alt="Failure screenshot"
                  className="max-h-[500px] object-contain mx-auto"
                />
              </div>
            </div>
          )}

          {bug.consoleLogs && (
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="text-lg font-semibold border-b pb-2 text-yellow-600">Console Logs</h3>
              <pre className="mt-4 bg-muted p-4 rounded text-xs overflow-x-auto max-h-[300px] text-foreground/90">
                {bug.consoleLogs}
              </pre>
            </div>
          )}

          {bug.networkErrors && (
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="text-lg font-semibold border-b pb-2 text-red-600">Network Errors</h3>
              <pre className="mt-4 bg-muted p-4 rounded text-xs overflow-x-auto max-h-[300px] text-foreground/90">
                {bug.networkErrors}
              </pre>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="border rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Metadata</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Severity:</span>
              <span className="font-semibold">{bug.severity}</span>

              <span className="text-muted-foreground">Priority:</span>
              <span className="font-semibold">{bug.priority}</span>

              <span className="text-muted-foreground">Environment:</span>
              <span className="font-semibold">{bug.environment}</span>

              <span className="text-muted-foreground">Role Used:</span>
              <span className="font-semibold">{bug.roleUsed}</span>

              <span className="text-muted-foreground">Browser:</span>
              <span className="font-semibold">{bug.browser}</span>

              <span className="text-muted-foreground">Viewport:</span>
              <span className="font-semibold">{bug.viewport}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
