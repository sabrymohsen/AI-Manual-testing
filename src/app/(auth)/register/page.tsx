"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react"

export default function RegisterPage() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const form = new FormData(e.currentTarget)
      const password = form.get("password") as string
      const confirm = form.get("confirmPassword") as string

      if (password !== confirm) {
        setError("Passwords do not match")
        setLoading(false)
        return
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        window.location.href = "/dashboard"
      } else {
        setError(data.error || "Registration failed")
        setLoading(false)
      }
    } catch (err) {
      console.error("Registration error:", err)
      setError("An unexpected error occurred. Please try again.")
      setLoading(false)
    }
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-100 font-medium placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"

  return (
    <>
      <div className="space-y-1.5">
        <p className="font-mono text-[11px] font-bold text-violet-400 uppercase tracking-[0.25em]">// initialize account</p>
        <h1 className="text-2xl font-black tracking-tight text-white">Create your account</h1>
        <p className="text-[13px] text-slate-500">Free to start — your data stays on your machine.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Name</span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Optional</span>
          </label>
          <input id="name" name="name" placeholder="Jane Tester" className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-bold text-slate-300">Email</label>
          <input id="email" name="email" type="email" required placeholder="you@company.com" className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-bold text-slate-300">Password</label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Min. 8 characters"
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-bold text-slate-300">Confirm Password</label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              required
              placeholder="Repeat password"
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-[13px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:hover:bg-violet-600 text-white text-sm font-bold h-11 px-6 shadow-lg shadow-violet-600/30 transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
            </>
          ) : (
            <>
              Create Account <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-[13px] text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-violet-400 hover:text-violet-300 transition-colors">
          Sign In
        </Link>
      </p>
    </>
  )
}
