"use client"

/**
 * useProjectIntegration — resolves the connected provider's display name for a
 * project so UI labels reflect whichever tool the user integrated with (Jira /
 * Azure DevOps / ClickUp / OpenProject). Falls back to "tracker" when unknown.
 */
import { useEffect, useState } from "react"

interface ProviderInfo {
  provider: string | null
  name: string
  connected: boolean
}

export function useProjectIntegration(projectId: string | null | undefined): ProviderInfo {
  const [info, setInfo] = useState<ProviderInfo>({ provider: null, name: "tracker", connected: false })

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetch(`/api/projects/${projectId}/integrations/provider`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setInfo({ provider: data.provider, name: data.name, connected: data.connected })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  return info
}
