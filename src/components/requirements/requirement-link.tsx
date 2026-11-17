import Link from "next/link"
import { LayoutGrid } from "lucide-react"

/**
 * Chip that links a test case / bug to its user story (requirement). It used
 * to open the story on the old Requirement board, which was retired in favour
 * of the Scrum Board; requirements open on their own page now.
 */
export function RequirementLink({
  projectId, requirementId, requirementKey, className,
}: {
  projectId: string
  requirementId: string
  requirementKey: string
  className?: string
}) {
  return (
    <Link
      href={`/projects/${projectId}/requirements/${requirementId}`}
      title={`Open ${requirementKey}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary dark:bg-primary/15 dark:text-indigo-300 hover:bg-primary/15 dark:hover:bg-primary/25 transition-colors ${className || ""}`}
    >
      <LayoutGrid className="h-3 w-3" /> {requirementKey}
    </Link>
  )
}
