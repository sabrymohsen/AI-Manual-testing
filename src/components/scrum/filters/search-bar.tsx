"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"

/** Debounced (300ms) search input. Reports the committed value upward. */
export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search tasks or SYS-101…"
        className="h-9 w-full rounded-full border-0 bg-muted pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {local && (
        <button
          onClick={() => setLocal("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
