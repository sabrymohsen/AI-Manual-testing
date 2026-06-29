"use client"

import { useParams } from "next/navigation"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { OpenProjectModuleGroupsSection } from "@/components/integrations/openproject-module-groups-section"
import { Globe, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react"
import { useState, useEffect } from "react"

export default function ScopedOpenProjectSyncPage() {
  const params = useParams()
  const projectId = params.id as string
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<any>(null)

  const fetchStatus = () => {
    fetch(`/api/projects/${projectId}/integrations/openproject`)
      .then(res => res.json())
      .then(data => setStatus(data.integration))
      .catch(err => console.error("Error loading OP connection status:", err))
  }

  useEffect(() => {
    fetchStatus()
  }, [projectId])

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/sync`, {
        method: "POST"
      })
      if (res.ok) {
        alert("OpenProject background sync task triggered successfully!")
      } else {
        alert("Failed to trigger OpenProject sync.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      <AppPageHeader 
        title="OpenProject Sync Center"
        subtitle="Manage daily defect triage, folder hierarchy synchronization, parent work packages, and results syncing."
        breadcrumb="QA Workflows > OpenProject Sync"
        primaryAction={{
          label: syncing ? "Syncing..." : "Sync Now",
          onClick: handleSyncAll,
          icon: RefreshCw
        }}
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
          <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block">Connection Health</span>
          <div className="flex items-center gap-2">
            {status?.hasToken ? (
              <span className="text-emerald-600 font-extrabold text-sm flex items-center gap-1">
                <ShieldCheck className="h-4.5 w-4.5" /> Healthy Connection
              </span>
            ) : (
              <span className="text-amber-500 font-extrabold text-sm flex items-center gap-1">
                <AlertTriangle className="h-4.5 w-4.5" /> Credentials Required
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground font-medium">
            Status checks base URL endpoint and verified auth token validation.
          </p>
        </div>

        <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
          <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block">Project Key mapping</span>
          <span className="font-extrabold text-slate-800 text-sm block">
            {status?.openprojectProjectId || "Not Mapped"}
          </span>
          <p className="text-[10px] text-muted-foreground font-medium">
            Defects and test runs will target this remote project reference.
          </p>
        </div>

        <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
          <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block">Target Server</span>
          <span className="font-extrabold text-slate-800 text-sm block truncate">
            {status?.hostUrl ? status.hostUrl.replace(/^https?:\/\//, "") : "N/A"}
          </span>
          <p className="text-[10px] text-muted-foreground font-medium">
            OpenProject host server configured in project integrations.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* OP Module Sync Details Section */}
        <OpenProjectModuleGroupsSection projectId={projectId} />
      </div>
    </div>
  )
}
