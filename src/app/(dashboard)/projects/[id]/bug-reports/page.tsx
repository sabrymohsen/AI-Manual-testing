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
  createdAt: string
  browser: string
  viewport: string
}

export default function ProjectBugReportsPage() {
  const params = useParams()
  const router = useRouter()
  const [bugReports, setBugReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")

  useEffect(() => {
    let url = `/api/projects/${params.id}/bug-reports`
    const qParams: string[] = []
    if (severityFilter) qParams.push(`severity=${severityFilter}`)
    if (priorityFilter) qParams.push(`priority=${priorityFilter}`)
    if (qParams.length > 0) {
      url += `?${qParams.join("&")}`
    }

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setBugReports(data.bugReports || [])
        setLoading(false)
      })
  }, [params.id, severityFilter, priorityFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bug Reports</h1>
          <p className="text-sm text-muted-foreground">
            Bugs captured and logged for this project
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setLoading(true) }}
          className="flex h-10 w-full max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Severities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setLoading(true) }}
          className="flex h-10 w-full max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Priorities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading bug reports...</p>
      ) : bugReports.length === 0 ? (
        <p className="text-muted-foreground">No bug reports found matching filters.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {bugReports.map((br) => (
            <div
              key={br.id}
              onClick={() => router.push(`/projects/${params.id}/bug-reports/${br.id}`)}
              className="p-4 flex items-center justify-between hover:bg-accent cursor-pointer transition-colors"
            >
              <div>
                <p className="font-semibold text-foreground">{br.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Env: {br.environment} · Role: {br.roleUsed} · Browser: {br.browser} · Viewport: {br.viewport}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded font-medium ${
                  br.severity === "Critical" ? "bg-red-100 text-red-700" :
                  br.severity === "High" ? "bg-orange-100 text-orange-700" :
                  br.severity === "Medium" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  Sev: {br.severity}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded font-medium ${
                  br.priority === "Critical" ? "bg-red-100 text-red-700" :
                  br.priority === "High" ? "bg-orange-100 text-orange-700" :
                  br.priority === "Medium" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  Pri: {br.priority}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  {new Date(br.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
