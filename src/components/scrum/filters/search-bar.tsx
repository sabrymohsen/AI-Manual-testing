"use client"

import { forwardRef, useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"

/** Debounced (300ms) search input. Reports the committed value upward. */
export const SearchBar = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; boardKey?: string | null }
>(function SearchBar({ value, onChange, boardKey }, ref) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Keep in sync if the URL value changes externally (e.g. back button).
  useEffect(() => setLocal(value), [value])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 300)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  return (
    <div className="relative w-36 transition-[width] focus-within:w-60 xl:w-48">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={local}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur()
        }}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={`Search or ${boardKey || "KEY"}-12`}
        className="peer h-7 w-full rounded-md border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
      {!local && (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1 font-sans text-[10px] text-muted-foreground peer-focus:hidden">
          /
        </kbd>
      )}
      {local && (
        <button
          onClick={() => setLocal("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
})
