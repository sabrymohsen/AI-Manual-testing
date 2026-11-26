"use client"

import { useEffect, useState } from "react"
import { Apple, Download, Monitor } from "@/components/ui/icons"
import { AppleLogo, DownloadSimple, WindowsLogo } from "@phosphor-icons/react"

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
          ? "flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
          : "flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-violet-400/50 hover:text-foreground"
      }
    >
      {icon}
      {f.label}
    </a>
  )
  const mac = <Apple className="h-3.5 w-3.5" />
  const win = <Monitor className="h-3.5 w-3.5" />

  return (
    <div id="download" className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Download className="h-4 w-4 text-violet-400" /> Get the desktop app
      </p>
      <p className="text-xs text-muted-foreground">Same account, its own window, signs you in to this server.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {link(FILES.macArm, os === "mac", mac)}
        {link(FILES.macIntel, false, mac)}
        {link(FILES.windows, os === "windows", win)}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        First launch: on Mac open System Settings → Privacy &amp; Security → Open Anyway. On Windows, if the browser holds the file, open
        Downloads (Ctrl+J) → ⋯ → Keep → Keep anyway; then More info → Run anyway.{" "}
        <a href="/downloads/QA-Engine-win.zip" download className="underline hover:text-foreground">
          Windows .zip
        </a>
      </p>
    </div>
  )
}

/** Large download cards for the website (dark landing page). */
export function DesktopDownloadCards() {
  const { os, inApp, version } = useDesktopEnv()

  const cards = [
    { ...FILES.macArm, icon: AppleLogo, recommended: os === "mac" },
    { ...FILES.macIntel, icon: AppleLogo, recommended: false },
    { ...FILES.windows, icon: WindowsLogo, recommended: os === "windows" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.href}
            href={c.href}
            download
            className={`group relative flex flex-col gap-4 rounded-2xl border p-6 outline-none transition-[transform,background-color] duration-300 ease-out-soft hover:-translate-y-0.5 hover:bg-[#1F1F1F] focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98] ${
              c.recommended ? "border-white/30 bg-[#181818]" : "border-white/10 bg-[#181818]"
            }`}
          >
            {c.recommended && (
              <span className="caption-3 absolute end-4 top-4 rounded-md bg-white px-2 py-0.5 text-black">For this computer</span>
            )}
            <c.icon weight="fill" className="h-6 w-6 text-white" aria-hidden />
            <div>
              <p className="title-3 text-white">{c.label}</p>
              <p className="caption-2 text-white/50">{c.hint}</p>
            </div>
            <span className="button-sm mt-auto inline-flex items-center gap-2 text-white/80 group-hover:text-white">
              <DownloadSimple className="h-4 w-4" aria-hidden /> Download{version ? ` v${version}` : ""}
            </span>
          </a>
        ))}
      </div>
      <p className="caption-2 text-white/50">
        Windows installer blocked by your browser or company? Use the{" "}
        <a href="/downloads/QA-Engine-win.zip" download className="font-medium text-white underline underline-offset-4 hover:text-white/80">
          Windows .zip
        </a>
        . Unzip it and open <span className="font-medium text-white">QA Engine.exe</span>, no install needed.
      </p>
      {inApp && <p className="caption-2 text-white/50">You are already using the desktop app.</p>}
    </div>
  )
}
