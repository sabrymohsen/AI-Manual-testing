import Link from "next/link"
import { BrandMark, TerminalMock } from "@/components/landing/qa-os"
import { FlaskConical, GitBranch, Globe } from "@/components/ui/icons"
import { DesktopDownloads } from "@/components/auth/desktop-downloads"

/** Presentation-only shell for /login and /register: brand panel left, form right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1.1fr] bg-[#0A0E1F] font-sans antialiased selection:bg-violet-600 selection:text-white">

      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-8 bg-[#060918] overflow-hidden">
        <div className="absolute inset-0 bg-[size:2.5rem_2.5rem] pointer-events-none" />
        <div className="absolute bottom-[-120px] left-[-60px] h-[300px] w-[300px] bg-violet-600/25 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative">
          <Link href="/"><BrandMark /></Link>
        </div>

        <div className="relative space-y-6">
          <TerminalMock compact />
          <div className="space-y-3 text-xs text-muted-foreground font-medium">
            <p className="flex items-center gap-2"><FlaskConical className="h-3.5 w-3.5 text-cyan-400" /> Live QA sessions in an embedded browser</p>
            <p className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-indigo-400" /> Epic → Feature → Story traceability</p>
            <p className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-sky-400" /> Two-way OpenProject sync</p>
          </div>
        </div>

        <p className="relative text-xs font-mono text-muted-foreground">© {new Date().getFullYear()} QA Engine</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Link href="/"><BrandMark size="sm" /></Link>
          </div>
          {children}
          <DesktopDownloads />
        </div>
      </div>
    </div>
  )
}
