"use client"

import { Fragment, useEffect, useRef } from "react"

/**
 * Scroll reveals (SKILL.md B7): every `.reveal` element rises 32px and fades in
 * once when it enters the viewport. One IntersectionObserver, no scroll handler.
 */
export function RevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)"))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add("is-visible")
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return null
}

/**
 * Tagline reveal (SKILL.md B11): words light up one at a time, in reading order,
 * as the section scrolls past a trigger line. The scroll listener is passive and
 * throttled through requestAnimationFrame. Reduced motion shows the final text.
 */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const words = Array.from(root.querySelectorAll<HTMLElement>(".tagline-word"))
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((w) => w.classList.add("is-on"))
      return
    }
    let frame = 0
    let lit = 0
    const update = () => {
      frame = 0
      const rect = root.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the block's top reaches 85% of the viewport, 1 when its bottom reaches 45%.
      const start = vh * 0.85
      const end = vh * 0.45
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end + rect.height)))
      const target = Math.round(progress * words.length)
      // Words only ever switch on, so the reveal plays once.
      for (let i = lit; i < target; i++) words[i].classList.add("is-on")
      lit = Math.max(lit, target)
      if (lit >= words.length) window.removeEventListener("scroll", onScroll)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <p ref={ref} className="heading-2 mx-auto max-w-[680px] text-center max-sm:text-4xl">
      {lines.map((line, li) => (
        <Fragment key={li}>
          {line.split(" ").map((w, wi) => (
            <Fragment key={wi}>
              <span className="tagline-word">{w}</span>{" "}
            </Fragment>
          ))}
          {li < lines.length - 1 && <br className="max-sm:hidden" />}
        </Fragment>
      ))}
    </p>
  )
}
