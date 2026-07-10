import { QueryProvider } from "@/components/providers/query-provider"
import { Toaster } from "@/components/ui/sonner"

/**
 * Scoped layout for the spec-literal Scrum board. Mounts React Query + a toast
 * host only for this subtree so the rest of the app is unaffected.
 */
export default function ScrumLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster position="top-right" richColors />
    </QueryProvider>
  )
}
