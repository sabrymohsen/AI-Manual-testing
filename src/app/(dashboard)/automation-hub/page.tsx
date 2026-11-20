import { ActiveProjectRedirect } from "@/components/ui/active-project-redirect"

export default function AutomationHubRootPage() {
  return (
    <ActiveProjectRedirect
      workflow="automation-hub"
      title="Automation Hub"
      description="Choose a project to write, record and run its automated tests."
    />
  )
}
