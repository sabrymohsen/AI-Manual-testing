import { QueryProvider } from "@/components/providers/query-provider"

/**
 * Scoped layout for the Analytics Dashboard. Mounts React Query for this subtree
 * (the rest of the app doesn't use it), mirroring the Scrum board's setup.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
