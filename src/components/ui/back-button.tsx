"use client"

import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"

export function BackButton() {
  const router = useRouter()
  const pathname = usePathname()

  // Do not show back button on root/home/dashboard pages
  const isRootPage = ["/dashboard", "/projects", "/test-cases", "/bug-reports", "/settings"].includes(pathname)
  if (isRootPage) return null

  return (
    <div className="flex items-center mb-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
    </div>
  )
}
