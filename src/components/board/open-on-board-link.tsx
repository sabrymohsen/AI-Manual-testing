import Link from "next/link"
import { LayoutGrid } from "lucide-react"

/**
 * Chip that deep-links from a test case / bug back to the board, opening the
 * linked user story's drawer (board reads ?story=<requirementId>).
 */
export function OpenOnBoardLink({
  projectId, requirementId, requirementKey, className,
}: {
  projectId: string
  requirementId: string
  requirementKey: string
  className?: string
}) {
  return (
    <Link
      href={`/projects/${projectId}/board?story=${requirementId}`}
      title={`Open ${requirementKey} on the board`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors ${className || ""}`}
    >
      <LayoutGrid className="h-3 w-3" /> {requirementKey}
    </Link>
  )
}
