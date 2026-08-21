/**
 * Back-compat shim.
 *
 * Bug-board creation is no longer OpenProject-specific: it lives in the
 * provider-agnostic core (src/lib/integrations/core/create-bug-board) and runs
 * against whichever tracker the project is connected to, via the optional
 * `createStatusBoard` provider capability. This module re-exports it under the
 * historical path so existing callers keep working.
 */
export {
  planBugBoardColumns,
  createBugWorkflowBoard,
  resolveBugType,
  type BugBoardColumnPlan,
  type CreateBugBoardResult,
} from "@/lib/integrations/core/create-bug-board"
