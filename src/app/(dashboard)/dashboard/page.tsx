"use client"

import { useEffect, useState } from "react"

interface DashboardStats {
  totalProjects: number
  totalTestCases: number
  totalTestRuns: number
  passed: number
  failed: number
  warning: number
  passPercentage: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-muted-foreground">Loading dashboard...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Projects</p>
          <p className="text-2xl font-bold">{stats?.totalProjects || 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Test Cases</p>
          <p className="text-2xl font-bold">{stats?.totalTestCases || 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Test Runs</p>
          <p className="text-2xl font-bold">{stats?.totalTestRuns || 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Pass Rate</p>
          <p className="text-2xl font-bold">
            {stats ? `${Math.round(stats.passPercentage)}%` : "N/A"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Passed</p>
          <p className="text-2xl font-bold text-green-600">{stats?.passed || 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats?.failed || 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Warnings</p>
          <p className="text-2xl font-bold text-yellow-600">{stats?.warning || 0}</p>
        </div>
      </div>
    </div>
  )
}
