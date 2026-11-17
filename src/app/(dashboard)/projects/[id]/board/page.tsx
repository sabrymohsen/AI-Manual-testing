import { redirect } from "next/navigation"

// The old Requirement board was retired: its sprints never reached the
// reports and it duplicated the Scrum Board. Old links and bookmarks land on
// the Scrum Board instead of a 404.
export default function OldBoardRedirect({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const view = searchParams.tab === "backlog" || searchParams.tab === "epics" ? "?view=backlog" : ""
  redirect(`/projects/${params.id}/scrum${view}`)
}
