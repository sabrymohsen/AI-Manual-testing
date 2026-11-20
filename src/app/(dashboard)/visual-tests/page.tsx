import { ActiveProjectRedirect } from "@/components/ui/active-project-redirect"

export default function VisualTestsRootPage() {
  return (
    <ActiveProjectRedirect workflow="visual-tests" title="Visual Tests" description="Choose a project to see and run its visual tests." />
  )
}
