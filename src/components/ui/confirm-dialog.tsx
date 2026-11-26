"use client"

import React, { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle } from "@/components/ui/icons"

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger" | "warning"
  isLoading?: boolean
  requireTextConfirmation?: string
  onConfirm: () => Promise<void> | void
  onCancel?: () => void
  showCancel?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading: externalIsLoading,
  requireTextConfirmation,
  onConfirm,
  onCancel,
  showCancel = true
}: ConfirmDialogProps) {
  const [typedConfirmation, setTypedConfirmation] = useState("")
  const [internalIsLoading, setInternalIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const isLoading = externalIsLoading || internalIsLoading
  const isConfirmDisabled =
    isLoading ||
    (!!requireTextConfirmation && typedConfirmation !== requireTextConfirmation)

  const handleConfirm = async () => {
    setApiError(null)
    setInternalIsLoading(true)
    try {
      await onConfirm()
    } catch (err: any) {
      setApiError(err?.message || "An unexpected error occurred. Please try again.")
    } finally {
      setInternalIsLoading(false)
    }
  }

  let headerIcon = null
  let confirmButtonClass = "button-sm "

  if (variant === "danger") {
    headerIcon = <AlertTriangle weight="fill" className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
    confirmButtonClass += "bg-rose-600 hover:bg-rose-700 text-white"
  } else if (variant === "warning") {
    headerIcon = <AlertTriangle weight="fill" className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
    confirmButtonClass += "bg-amber-600 hover:bg-amber-700 text-white"
  } else {
    confirmButtonClass += "bg-primary hover:bg-primary/90 text-primary-foreground"
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && showCancel && !isLoading && onCancel?.()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          aria-describedby={description ? "confirm-dialog-description" : undefined}
          onInteractOutside={(e) => {
            // Danger and warning dialogs only close through their buttons.
            if (variant !== "default") e.preventDefault()
          }}
          className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-6 rounded-2xl border border-border bg-background p-6 text-left shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
        <div className="flex items-start gap-3">
          {headerIcon}
          <div className="flex-1 space-y-2">
            <DialogPrimitive.Title className="heading-6 text-foreground">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description id="confirm-dialog-description" className="body-6 text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
        </div>

        {apiError && (
          <div role="alert" className="body-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {apiError}
          </div>
        )}

        {requireTextConfirmation && (
          <div className="space-y-2">
            <label htmlFor="confirm-dialog-text" className="caption-1 block text-muted-foreground">
              To confirm, type <span className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{requireTextConfirmation}</span>
            </label>
            <Input
              id="confirm-dialog-text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              placeholder={`Type ${requireTextConfirmation}`}
              disabled={isLoading}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          {showCancel && (
            <Button variant="outline" type="button" onClick={onCancel} disabled={isLoading} className="button-sm">
              {cancelLabel}
            </Button>
          )}
          <Button type="button" onClick={handleConfirm} disabled={isConfirmDisabled} className={confirmButtonClass} autoFocus>
            {isLoading ? "Working…" : confirmLabel}
          </Button>
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
