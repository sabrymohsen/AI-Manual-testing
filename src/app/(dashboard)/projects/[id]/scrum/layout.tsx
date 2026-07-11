import { QueryProvider } from "@/components/providers/query-provider"

/**
 * Scoped layout for the spec-literal Scrum board. Mounts React Query only for
 * this subtree so the rest of the app is unaffected. (The toast host lives in
 * the dashboard layout.)
 */
export default function ScrumLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
