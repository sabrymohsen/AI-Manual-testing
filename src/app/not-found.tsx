import Link from "next/link"
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr"
import { Logo } from "@/components/landing/logo"

/** Branded 404 (SKILL.md B10), with a way back. */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-black px-4 font-sans text-white">
      <div className="flex max-w-[680px] flex-col items-center gap-6 text-center">
        <Logo />
        <p className="caption-3 font-mono text-white/40">404</p>
        <h1 className="heading-3 hero-gradient-dark max-sm:text-3xl">This page does not exist</h1>
        <p className="body-3 text-white/60">The link may be old, or the page was moved. Go back to the start and find it from there.</p>
        <Link
          href="/"
          className="button-md inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-black outline-none transition-[transform,opacity] duration-300 ease-out-soft hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to QA Engine
        </Link>
      </div>
    </main>
  )
}
