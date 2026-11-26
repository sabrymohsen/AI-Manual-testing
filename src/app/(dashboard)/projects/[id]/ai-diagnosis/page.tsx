import { redirect } from "next/navigation"

/**
 * Retired page: this tool now lives in the Automation Hub. The old page
 * carried placeholder actions (simulated downloads, settings that didn't
 * save), so old links go straight to the working version.
 */
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/automation-hub?tab=Diagnosis`)
}
