/**
 * Back-compat shim.
 *
 * The bug-sync logic now lives in the provider-agnostic engine
 * (src/lib/integrations/core/sync-bug-report). This module re-exports it under
 * the historical name so existing callers keep working while routing through the
 * WorkItemProvider abstraction (OpenProject / Jira / Azure DevOps / ClickUp).
 */
import { syncBugReport, type BugSyncResult } from "@/lib/integrations/core/sync-bug-report"

export type { BugSyncResult }

export function syncBugReportToOpenProject(
  bugId: string,
  opts: { requireAutoFlag?: boolean } = {}
): Promise<BugSyncResult> {
  return syncBugReport(bugId, opts)
}
