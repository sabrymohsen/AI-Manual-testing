"use client"

import { useEffect, useRef } from "react"

/** True when a keypress is going into a field or rich-text editor, not the page. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as Partial<HTMLElement> & { closest?: (s: string) => Element | null }
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : ""
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (el.isContentEditable) return true
  return typeof el.closest === "function" && el.closest("[contenteditable=''],[contenteditable='true']") !== null
}

/**
 * Linear-style board shortcuts: "/" focuses search, "C" creates an issue.
 * Ignored while typing, with a modifier held, or when the handler is absent.
 */
export function useBoardShortcuts(opts: { onSearch?: () => void; onCreate?: () => void; enabled: boolean }) {
  const ref = useRef(opts)
  ref.current = opts

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { onSearch, onCreate, enabled } = ref.current
      if (!enabled || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      // A dialog or menu is open: let it own the keyboard.
      if (document.querySelector("[role='dialog'][data-state='open'],[role='menu'][data-state='open']")) return
      if (e.key === "/" && onSearch) {
        e.preventDefault()
        onSearch()
      } else if ((e.key === "c" || e.key === "C") && !e.shiftKey && onCreate) {
        e.preventDefault()
        onCreate()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
