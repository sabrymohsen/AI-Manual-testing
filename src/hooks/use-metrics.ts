import { useEffect, useState } from "react"

/**
 * Hook to retrieve the globally selected active project ID from localStorage
 */
export function useActiveProject() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const pId = localStorage.getItem("activeProjectId")
    setActiveProjectId(pId)
    setLoading(false)

    const handleProjectChange = () => {
      setActiveProjectId(localStorage.getItem("activeProjectId"))
    }
    window.addEventListener("projectChanged", handleProjectChange)
    return () => window.removeEventListener("projectChanged", handleProjectChange)
  }, [])

  return { activeProjectId, loading }
}

/**
 * Shared hook to retrieve project execution and health summaries
 */
export function useProjectSummary(projectId: string | null) {
  const [summary, setSummary] = useState<{
    name: string
    baseUrl: string
    environment: string
    testCasesCount: number
    openBugsCount: number
    passRate: number
    /** Any tracker (Jira / Azure DevOps / ClickUp / OpenProject) is connected. */
    trackerConnected: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) {
      setSummary(null)
      return
    }

    async function loadSummary() {
      setLoading(true)
      try {
        const [projRes, casesRes, bugsRes, opRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/test-cases`),
          fetch(`/api/projects/${projectId}/bug-reports`),
          // Readable by every member, and covers every tracker — the OpenProject
          // route is admin-only and ignored Jira/Azure/ClickUp.
          fetch(`/api/projects/${projectId}/integrations/provider`)
        ])

        const projData = projRes.ok ? await projRes.json() : {}
        const casesData = casesRes.ok ? await casesRes.json() : {}
        const bugsData = bugsRes.ok ? await bugsRes.json() : {}
        const opData = opRes.ok ? await opRes.json() : {}

        const cases = casesData.testCases || []
        const bugsList = bugsData.bugReports || []

        setSummary({
          name: projData.project?.name || "Active Project",
          baseUrl: projData.project?.webAppUrl || "",
          environment: projData.project?.environment || "Dev",
          testCasesCount: cases.length,
          openBugsCount: bugsList.filter((b: any) => b.status === "Open").length,
          passRate: projData.project?.passRate || 0,
          trackerConnected: !!opData.connected
        })
      } catch (err) {
        console.error("Error fetching project summary:", err)
      } finally {
        setLoading(false)
      }
    }

    loadSummary()
  }, [projectId])

  return { summary, loading }
}

/**
 * Shared hook to load test case list metrics
 */
export interface ScrumMetrics {
  stories: {
    total: number
    open: number
    done: number
    byStatus: Record<string, number>
    completionPct: number
    totalPoints: number
  }
  byType: Record<string, number>
  activeSprint: { id: string; name: string; startDate: string | null; endDate: string | null } | null
}

/**
 * User-story counts per board column for the dashboard.
 *
 * Unlike the other hooks in this file, this doesn't download the full list to
 * count it — the endpoint aggregates in SQL and returns the numbers.
 */
export function useScrumMetrics(projectId: string | null) {
  const [metrics, setMetrics] = useState<ScrumMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) {
      setMetrics(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/projects/${projectId}/scrum/metrics`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setMetrics(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { metrics, loading }
}

export function useTestCaseMetrics(projectId: string | null) {
  const [metrics, setMetrics] = useState<{ total: number; manual: number; automated: number; untested: number }>({
    total: 0,
    manual: 0,
    automated: 0,
    untested: 0
  })

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/test-cases`)
      .then(res => res.json())
      .then(data => {
        const list = data.testCases || []
        const manual = list.filter((tc: any) => tc.executionType === "Manual").length
        const automated = list.filter((tc: any) => tc.executionType === "Automated").length
        setMetrics({
          total: list.length,
          manual,
          automated,
          untested: list.length - (manual + automated)
        })
      })
      .catch(() => {})
  }, [projectId])

  return metrics
}

/**
 * Shared hook to load bug reports metrics
 */
export function useBugMetrics(projectId: string | null) {
  const [metrics, setMetrics] = useState<{ total: number; open: number; fixed: number; closed: number }>({
    total: 0,
    open: 0,
    fixed: 0,
    closed: 0
  })

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/bug-reports`)
      .then(res => res.json())
      .then(data => {
        const list = data.bugReports || []
        setMetrics({
          total: list.length,
          open: list.filter((b: any) => b.status === "Open").length,
          fixed: list.filter((b: any) => b.status === "Fixed").length,
          closed: list.filter((b: any) => b.status === "Closed").length
        })
      })
      .catch(() => {})
  }, [projectId])

  return metrics
}

/**
 * Shared hook to load test run metrics
 */
export function useRunMetrics(projectId: string | null) {
  const [metrics, setMetrics] = useState<{ total: number; passed: number; failed: number }>({
    total: 0,
    passed: 0,
    failed: 0
  })

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/test-runs`)
      .then(res => res.json())
      .then(data => {
        const list = data.testRuns || []
        setMetrics({
          total: list.length,
          passed: list.filter((r: any) => r.status === "Passed").length,
          failed: list.filter((r: any) => r.status === "Failed").length
        })
      })
      .catch(() => {})
  }, [projectId])

  return metrics
}

/**
 * Shared hook to load OpenProject sync status metrics
 */
export function useOpenProjectSyncStatus(projectId: string | null) {
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; pendingSync: number }>({
    lastSync: null,
    pendingSync: 0
  })

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/integrations/sync-status`)
      .then(res => res.json())
      .then(data => {
        const syncMap = data.syncMap || {}
        const keys = Object.keys(syncMap)
        setSyncStatus({
          lastSync: keys.length > 0 ? new Date().toLocaleDateString() : null,
          pendingSync: keys.length
        })
      })
      .catch(() => {})
  }, [projectId])

  return syncStatus
}
