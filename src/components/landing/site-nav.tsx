"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Logo } from "@/components/landing/logo"
import { NAV } from "@/components/landing/features"

/**
 * Website navigation (SKILL.md B7): a compact translucent bar floating off the
 * top edge. On phones the toggle morphs into a close icon and opens a full
 * height panel whose links arrive one after another.
 */

export function SiteNav({ primary, signedIn }: { primary: { href: string; label: string }; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string>("")

  // Mark the section in view as the current page position.
  useEffect(() => {
    const ids = NAV.map((n) => n.href.slice(1))
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(`#${e.target.id}`)
      },
      { rootMargin: "-45% 0px -50% 0px" },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Lock page scroll and close on Escape while the phone menu is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div className="flex w-full max-w-fit items-center gap-2 rounded-2xl border border-white/10 bg-[#181818]/70 p-2 backdrop-blur-xl max-md:w-full max-md:max-w-none max-md:justify-between">
          <Link href="/" aria-label="QA Engine home" className={`rounded-lg px-2 py-1 ${focusRing}`}>
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={current === n.href ? "true" : undefined}
                className={`caption-1 rounded-lg px-3 py-2 transition-colors duration-300 ease-out-soft hover:bg-white/5 hover:text-white ${focusRing} ${
                  current === n.href ? "bg-white/10 text-white" : "text-white/60"
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {!signedIn && (
              <Link
                href="/login"
                className={`button-sm hidden rounded-lg px-3 py-2 text-white/70 transition-colors duration-300 ease-out-soft hover:bg-white/5 hover:text-white sm:inline-flex ${focusRing}`}
              >
                Sign in
              </Link>
            )}
            <Link
              href={primary.href}
              className={`button-sm hidden rounded-lg bg-white px-3 py-2 text-black transition-[transform,opacity] duration-300 ease-out-soft hover:opacity-90 active:scale-[0.98] sm:inline-flex ${focusRing}`}
            >
              {primary.label}
            </Link>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
              className={`relative grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/5 md:hidden ${focusRing}`}
            >
              {/* Two lines that rotate into an X: the icon morphs instead of swapping. */}
              <span
                className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-out-soft ${open ? "rotate-45" : "-translate-y-1"}`}
              />
              <span
                className={`absolute h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-out-soft ${open ? "-rotate-45" : "translate-y-1"}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Phone menu: full height panel, links step in 60ms apart. */}
      <div
        id="mobile-menu"
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/90 backdrop-blur-2xl transition-opacity duration-500 ease-out-soft md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <nav aria-label="Mobile" className="flex h-full flex-col gap-2 px-4 pb-8 pt-24">
          {[...NAV, ...(signedIn ? [] : [{ href: "/login", label: "Sign in" }])].map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${Math.min(i * 60, 400)}ms` : "0ms" }}
              className={`heading-5 rounded-xl px-3 py-3 text-white transition-[transform,opacity] duration-500 ease-out-soft hover:bg-white/5 ${focusRing} ${
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
            >
              {n.label}
            </a>
          ))}
          <Link
            href={primary.href}
            tabIndex={open ? 0 : -1}
            className={`button-md mt-auto inline-flex justify-center rounded-xl bg-white px-3 py-3 text-black active:scale-[0.98] ${focusRing}`}
          >
            {primary.label}
          </Link>
        </nav>
      </div>
    </>
  )
}
