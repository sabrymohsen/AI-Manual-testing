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
    opConnected: boolean
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
          fetch(`/api/projects/${projectId}/integrations/openproject`)
        ])

        const projData = projRes.ok ? await projRes.json() : {}
        const casesData = casesRes.ok ? await casesRes.json() : {}
        const bugsData = bugsRes.ok ? await bugsRes.json() : {}
        const opData = opRes.ok ? await opRes.json() : {}

        const cases = casesData.testCases || []
        const bugsList = bugsData.bugReports || []

        setSummary({
          name: projData.project?.name || "Active Project",
          baseUrl: projData.project?.baseUrl || "",
          environment: projData.project?.environment || "Dev",
          testCasesCount: cases.length,
          openBugsCount: bugsList.filter((b: any) => b.status === "Open").length,
          passRate: projData.project?.passRate || 0,
          opConnected: !!opData.integration?.hasToken
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
