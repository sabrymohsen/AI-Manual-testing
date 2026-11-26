"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A number that counts up to its value when it first appears or changes,
 * easing out on the app's motion curve. Reduced motion shows the value at once.
 */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !Number.isFinite(value)) {
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // cubic-bezier(0.22, 1, 0.36, 1) is close to easeOutQuint
      const eased = 1 - Math.pow(1 - t, 5)
      setShown(Math.round(a + (value - a) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span className={className}>{shown}</span>
}
