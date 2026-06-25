"use client"

import React, { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertMessage, setAlertMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const originalAlert = window.alert
    
    // Override window.alert globally
    window.alert = (message: any) => {
      setAlertMessage(String(message))
    }

    return () => {
      window.alert = originalAlert
    }
  }, [])

  return (
    <>
      {children}
      <ConfirmDialog
        open={alertMessage !== null}
        title="System Message"
        description={alertMessage || ""}
        confirmLabel="OK"
        showCancel={false}
        variant="warning"
        onConfirm={() => setAlertMessage(null)}
      />
    </>
  )
}
