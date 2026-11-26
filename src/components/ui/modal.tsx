"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@/lib/utils"

/**
 * Accessible stand-in for hand-made "fixed inset-0" overlays: focus is trapped,
 * Escape and a click outside close it, and it stacks correctly with other
 * dialogs. Pass the panel's own classes in `className`.
 */
export function Modal({
  onClose,
  label,
  className,
  overlayClassName,
  children,
}: {
  onClose: () => void
  /** Read out by screen readers as the dialog's name. */
  label: string
  className?: string
  overlayClassName?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0", overlayClassName)} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn("fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
