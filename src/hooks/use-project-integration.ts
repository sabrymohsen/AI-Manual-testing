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

// Many parts of a page ask for this at once (a bug page asked up to 6 times):
// share one request per project for a short while.
const cache = new Map<string, { at: number; promise: Promise<any> }>()
function providerInfo(projectId: string) {
  const hit = cache.get(projectId)
  if (hit && Date.now() - hit.at < 30_000) return hit.promise
  const promise = fetch(`/api/projects/${projectId}/integrations/provider`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  cache.set(projectId, { at: Date.now(), promise })
  return promise
}

export function useProjectIntegration(projectId: string | null | undefined): ProviderInfo {
  const [info, setInfo] = useState<ProviderInfo>({ provider: null, name: "tracker", connected: false })

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    providerInfo(projectId)
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
