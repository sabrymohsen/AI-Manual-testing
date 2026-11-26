"use client"

/**
 * Linear-style "new issue" composer pieces, shared by the Create Task / Epic /
 * Bug dialogs so they look and behave the same:
 *   ┌ breadcrumb ─────────────────────────────┐
 *   │ Big borderless title                     │
 *   │ Quiet description area(s)                │
 *   │ [chip] [chip] [chip] …  property row      │
 *   ├──────────────────────────────────────────┤
 *   │ ○ Create more            Cancel  Create ⌘↵│
 *   └──────────────────────────────────────────┘
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ChevronRight, Loader2, AlertCircle } from "@/components/ui/icons"

export function ComposerDialog({
  open,
  onOpenChange,
  crumbs,
  title,
  description,
  onSubmit,
  children,
  footerLeft,
  submitLabel,
  submitting,
  canSubmit,
  error,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Breadcrumb trail shown top-left, e.g. ["SHOP", "New issue"]. */
  crumbs: React.ReactNode[]
  /** Accessible dialog title (visually hidden — the crumbs carry it). */
  title: string
  description?: string
  onSubmit: () => void
  children: React.ReactNode
  footerLeft?: React.ReactNode
  submitLabel: string
  submitting?: boolean
  canSubmit: boolean
  error?: string | null
  wide?: boolean
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (canSubmit && !submitting) onSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={onKeyDown}
        className={cn(
          "top-[12vh] max-h-[80vh] translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%]",
          wide ? "sm:max-w-3xl" : "sm:max-w-2xl"
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
        <form
          className="flex max-h-[80vh] flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit && !submitting) onSubmit()
          }}
        >
          <div className="flex h-11 shrink-0 items-center gap-2 px-4 pr-12 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                <span className={cn("flex min-w-0 items-center gap-2", i === crumbs.length - 1 && "text-foreground")}>{c}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>

          {error && (
            <p
              role="alert"
              className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3 text-xs text-muted-foreground">{footerLeft}</div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
              <kbd className="hidden rounded bg-primary-foreground/20 px-1 font-sans text-xs sm:inline">⌘↵</kbd>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Large borderless title input. */
export const ComposerTitle = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function ComposerTitle({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          "w-full bg-transparent py-1 text-lg font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60",
          className
        )}
      />
    )
  }
)

/** Borderless, auto-growing text area for description-like sections. */
export function ComposerText({
  label,
  hint,
  value,
  onChange,
  placeholder,
  minRows = 2,
  id,
}: {
  label?: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  id?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [value])
  return (
    <div className="group/text mt-2">
      {label && (
        <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={minRows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
      />
      {hint && <p className="text-xs text-muted-foreground/80 opacity-0 transition-opacity group-focus-within/text:opacity-100">{hint}</p>}
    </div>
  )
}

/** Row that holds the property chips. */
export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)}>{children}</div>
}

/** The trigger look for a property chip (use with asChild on menu/popover triggers). */
export const ChipButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function ChipButton({ className, active, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 max-w-[14rem] items-center gap-2 rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-accent"
          : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  )
})

/** Small "Create more" switch for the footer. */
export function CreateMoreToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </button>
      Create more
    </label>
  )
}

/**
 * A native <select> dressed as a property chip — keeps keyboard and mobile
 * pickers for free. Shows `placeholder` (dashed) until a value is chosen.
 */
export function ChipSelect({
  icon,
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const current = options.find((o) => o.value === value)
  const active = !!value && !!current
  return (
    <label
      className={cn(
        "relative inline-flex h-7 max-w-[14rem] cursor-pointer items-center gap-2 rounded-md border px-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
        active
          ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-accent"
          : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      title={label}
    >
      {icon}
      <span className="truncate">{active ? current!.label : placeholder ?? label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Small section heading inside the composer body. */
export function ComposerSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
