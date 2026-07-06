"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
  Loader2, RefreshCw, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { OpenProjectGroupSyncPanel } from "./openproject-group-sync-panel"

interface GroupOpStatus {
  parentMapped: boolean
  parentId: string | null
  parentSubject: string | null
  parentUrl: string | null
  syncedCount: number
  failedSyncCount: number
  boardReadyCount: number
  lastSyncAt: string | null
}

interface ModuleConfigStatus {
  hasOwnConfig: boolean
  configured: boolean
  complete: boolean
  lastSyncStatus: string | null
  lastSyncError: string | null
  lastSyncAt: string | null
}

interface GroupInfo {
  groupId: string
  groupType: string
  groupName: string
  totalCases: number
  passed: number
  failed: number
  untested: number
  openProject: GroupOpStatus
  moduleConfig: ModuleConfigStatus
}

interface Props {
  projectId: string
}

export function OpenProjectModuleGroupsSection({ projectId }: Props) {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/groups`)
      const data = await res.json()
      if (res.ok) {
        setGroups(data.groups || [])
      } else {
        setError(data.error || "Failed to load groups")
      }
    } catch (err: any) {
      setError(err.message || "Network error loading groups")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadGroups() }, [loadGroups])

  const totalSynced = groups.reduce((s, g) => s + g.openProject.syncedCount, 0)
  const totalCases  = groups.reduce((s, g) => s + g.totalCases, 0)

  return (
    <div className="border rounded-xl bg-card/30">
      {/* ── Section Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-accent/10 border-b">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 text-sm font-bold text-foreground/80 hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Feature Coverage
          {!loading && !error && groups.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {groups.length} modules
              {totalCases > 0 && (
                <> · <span className={totalSynced === totalCases ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}>{totalSynced}/{totalCases}</span> test cases synced</>
              )}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadGroups}
          disabled={loading}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Refresh module status"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {!collapsed && (
        <div className="p-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 py-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* No modules */}
          {!loading && !error && groups.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No modules found. Create modules to organise test cases by group.
            </div>
          )}

          {/* ── Cards Grid ────────────────────────────────────────────── */}
          {!loading && !error && groups.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {groups.map(group => {
                const hasRuns   = group.passed > 0 || group.failed > 0
                const runTotal  = group.passed + group.failed
                // Pass rate only over executed cases, not total — avoids the "0%" illusion
                const passRate  = runTotal > 0 ? Math.round((group.passed / runTotal) * 100) : 0

                return (
                  <div
                    key={group.groupId}
                    className="border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col"
                  >
                    {/* ── Zone 1: Name + count ───────────────────────── */}
                    <div className="px-4 pt-4 pb-3">
                      <div className="min-w-0">
                        <h3
                          className="font-bold text-sm leading-tight"
                          dir="auto"
                          title={group.groupName}
                        >
                          {group.groupName}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                          {group.totalCases} test case{group.totalCases !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mx-4 border-t" />

                    {/* ── Zone 2: Execution progress ─────────────────── */}
                    <div className="px-4 py-3">
                      {group.totalCases === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No test cases yet</p>
                      ) : !hasRuns ? (
                        /* Untested — never show a red/0% bar */
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" dir="ltr">
                          <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                          <span>
                            {group.totalCases} case{group.totalCases !== 1 ? "s" : ""} · not run yet
                          </span>
                        </div>
                      ) : (
                        /* Some runs recorded */
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2" dir="ltr">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${passRate}%`,
                                  backgroundColor:
                                    passRate === 100 ? "#10b981"
                                    : passRate >= 50  ? "#f59e0b"
                                    :                   "#ef4444",
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground w-8 shrink-0 text-right">
                              {passRate}%
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground" dir="ltr">
                            {group.passed > 0 && (
                              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 className="h-2.5 w-2.5" /> {group.passed} passed
                              </span>
                            )}
                            {group.failed > 0 && (
                              <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400 font-semibold">
                                <XCircle className="h-2.5 w-2.5" /> {group.failed} failed
                              </span>
                            )}
                            {group.untested > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" /> {group.untested} not run
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mx-4 border-t" />

                    {/* ── Zone 3: OpenProject panel ──────────────────── */}
                    <div className="px-4 py-3 flex-1">
                      <OpenProjectGroupSyncPanel
                        projectId={projectId}
                        groupId={group.groupId}
                        groupName={group.groupName}
                        totalCases={group.totalCases}
                        opStatus={group.openProject}
                        moduleConfig={(group as any).featureConfig || group.moduleConfig}
                        onStatusRefresh={loadGroups}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
