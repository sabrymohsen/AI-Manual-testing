import { QueryProvider } from "@/components/providers/query-provider"

/**
 * Scoped layout for the test library. Mounts React Query only for this subtree,
 * mirroring how the scrum board does it, so the rest of the app (which still
 * uses imperative fetch) is unaffected.
 */
export default function TestCasesLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
