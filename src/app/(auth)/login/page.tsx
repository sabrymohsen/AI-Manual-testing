"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, Loader2 } from "@/components/ui/icons"

export default function LoginPage() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const form = new FormData(e.currentTarget)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        // Full page reload to ensure the cookie is sent on the next request
        window.location.href = "/dashboard"
      } else {
        setError(data.error || "Login failed")
        setLoading(false)
      }
    } catch (err) {
      console.error("Login error:", err)
      setError("An unexpected error occurred. Please try again.")
      setLoading(false)
    }
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 font-medium placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"

  return (
    <>
      <div className="space-y-2">
        <p className="font-mono text-xs font-semibold text-violet-400 uppercase tracking-[0.25em]">// authenticate</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in to your engine</h1>
        <p className="text-xs text-muted-foreground">Enter your credentials to open the dashboard.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-xs font-semibold text-slate-300">Email</label>
          <input id="email" name="email" type="email" required placeholder="you@company.com" className={inputClass} />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-xs font-semibold text-slate-300">Password</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••••"
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-300 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:hover:bg-violet-600 text-white text-sm font-semibold h-11 px-6 shadow-[0_4px_12px_rgba(0,0,0,0.06)] shadow-violet-600/30 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
            </>
          ) : (
            <>
              Sign In <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
          Register
        </Link>
      </p>
    </>
  )
}
