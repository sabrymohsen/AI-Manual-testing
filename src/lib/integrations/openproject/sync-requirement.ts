/**
 * Back-compat shim.
 *
 * Requirement (user-story) sync now lives in the provider-agnostic engine
 * (src/lib/integrations/core/sync-requirement). Re-exported here under the
 * historical names so existing routes keep working while routing through the
 * WorkItemProvider abstraction.
 */
import {
  syncRequirement,
  importUserStories,
  type StorySyncResult,
  type StoryImportResult,
} from "@/lib/integrations/core/sync-requirement"

export type { StorySyncResult, StoryImportResult }

export function syncRequirementToOpenProject(requirementId: string): Promise<StorySyncResult> {
  return syncRequirement(requirementId)
}

export function importUserStoriesFromOpenProject(projectId: string): Promise<StoryImportResult> {
  return importUserStories(projectId)
}
