"use client"

import { useEffect, useState } from "react"
import { Apple, Download, Monitor } from "lucide-react"

/**
 * Desktop app download links under the login / sign-up form.
 * Files are served by the web server at /downloads (see deploy/oracle/Caddyfile).
 * Hidden inside the desktop app itself.
 */
const FILES = {
  macArm: { href: "/downloads/QA-Engine-mac-arm64.dmg", label: "Mac (Apple chip)" },
  macIntel: { href: "/downloads/QA-Engine-mac-x64.dmg", label: "Mac (Intel)" },
  windows: { href: "/downloads/QA-Engine-Setup.exe", label: "Windows" },
}

type Os = "mac" | "windows" | "other"

export function DesktopDownloads() {
  const [os, setOs] = useState<Os>("other")
  const [inApp, setInApp] = useState(false)

  useEffect(() => {
    const w = window as unknown as { qaDesktop?: { isDesktop?: boolean } }
    setInApp(!!w.qaDesktop?.isDesktop || navigator.userAgent.includes("QAEngineDesktop"))
    const ua = navigator.userAgent
    setOs(/Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "mac" : "other")
  }, [])

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
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
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
        First launch: on Mac right-click the app → Open; on Windows click More info → Run anyway.
      </p>
    </div>
  )
}
