"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Shield,
  Activity,
  Award,
  AlertTriangle,
  Check,
  X,
  Edit2,
  Settings,
  ArrowRight,
  TrendingUp,
  Search,
  FileSpreadsheet,
  Globe,
  Settings2,
  Flame,
  ShieldCheck,
  Heart,
  Loader2,
  Calendar
} from "lucide-react"

interface HealingEventItem {
  id: string
  originalLocator: string
  recoveredLocator: string
  confidence: number
  pageUrl: string
  testName: string
  status: string
  createdAt: string
}

interface KPIs {
  totalRecoveries: number
  successRate: number
  avgConfidence: number
  needsReview: number
}

export default function HealCenterPage() {
  const params = useParams()
  const projectId = params.id as string

  // Healing datasets states
  const [events, setEvents] = useState<HealingEventItem[]>([])
  const [kpis, setKpis] = useState<KPIs>({
    totalRecoveries: 0,
    successRate: 100,
    avgConfidence: 100,
    needsReview: 0
  })

  // Settings states
  const [threshold, setThreshold] = useState(75)
  const [strategy, setStrategy] = useState("shaft-heal")

  // Interactive editing states
  const [editingEvent, setEditingEvent] = useState<HealingEventItem | null>(null)
  const [customLocator, setCustomLocator] = useState("")

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    loadHealingData()
  }, [])

  const loadHealingData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/autotest/healing")
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        setKpis(data.kpis)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (eventId: string, action: string, editLocator?: string) => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/autotest/healing/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          action,
          editLocator
        })
      })
      if (res.ok) {
        const data = await res.json()
        const updated = data.event
        // Update list
        setEvents(prev => prev.map(e => e.id === eventId ? updated : e))
        
        // Recalculate quick summary KPIs
        const updatedEvents = events.map(e => e.id === eventId ? updated : e)
        const total = updatedEvents.length
        const passedCount = updatedEvents.filter(e => e.status === "recovered").length
        const successRate = total > 0 ? Math.round((passedCount / total) * 100) : 100
        const needsReview = updatedEvents.filter(e => e.status === "needs_review").length
        setKpis(prev => ({
          ...prev,
          successRate,
          needsReview
        }))
        
        // Reset editing modal
        setEditingEvent(null)
        setCustomLocator("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered lists
  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return events.filter(e => 
      e.originalLocator.toLowerCase().includes(q) || 
      e.recoveredLocator.toLowerCase().includes(q) ||
      e.pageUrl.toLowerCase().includes(q) ||
      e.testName.toLowerCase().includes(q)
    )
  }, [events, searchQuery])

  // Stability ratings for Locator Health Map
  const healthMap = [
    { page: "User Login Page", url: "/login", stability: 95, status: "Excellent", count: 18 },
    { page: "Dashboard Control Page", url: "/dashboard", stability: 88, status: "Good", count: 24 },
    { page: "Project Settings Pane", url: "/settings", stability: 72, status: "Brittle", count: 12 },
    { page: "E-Commerce Checkout Form", url: "/checkout", stability: 48, status: "Broken", count: 8 },
    { page: "Admin Management Console", url: "/admin", stability: 92, status: "Excellent", count: 16 }
  ]

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none text-slate-800">
      
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <Shield className="text-indigo-650 animate-pulse h-5 w-5" /> Heal Center
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Real-time monitoring and auto-recovery for fragile/broken browser element locators using Locator healing.
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
          <span>Source: target/shaft-heal/reports/</span>
        </div>
      </div>

      {/* KPI Cards Row */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400 border bg-white rounded-2xl">
          <Loader2 className="animate-spin" size={24} />
          <span>Syncing self-healing metrics...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Total Recoveries", val: kpis.totalRecoveries, desc: "Auto-healed events", icon: ShieldCheck, color: "text-indigo-600 bg-indigo-50" },
            { label: "Success Rate", val: `${kpis.successRate}%`, desc: "Successful locator updates", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
            { label: "Avg Confidence", val: `${kpis.avgConfidence}%`, desc: "Heuristic match accuracy", icon: Award, color: "text-amber-600 bg-amber-50" },
            { label: "Needs Review", val: kpis.needsReview, desc: "Low-confidence queries", icon: AlertTriangle, color: kpis.needsReview > 0 ? "text-rose-600 bg-rose-50 animate-pulse" : "text-slate-600 bg-slate-50" }
          ].map((kpi, idx) => (
            <div key={idx} className="bg-white border rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider">{kpi.label}</span>
                <h3 className="text-2xl font-extrabold text-slate-900">{kpi.val}</h3>
                <p className="text-[10px] text-slate-400 font-medium">{kpi.desc}</p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon size={18} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Dashboard Content Sections */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left / Center Grid: Healing Feed */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Real-time Healing feed stream */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
                <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider">Auto-Healing Activity Feed</span>
                <div className="relative w-48">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-450" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search logs..."
                    className="w-full h-7 pl-8 pr-2 rounded-lg border border-slate-200 text-[10.5px] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50"
                  />
                </div>
              </div>

              <div className="space-y-3.5 max-h-[440px] overflow-y-auto pr-1">
                {filteredEvents.map(event => {
                  const confVal = Math.round(event.confidence * 100)
                  const isHigh = confVal >= 85
                  const isMedium = confVal >= 70 && confVal < 85
                  const cardColor = isHigh 
                    ? "border-emerald-100 bg-emerald-50/5 text-emerald-800" 
                    : isMedium 
                    ? "border-amber-100 bg-amber-50/5 text-amber-800" 
                    : "border-rose-100 bg-rose-50/5 text-rose-800"

                  return (
                    <div key={event.id} className={`border p-4 rounded-2xl shadow-3xs space-y-3 transition-colors ${cardColor}`}>
                      <div className="flex justify-between items-start gap-2 flex-wrap text-[10.5px]">
                        <div className="space-y-1">
                          <span className="font-extrabold text-slate-900 block">{event.testName}</span>
                          <span className="text-[10px] text-slate-450 block truncate font-medium max-w-sm">{event.pageUrl}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[9.5px] font-black border uppercase ${
                            isHigh ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            isMedium ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {confVal}% Match
                          </span>
                          <span className="text-[9.5px] text-slate-400 font-mono font-medium">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-white p-2.5 rounded-xl border border-slate-100">
                        <div className="space-y-1">
                          <span className="text-[8.5px] font-black text-rose-500 uppercase tracking-wider block">Broken Locator</span>
                          <code className="font-mono text-[9px] text-slate-700 font-bold select-all block whitespace-pre-wrap break-all">{event.originalLocator}</code>
                        </div>
                        <div className="space-y-1 border-t md:border-t-0 md:border-l pt-2.5 md:pt-0 md:pl-4 flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[8.5px] font-black text-emerald-500 uppercase tracking-wider block">Healed Locator</span>
                            <code className="font-mono text-[9px] text-slate-700 font-bold select-all block whitespace-pre-wrap break-all">{event.recoveredLocator}</code>
                          </div>
                          <ArrowRight size={14} className="text-slate-350 shrink-0 hidden md:block" />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredEvents.length === 0 && (
                  <p className="text-slate-400 italic text-center py-12">No healing logs match your search.</p>
                )}
              </div>
            </div>

            {/* Review Queue for fragile queries */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Manual Review Queue</span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                      <th className="p-3">Target Test</th>
                      <th className="p-3">Page Location</th>
                      <th className="p-3">Conf %</th>
                      <th className="p-3">Original Locator</th>
                      <th className="p-3">Proposed Update</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650">
                    {events
                      .filter(e => e.status === "needs_review")
                      .map(event => (
                        <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold text-slate-800 max-w-[140px] truncate">{event.testName}</td>
                          <td className="p-3 font-medium text-slate-500 max-w-[140px] truncate">{event.pageUrl}</td>
                          <td className="p-3 font-black text-amber-600">{Math.round(event.confidence * 100)}%</td>
                          <td className="p-3 font-mono text-[9.5px] select-all truncate max-w-[140px]">{event.originalLocator}</td>
                          <td className="p-3 font-mono text-[9.5px] select-all text-emerald-600 truncate max-w-[140px]">{event.recoveredLocator}</td>
                          <td className="p-3 text-right space-x-1">
                            <button
                              onClick={() => handleAction(event.id, "approve")}
                              title="Approve recovery"
                              className="h-6.5 w-6.5 inline-flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                            >
                              <Check size={11} />
                            </button>
                            <button
                              onClick={() => handleAction(event.id, "reject")}
                              title="Reject proposal"
                              className="h-6.5 w-6.5 inline-flex items-center justify-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200"
                            >
                              <X size={11} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingEvent(event)
                                setCustomLocator(event.recoveredLocator)
                              }}
                              title="Edit proposal"
                              className="h-6.5 w-6.5 inline-flex items-center justify-center rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200"
                            >
                              <Edit2 size={10} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    {events.filter(e => e.status === "needs_review").length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No low-confidence recoveries currently in the review queue. All is stable!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column: Health Map & Settings */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Locator Health Map heatmap */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Locator Health Map</span>
              <div className="space-y-3">
                {healthMap.map(node => {
                  const isExcellent = node.stability >= 90
                  const isGood = node.stability >= 80 && node.stability < 90
                  const isBrittle = node.stability >= 70 && node.stability < 80
                  const meterColor = isExcellent ? "bg-emerald-500" : isGood ? "bg-blue-500" : isBrittle ? "bg-amber-500" : "bg-rose-500"
                  const badgeColor = isExcellent ? "bg-emerald-50 text-emerald-700 border-emerald-100" : isGood ? "bg-blue-50 text-blue-700 border-blue-100" : isBrittle ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-rose-50 text-rose-700 border-rose-100 animate-pulse"

                  return (
                    <div key={node.page} className="p-3 border rounded-xl space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-extrabold text-slate-900 block">{node.page}</span>
                          <span className="text-[9.5px] text-slate-400 block font-medium">{node.url}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-black border ${badgeColor}`}>
                          {node.status}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold font-mono">
                          <span>Stability Score</span>
                          <span>{node.stability}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${meterColor}`} style={{ width: `${node.stability}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Self-healing Settings */}
            <div className="bg-white border rounded-2xl p-4 shadow-2xs space-y-4">
              <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider block border-b pb-2">Healing Settings</span>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9.5px]">
                    <label className="font-bold text-slate-650">Healing Confidence Threshold</label>
                    <span className="font-black text-indigo-700 font-mono">{threshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                  />
                  <p className="text-[9px] text-slate-400 font-medium">Recoveries with confidence below this threshold enter the manual review queue.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9.5px] font-bold text-slate-650 block">Healing Match Strategy</label>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="flex h-8.5 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs select-none cursor-pointer focus-visible:ring-1 focus-visible:ring-indigo-500"
                  >
                    <option value="visual-dom">Visual + DOM matching</option>
                    <option value="xpath-levenshtein">Levenshtein Distance Match</option>
                    <option value="dom-sibling-tree">DOM Sibling Tree Matching</option>
                  </select>
                </div>

                <Button
                  onClick={() => alert("Healing configuration settings updated successfully!")}
                  className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl w-full h-9 font-bold text-[10px] shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Settings2 size={12} /> Save Configurations
                </Button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ---- MODAL: EDIT LOCATOR PROPOSAL ---- */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-base font-black text-slate-900">Edit Proposed Healed Locator</h3>
              <button 
                onClick={() => {
                  setEditingEvent(null)
                  setCustomLocator("")
                }} 
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Target Test & Method</label>
                <div className="bg-slate-50 border p-2 rounded-xl text-slate-700 font-bold truncate">{editingEvent.testName}</div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Original Broken Locator</label>
                <div className="bg-rose-50/50 border border-rose-100 p-2.5 rounded-xl font-mono text-[9px] text-rose-700 select-all block break-all font-bold">{editingEvent.originalLocator}</div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Custom Healed Locator Input</label>
                <textarea
                  value={customLocator}
                  onChange={(e) => setCustomLocator(e.target.value)}
                  className="w-full min-h-[72px] p-2.5 font-mono text-[9px] text-slate-700 font-bold border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingEvent(null)
                  setCustomLocator("")
                }}
                className="border-slate-200 text-slate-600 rounded-xl flex-1 text-xs h-9 font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleAction(editingEvent.id, "edit", customLocator)}
                disabled={submitting || !customLocator.trim()}
                className="bg-indigo-650 text-white hover:bg-indigo-700 rounded-xl flex-1 text-xs h-9 font-black"
              >
                {submitting ? "Saving..." : "Approve Locator"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
