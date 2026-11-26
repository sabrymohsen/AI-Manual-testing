"use client"

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger" | "warning"
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * In-app replacement for window.confirm (SKILL.md B9: no browser dialogs).
 *   const confirm = useConfirm()
 *   if (await confirm({ title: "Delete this issue?", variant: "danger" })) …
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error("useConfirm must be used inside AlertProvider")
  return fn
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const originalAlert = window.alert
    // Any leftover window.alert shows the app's own dialog instead.
    window.alert = (message: any) => setAlertMessage(String(message))
    return () => {
      window.alert = originalAlert
    }
  }, [])

  const confirm = useCallback<ConfirmFn>((options) => {
    resolver.current?.(false)
    setPending(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={alertMessage !== null}
        title="Message"
        description={alertMessage || ""}
        confirmLabel="OK"
        showCancel={false}
        variant="warning"
        onConfirm={() => setAlertMessage(null)}
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ""}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        cancelLabel={pending?.cancelLabel ?? "Cancel"}
        variant={pending?.variant ?? "default"}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
