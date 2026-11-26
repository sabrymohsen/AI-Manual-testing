"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import { Play, Layers, ShieldCheck, Check, Filter, Compass, Clock, AlertCircle } from "@/components/ui/icons"

interface ProjectCredential {
  id: string
  roleName: string
  username: string
}

interface TestCase {
  id: string
  title: string
  priority: string
  executionType: string
  steps: any[]
}

interface HierarchyNode {
  id: string
  name: string
}

export default function NewManualSessionPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Tabs: structured or exploratory
  const [sessionType, setSessionType] = useState<"structured" | "exploratory">("structured")

  // Project details states
  const [credentials, setCredentials] = useState<ProjectCredential[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])

  // Form states
  const [sessionName, setSessionName] = useState("")
  const [selectedCredentialId, setSelectedCredentialId] = useState("")
  const [environment, setEnvironment] = useState("Staging")
  const [browserType, setBrowserType] = useState("Chromium")
  const [viewport, setViewport] = useState("Desktop")
  const [keepBrowserSession, setKeepBrowserSession] = useState(true)
  const [stopOnFailure, setStopOnFailure] = useState(false)

  // Exploratory Mode states
  const [mission, setMission] = useState("")
  const [timebox, setTimebox] = useState("30") // in minutes
  const [areasCovered, setAreasCovered] = useState("")

  // Filters for test cases
  const [caseSearch, setCaseSearch] = useState("")

  // Selected test case IDs
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjectSetupData()
  }, [projectId])

  const fetchProjectSetupData = async () => {
    setLoading(true)
    setError(null)
    try {
      const credsRes = await fetch(`/api/projects/${projectId}`)
      if (!credsRes.ok) throw new Error("Failed to fetch project details")
      const projData = await credsRes.json()
      setCredentials(projData.credentials || [])
      
      setSessionName(`Manual Session - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)

      const casesRes = await fetch(`/api/projects/${projectId}/test-cases`)
      if (!casesRes.ok) throw new Error("Failed to fetch test cases")
      const casesData = await casesRes.json()
      setTestCases(casesData.testCases || [])

    } catch (err: any) {
      setError(err.message || "Failed to load project details")
    } finally {
      setLoading(false)
    }
  }

  const getFilteredTestCases = () => {
    const q = caseSearch.toLowerCase()
    return testCases.filter((tc) => !q || tc.title.toLowerCase().includes(q))
  }

  const filteredCases = getFilteredTestCases()

  const handleToggleCase = (caseId: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    )
  }

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredCases.map((c) => c.id)
    const allSelected = allFilteredIds.every((id) => selectedCaseIds.includes(id))

    if (allSelected) {
      setSelectedCaseIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)))
    } else {
      setSelectedCaseIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sessionType === "structured" && selectedCaseIds.length === 0) {
      setError("Please select at least one test case to execute.")
      return
    }

    setSaving(true)
    setError(null)

    // Formulate exploratory mission payload if needed
    const finalSessionName = sessionType === "exploratory" 
      ? `Exploratory Run: ${sessionName}` 
      : sessionName

    const finalNotes = sessionType === "exploratory"
      ? `Exploratory Mission: ${mission}\nTimebox: ${timebox} mins\nTarget Areas: ${areasCovered}`
      : ""

    const payload = {
      name: finalSessionName,
      credentialId: selectedCredentialId || null,
      environment,
      browserType,
      viewport,
      keepBrowserSession,
      stopOnFailure,
      testCaseIds: sessionType === "exploratory" ? [] : selectedCaseIds,
      notes: finalNotes
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/manual-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error("Failed to start manual session")
      const session = await res.json()
      router.push(`/projects/${projectId}/manual-sessions/${session.id}`)
    } catch (err: any) {
      setError(err.message || "An error occurred starting the session")
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center gap-4 mb-8">
        <BackButton />
        <div>
          <h1 className="text-3xl font-semibold text-blue-600 ">
            New Testing Session
          </h1>
          <p className="text-muted-foreground">Configure parameters and select session mode to execute manual qa suite.</p>
        </div>
      </div>

      {/* Mode Tabs switcher */}
      <div className="flex border-b border-border mb-8 bg-muted/50 p-2 rounded-xl max-w-md">
        <button
          type="button"
          onClick={() => setSessionType("structured")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            sessionType === "structured" ? "bg-card text-blue-600 shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers size={16} /> Structured cases run
        </button>
        <button
          type="button"
          onClick={() => setSessionType("exploratory")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            sessionType === "exploratory" ? "bg-card text-blue-600 shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass size={16} /> Exploratory mode
        </button>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-muted/50 border border-border/50 rounded-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-muted-foreground text-sm">Loading project details configuration...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Config settings */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-card border border-border/80 p-6 rounded-xl shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-foreground border-b pb-3 flex items-center gap-2">
                <Layers className="text-blue-500" size={18} /> Run Configuration
              </h2>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Session Name</label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Environment</label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                >
                  <option value="Dev">Development</option>
                  <option value="Staging">Staging</option>
                  <option value="UAT">UAT (Acceptance)</option>
                  <option value="Production">Production</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Role / Credentials</label>
                <select
                  value={selectedCredentialId}
                  onChange={(e) => setSelectedCredentialId(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                >
                  <option value="">None (Anonymous)</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.roleName} ({c.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Browser</label>
                  <select
                    value={browserType}
                    onChange={(e) => setBrowserType(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none text-foreground"
                  >
                    <option value="Chromium">Chromium</option>
                    <option value="Firefox">Firefox</option>
                    <option value="WebKit">WebKit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Viewport</label>
                  <select
                    value={viewport}
                    onChange={(e) => setViewport(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none text-foreground"
                  >
                    <option value="Desktop">Desktop (1280x800)</option>
                    <option value="Tablet">Tablet (768x1024)</option>
                    <option value="Mobile">Mobile (375x667)</option>
                  </select>
                </div>
              </div>
            </div>

            {sessionType === "structured" && (
              <div className="bg-card border border-border/80 p-6 rounded-xl shadow-sm space-y-4">
                <h2 className="text-base font-semibold text-foreground border-b pb-3 flex items-center gap-2">
                  <ShieldCheck className="text-blue-500" size={18} /> Browser / Fail Options
                </h2>

                <div className="flex items-center justify-between py-1">
                  <label className="text-sm font-semibold text-foreground">Keep browser between cases</label>
                  <input
                    type="checkbox"
                    checked={keepBrowserSession}
                    onChange={(e) => setKeepBrowserSession(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-border rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <label className="text-sm font-semibold text-foreground">Stop session on first failed case</label>
                  <input
                    type="checkbox"
                    checked={stopOnFailure}
                    onChange={(e) => setStopOnFailure(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-border rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Mode Panel */}
          <div className="md:col-span-2 space-y-6">
            {sessionType === "structured" ? (
              <div className="bg-card border border-border/80 p-6 rounded-xl shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 border-b pb-4 gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Select Test Cases</h2>
                    <p className="text-xs text-muted-foreground">Filtered: {filteredCases.length} / Selected: {selectedCaseIds.length}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={handleSelectAllFiltered} className="text-muted-foreground text-xs py-1 px-3 h-8 border-border hover:bg-muted/50 rounded-lg">
                      {filteredCases.every((c) => selectedCaseIds.includes(c.id)) ? "Deselect All Filtered" : "Select All Filtered"}
                    </Button>
                  </div>
                </div>

                {/* Filter */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold  text-muted-foreground mb-1 flex items-center gap-1">
                    <Filter size={12} /> Search test cases
                  </label>
                  <input
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Filter by title..."
                    className="w-full px-3 py-2 border border-border bg-card rounded-lg text-xs focus:outline-none text-foreground"
                  />
                </div>

                {/* Checklist */}
                <div className="border border-border/60 rounded-xl max-h-[350px] overflow-y-auto divide-y divide-border bg-muted/50">
                  {filteredCases.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground text-sm">
                      No test cases match filters.
                    </div>
                  ) : (
                    filteredCases.map((tc) => {
                      const isSelected = selectedCaseIds.includes(tc.id)
                      return (
                        <div
                          key={tc.id}
                          onClick={() => handleToggleCase(tc.id)}
                          className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/80 transition-colors ${
                            isSelected ? "bg-blue-50/40" : ""
                          }`}
                        >
                          <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-all ${
                            isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-card"
                          }`}>
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{tc.title}</span>
                              <div className="flex items-center gap-2">
                                {tc.executionType === "Automated" && (
                                  <span
                                    title="Automated test — designed for Playwright, not manual step-by-step execution"
                                    className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-0.5"
                                  >
                                    ⚠ Automated
                                  </span>
                                )}
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  tc.priority === "Critical" ? "bg-red-100 text-red-700" :
                                  tc.priority === "High" ? "bg-orange-100 text-orange-700" :
                                  "bg-muted text-muted-foreground"
                                }`}>
                                  {tc.priority}
                                </span>
                              </div>
                            </div>
                            {tc.executionType === "Automated" && isSelected && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                This case is marked Automated. Steps are designed for Playwright — running it manually may not be meaningful.
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 mt-8 border-t pt-6">
                  <Link href={`/projects/${projectId}`}>
                    <Button type="button" variant="outline" className="rounded-xl border-border hover:bg-muted/50 text-muted-foreground px-6">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={saving || selectedCaseIds.length === 0} className=" bg-blue-600 text-white font-semibold rounded-xl px-6 shadow-md flex items-center gap-2">
                    <Play size={16} fill="white" /> Start Manual Session
                  </Button>
                </div>
              </div>
            ) : (
              // Exploratory form UI
              <div className="bg-card border border-border/80 p-6 rounded-xl shadow-sm space-y-6">
                <h2 className="text-base font-semibold text-foreground border-b pb-3 flex items-center gap-2">
                  <Compass className="text-blue-500" /> Exploratory Mission Config
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Mission Description</label>
                    <textarea
                      required
                      value={mission}
                      onChange={(e) => setMission(e.target.value)}
                      placeholder="e.g. Explore layout behavior, dashboard widget responsiveness, and notification stability."
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground h-24 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                        <Clock size={16} className="text-muted-foreground" /> Session Timebox
                      </label>
                      <select
                        value={timebox}
                        onChange={(e) => setTimebox(e.target.value)}
                        className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none text-foreground"
                      >
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="45">45 Minutes</option>
                        <option value="60">60 Minutes</option>
                        <option value="90">90 Minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Areas/Modules to Cover</label>
                      <input
                        type="text"
                        value={areasCovered}
                        onChange={(e) => setAreasCovered(e.target.value)}
                        placeholder="e.g. Auth form, search filters, profile"
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none text-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-8 border-t pt-6">
                  <Link href={`/projects/${projectId}`}>
                    <Button type="button" variant="outline" className="rounded-xl border-border hover:bg-muted/50 text-muted-foreground px-6">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={saving || !mission.trim()} className=" bg-blue-600 text-white font-semibold rounded-xl px-6 shadow-md flex items-center gap-2">
                    <Play size={16} fill="white" /> Launch Exploratory Session
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
