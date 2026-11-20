import { redirect } from "next/navigation"

// Test runs are listed in the Automation Hub; a typed or old link lands there.
export default function TestRunsIndex({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/automation-hub`)
}
