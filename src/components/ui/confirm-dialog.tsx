"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, RefreshCw } from "lucide-react"

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (variant === "danger" || variant === "warning") {
      return
    }
    onCancel?.()
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (variant !== "danger" && variant !== "warning") {
          onCancel?.()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, variant, onCancel])

  if (!open) return null

  let headerIcon = null
  let confirmButtonClass = "rounded-xl font-semibold text-xs h-9 "

  if (variant === "danger") {
    headerIcon = <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 animate-pulse" />
    confirmButtonClass += "bg-rose-600 hover:bg-rose-700 text-white"
  } else if (variant === "warning") {
    headerIcon = <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
    confirmButtonClass += "bg-amber-600 hover:bg-amber-700 text-white"
  } else {
    confirmButtonClass += "bg-indigo-600 hover:bg-indigo-700 text-white"
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md p-6 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl bg-background space-y-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {headerIcon}
          <div className="space-y-1.5 flex-1">
            <h3 className="text-lg font-black text-slate-950 dark:text-slate-50">{title}</h3>
            {description && (
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">{description}</p>
            )}
          </div>
        </div>

        {apiError && (
          <div className="p-3 bg-rose-50/50 dark:bg-rose-955/10 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-455 font-semibold leading-relaxed animate-in fade-in">
            {apiError}
          </div>
        )}

        {requireTextConfirmation && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
              To confirm, type <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">"{requireTextConfirmation}"</span>:
            </label>
            <Input
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              placeholder={`Type "${requireTextConfirmation}"`}
              className="rounded-xl h-9 text-xs"
              disabled={isLoading}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {showCancel && (
            <Button
              variant="outline"
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-xl text-xs h-9"
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={confirmButtonClass}
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" /> Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
