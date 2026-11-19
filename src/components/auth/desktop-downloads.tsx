"use client"

import { useEffect, useState } from "react"
import { Apple, Download, Monitor } from "lucide-react"

/**
 * Desktop app download links (login / sign-up pages and the website).
 * Files are served by the web server at /downloads (see deploy/oracle/Caddyfile),
 * with /downloads/latest.json naming the current version.
 * Hidden inside the desktop app itself.
 */
const FILES = {
  macArm: { href: "/downloads/QA-Engine-mac-arm64.dmg", label: "Mac (Apple chip)", hint: "M1, M2, M3, M4" },
  macIntel: { href: "/downloads/QA-Engine-mac-x64.dmg", label: "Mac (Intel)", hint: "Older Macs" },
  windows: { href: "/downloads/QA-Engine-Setup.exe", label: "Windows", hint: "Windows 10 and 11" },
}

type Os = "mac" | "windows" | "other"

function useDesktopEnv() {
  const [os, setOs] = useState<Os>("other")
  const [inApp, setInApp] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    const w = window as unknown as { qaDesktop?: { isDesktop?: boolean } }
    setInApp(!!w.qaDesktop?.isDesktop || navigator.userAgent.includes("QAEngineDesktop"))
    const ua = navigator.userAgent
    setOs(/Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "mac" : "other")
    fetch("/downloads/latest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.version && setVersion(d.version))
      .catch(() => {})
  }, [])
  return { os, inApp, version }
}

/** Compact block under the login / sign-up form (dark page). */
export function DesktopDownloads() {
  const { os, inApp } = useDesktopEnv()
  if (inApp) return null

  const link = (f: { href: string; label: string }, primary: boolean, icon: React.ReactNode) => (
    <a
      key={f.href}
      href={f.href}
      download
      className={
        primary
          ? "flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-violet-500"
          : "flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-violet-400/50 hover:text-foreground"
      }
    >
      {icon}
      {f.label}
    </a>
  )
  const mac = <Apple className="h-3.5 w-3.5" />
  const win = <Monitor className="h-3.5 w-3.5" />

  return (
    <div id="download" className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Download className="h-4 w-4 text-violet-400" /> Get the desktop app
      </p>
      <p className="text-[12px] text-muted-foreground">Same account, its own window, signs you in to this server.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {link(FILES.macArm, os === "mac", mac)}
        {link(FILES.macIntel, false, mac)}
        {link(FILES.windows, os === "windows", win)}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        First launch: on Mac open System Settings → Privacy &amp; Security → Open Anyway; on Windows click More info → Run anyway.
      </p>
    </div>
  )
}

/** Large download cards for the website (light, theme tokens). */
export function DesktopDownloadCards() {
  const { os, inApp, version } = useDesktopEnv()

  const cards = [
    { ...FILES.macArm, icon: Apple, recommended: os === "mac" },
    { ...FILES.macIntel, icon: Apple, recommended: false },
    { ...FILES.windows, icon: Monitor, recommended: os === "windows" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.href}
            href={c.href}
            download
            className={`group relative flex flex-col gap-3 rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
              c.recommended ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/20" : "border-border bg-card"
            }`}
          >
            {c.recommended && (
              <span className="absolute end-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                For this computer
              </span>
            )}
            <c.icon className="h-6 w-6 text-foreground" />
            <div>
              <p className="text-[15px] font-semibold text-foreground">{c.label}</p>
              <p className="text-[12px] text-muted-foreground">{c.hint}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
              <Download className="h-3.5 w-3.5" /> Download{version ? ` v${version}` : ""}
            </span>
          </a>
        ))}
      </div>
      {inApp && <p className="text-[12px] text-muted-foreground">You&apos;re already using the desktop app.</p>}
    </div>
  )
}
