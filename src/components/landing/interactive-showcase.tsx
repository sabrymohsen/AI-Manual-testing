"use client"

import { useState, useEffect } from "react"
import { Play, Sparkles, Terminal, Shield, RefreshCw, Eye, Bug, Layers, HelpCircle, ArrowRight, CheckCircle, AlertTriangle, Monitor, Sparkle } from "lucide-react"

type SimulatorMode = "recorder" | "agent" | "visual"

export default function InteractiveShowcase() {
  const [mode, setMode] = useState<SimulatorMode>("recorder")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  
  // Recorder states
  const [recorderLogs, setRecorderLogs] = useState<string[]>([])
  const [healingOccurred, setHealingOccurred] = useState(false)

  // Agent states
  const [agentLogs, setAgentLogs] = useState<string[]>([])
  const [scanProgress, setScanProgress] = useState(0)

  // Visual diff slider state
  const [sliderPosition, setSliderPosition] = useState(50)

  // Reset states when mode changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentStep(0)
    setRecorderLogs([])
    setHealingOccurred(false)
    setAgentLogs([])
    setScanProgress(0)
  }, [mode])

  // Handle Play/Simulation loops
  useEffect(() => {
    if (!isPlaying) return

    let timer: NodeJS.Timeout
    if (mode === "recorder") {
      const steps = [
        { text: "🚀 Starting validation runner...", delay: 500 },
        { text: "🔍 Navigating to checkout portal: https://local.app/checkout", delay: 1000 },
        { text: "👉 Action: Click input field #email", delay: 1500 },
        { text: "✍️ Action: Type 'qa-tester@antigravity.io'", delay: 2000 },
        { text: "⚠️ Target locator '.btn-checkout' not found! Initiating healing lookup...", delay: 2800 },
        { text: "✨ Smart heal: Found match via alt tag 'Proceed to final checkout'", delay: 3500 },
        { text: "✅ Action: Click button 'Proceed to final checkout' [HEALED]", delay: 4200 },
        { text: "🎉 Validation test case passed successfully!", delay: 5000 }
      ]

      let idx = 0
      const run = () => {
        if (idx < steps.length) {
          setRecorderLogs(prev => [...prev, steps[idx].text])
          setCurrentStep(idx)
          if (idx === 4) setHealingOccurred(true)
          timer = setTimeout(() => {
            idx++
            run()
          }, steps[idx].delay - (idx > 0 ? steps[idx - 1].delay : 0))
        } else {
          setIsPlaying(false)
        }
      }
      run()
    } else if (mode === "agent") {
      const steps = [
        { text: "🤖 Initializing QA Agent Brain scan...", delay: 400 },
        { text: "🕷️ Crawling local page nodes & input map...", delay: 800 },
        { text: "🎯 Scan: Found 14 interactive buttons & 4 input vectors", delay: 1200 },
        { text: "🧠 Analysis: Compiling optimal test path coverage...", delay: 1800 },
        { text: "🏃 Run: Click 'Add To Cart' button [Success]", delay: 2400 },
        { text: "🚨 Exception: Console crash detected on /cart line 42", delay: 3200 },
        { text: "🐛 Bug found: Uncaught TypeError in react-dom render", delay: 3800 },
        { text: "📋 Report: Auto-created draft bug ticket in OpenProject", delay: 4500 }
      ]

      let idx = 0
      const run = () => {
        if (idx < steps.length) {
          setAgentLogs(prev => [...prev, steps[idx].text])
          setScanProgress(((idx + 1) / steps.length) * 100)
          timer = setTimeout(() => {
            idx++
            run()
          }, steps[idx].delay - (idx > 0 ? steps[idx - 1].delay : 0))
        } else {
          setIsPlaying(false)
        }
      }
      run()
    }

    return () => clearTimeout(timer)
  }, [isPlaying, mode])

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false)
    } else {
      setRecorderLogs([])
      setAgentLogs([])
      setHealingOccurred(false)
      setScanProgress(0)
      setIsPlaying(true)
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xl overflow-hidden backdrop-blur-md">
      {/* Simulation Selector Bar */}
      <div className="flex border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 p-2 items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
          <button
            onClick={() => setMode("recorder")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              mode === "recorder"
                ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <RefreshCw size={13} className={mode === "recorder" ? "animate-spin" : ""} /> Self-Healing Recorder
          </button>
          <button
            onClick={() => setMode("agent")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              mode === "agent"
                ? "bg-white dark:bg-slate-900 text-blue-650 dark:text-blue-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <Sparkles size={13} /> QA Agent Scan
          </button>
          <button
            onClick={() => setMode("visual")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              mode === "visual"
                ? "bg-white dark:bg-slate-900 text-violet-650 dark:text-violet-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <Eye size={13} /> Visual Comparison
          </button>
        </div>

        {mode !== "visual" && (
          <button
            onClick={togglePlayback}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isPlaying
                ? "bg-red-550 hover:bg-red-650 text-white"
                : mode === "recorder"
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/10"
            }`}
          >
            <Play size={12} fill="currentColor" className={isPlaying ? "hidden" : "inline"} />
            {isPlaying ? "Reset Simulator" : "Run Live Simulation"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 min-h-[380px]">
        {/* Left Side: Simulation Logs / Configs */}
        <div className="p-6 border-r border-slate-200/80 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-950/10 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                mode === "recorder" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/35" :
                mode === "agent" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/35" :
                "bg-violet-50 text-violet-750 dark:bg-violet-950/35"
              }`}>
                {mode === "recorder" ? "Self-Healing Engine" : mode === "agent" ? "Local QA Agent" : "Pixel Regression"}
              </span>
              <h3 className="text-lg font-bold mt-1 text-slate-800 dark:text-slate-200">
                {mode === "recorder" && "Locate & Click Validation"}
                {mode === "agent" && "Autonomous QA Explorer"}
                {mode === "visual" && "Figma vs Live Code Checker"}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {mode === "recorder" && "Watch the self-healing algorithm resolve modified CSS/XPath selectors at runtime to keep your test suites completely green."}
                {mode === "agent" && "Let the background worker scan your DOM tree nodes, plan testing traversals, and trace bugs automatically without configuration."}
                {mode === "visual" && "Use pixel-comparison sliders to overlay live builds on design targets. Identify UI deviations and layout offsets in real-time."}
              </p>
            </div>

            {/* Logs Area */}
            {mode !== "visual" && (
              <div className="bg-slate-955 dark:bg-black rounded-2xl p-4 font-mono text-[10px] text-slate-305 space-y-2 border border-slate-850 min-h-[170px] max-h-[220px] overflow-y-auto">
                <div className="flex items-center justify-between text-slate-500 border-b border-slate-850 pb-1.5">
                  <span className="flex items-center gap-1"><Terminal size={11} /> terminal output</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                {mode === "recorder" ? (
                  recorderLogs.length === 0 ? (
                    <p className="text-slate-500 italic">Click "Run Live Simulation" to launch the test case runner...</p>
                  ) : (
                    recorderLogs.map((log, idx) => (
                      <p 
                        key={idx} 
                        className={
                          log.startsWith("✅") ? "text-emerald-400" : 
                          log.startsWith("⚠️") ? "text-amber-400 animate-pulse" : 
                          log.startsWith("🎉") ? "text-indigo-400 font-bold" : "text-slate-300"
                        }
                      >
                        {log}
                      </p>
                    ))
                  )
                ) : (
                  agentLogs.length === 0 ? (
                    <p className="text-slate-500 italic">Click "Run Live Simulation" to deploy the autonomous QA explorer...</p>
                  ) : (
                    agentLogs.map((log, idx) => (
                      <p 
                        key={idx} 
                        className={
                          log.startsWith("🚨") || log.startsWith("🐛") ? "text-rose-400" : 
                          log.startsWith("🎯") ? "text-blue-400" : 
                          log.startsWith("📋") ? "text-emerald-400 font-bold" : "text-slate-300"
                        }
                      >
                        {log}
                      </p>
                    ))
                  )
                )}
              </div>
            )}

            {mode === "visual" && (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900 border rounded-2xl p-3.5 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350">Interactive Controls</h4>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Slider Comparison Position:</span>
                    <span className="font-mono text-violet-600 font-bold">{sliderPosition}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderPosition}
                    onChange={(e) => setSliderPosition(Number(e.target.value))}
                    className="w-full accent-violet-605"
                  />
                  <div className="flex justify-between text-[9px] font-bold text-slate-400">
                    <span>Figma Target</span>
                    <span>Live Build</span>
                  </div>
                </div>

                <div className="border border-violet-100 dark:border-violet-900/30 bg-violet-50/50 dark:bg-violet-950/10 rounded-2xl p-3 text-xs text-violet-750 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 text-violet-600 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Difference Detected:</strong> "Submit Form" button has a 12px margin offset and a rounded corner variance compared to the approved design library.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/55 dark:border-slate-800/30 mt-4">
            <span>Local-first architecture</span>
            <span>No subscription required</span>
          </div>
        </div>

        {/* Right Side: Visual Sandbox / Mock Screen */}
        <div className="p-6 bg-slate-100/50 dark:bg-slate-955/20 flex items-center justify-center min-h-[300px]">
          {/* Recorder Sandbox */}
          {mode === "recorder" && (
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 border dark:border-slate-805 rounded-2xl shadow-xl overflow-hidden relative min-h-[280px] flex flex-col justify-between">
              {/* Header */}
              <div className="bg-slate-50 dark:bg-slate-950 border-b px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 font-bold">
                <span className="flex items-center gap-1"><Monitor size={10} /> Chrome Host</span>
                <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? "bg-amber-500 animate-pulse" : "bg-slate-350"}`} />
              </div>

              {/* Form Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                  <div className={`w-full border rounded-xl px-3 py-2 text-xs transition-all ${
                    isPlaying && currentStep >= 2 ? "border-indigo-500 bg-indigo-50/20 shadow-xs" : ""
                  }`}>
                    {isPlaying && currentStep >= 3 ? "qa-tester@antigravity.io" : ""}
                  </div>
                </div>

                <div className="pt-2 relative">
                  {/* Floating Action Button */}
                  <button className={`w-full h-9 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 ${
                    isPlaying && currentStep >= 6
                      ? "bg-emerald-600 shadow-md shadow-emerald-600/10"
                      : "bg-indigo-650 hover:bg-indigo-700 shadow-md shadow-indigo-600/10"
                  }`}>
                    {isPlaying && currentStep >= 6 ? "Done!" : "Proceed to final checkout"}
                  </button>

                  {/* Smart Healing Alert Glow */}
                  {healingOccurred && currentStep >= 4 && currentStep < 6 && (
                    <div className="absolute inset-0 bg-amber-500/10 border-2 border-dashed border-amber-500 rounded-xl animate-pulse flex items-center justify-center text-[10px] font-black text-amber-700 bg-white/90">
                      🛠️ HEALING IN PROGRESS...
                    </div>
                  )}

                  {healingOccurred && currentStep >= 6 && (
                    <div className="absolute -top-6 right-0 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-1.5 py-0.5 text-[9px] font-bold animate-bounce">
                      ✨ Selector Healed!
                    </div>
                  )}
                </div>
              </div>

              {/* Toolbar Footer */}
              <div className="bg-slate-900 border-t border-slate-800 p-2.5 flex items-center justify-between text-[9px] text-white">
                <span className="font-extrabold text-pink-500">Antigravity Toolbar</span>
                <div className="flex gap-2">
                  <span className="bg-white/10 px-1.5 py-0.5 rounded font-black">RECORD</span>
                  <span className="bg-white/10 px-1.5 py-0.5 rounded font-black text-indigo-400">HEAL ON</span>
                </div>
              </div>
            </div>
          )}

          {/* Agent Sandbox */}
          {mode === "agent" && (
            <div className="w-full max-w-sm bg-slate-900 text-white rounded-2xl shadow-xl overflow-hidden min-h-[280px] p-5 flex flex-col justify-between border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <Sparkles size={12} className="text-blue-500" /> QA Scanner Radar
                </h4>
                <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded font-mono">Progress: {Math.round(scanProgress)}%</span>
              </div>

              {/* Scanning visual matrix */}
              <div className="relative h-36 bg-black/60 rounded-xl overflow-hidden border border-slate-850 flex items-center justify-center">
                {/* Horizontal Sweeper line */}
                {isPlaying && (
                  <div className="absolute w-full h-[2px] bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-bounce" style={{ animationDuration: "3s" }} />
                )}

                {/* DOM Nodes Mock Grid */}
                <div className="grid grid-cols-4 gap-3 p-4 w-full opacity-65">
                  <div className={`h-8 border rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                    isPlaying && scanProgress > 10 ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-slate-800"
                  }`}>Input_1</div>
                  <div className={`h-8 border rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                    isPlaying && scanProgress > 30 ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-slate-800"
                  }`}>Input_2</div>
                  <div className={`h-8 border rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                    isPlaying && scanProgress > 50 ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-slate-800"
                  }`}>Button_Submit</div>
                  <div className={`h-8 border rounded flex items-center justify-center text-[8px] font-bold transition-all ${
                    isPlaying && scanProgress > 70 ? "border-rose-500 bg-rose-500/20 text-rose-455 animate-pulse font-black" : "border-slate-800"
                  }`}>BrokenLink_X</div>
                </div>

                {isPlaying && scanProgress > 70 && (
                  <div className="absolute bg-rose-900/90 text-rose-100 border border-rose-600 rounded-lg p-2 text-[9px] text-center font-bold animate-fade-in">
                    🚨 CRITICAL EXCEPTION DETECTED<br/>
                    <span className="text-[8px] font-normal font-mono opacity-80">react-dom error at /cart</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 bg-slate-950 rounded-lg p-2 text-center border border-slate-850">
                  <p className="text-[10px] text-slate-450">Bugs Traced</p>
                  <p className="text-sm font-black text-rose-500">{isPlaying && scanProgress > 70 ? 1 : 0}</p>
                </div>
                <div className="flex-1 bg-slate-950 rounded-lg p-2 text-center border border-slate-850">
                  <p className="text-[10px] text-slate-450">Nodes Scanned</p>
                  <p className="text-sm font-black text-blue-400">{isPlaying ? Math.round(scanProgress * 0.18) : 0}</p>
                </div>
              </div>
            </div>
          )}

          {/* Visual Diff slider simulator */}
          {mode === "visual" && (
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden min-h-[280px] relative">
              {/* Figma Target Layer */}
              <div className="absolute inset-0 p-6 flex flex-col justify-center space-y-4 bg-violet-50/15 dark:bg-violet-950/5">
                <h4 className="text-sm font-black text-indigo-950 dark:text-indigo-200">Checkout Checkout Verification</h4>
                <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-md" />
                <div className="h-8 w-1/3 bg-slate-200 dark:bg-slate-800 rounded-md" />
                <div className="h-10 bg-indigo-650 rounded-xl" />
              </div>

              {/* Slider boundary overlay */}
              <div 
                className="absolute inset-0 bg-rose-500/10 border-r-2 border-violet-500 overflow-hidden pointer-events-none"
                style={{ width: `${sliderPosition}%` }}
              >
                {/* Live Build Layer with shift difference */}
                <div className="absolute w-[340px] p-6 flex flex-col justify-center space-y-4 bg-white dark:bg-slate-900">
                  <h4 className="text-sm font-black text-indigo-950 dark:text-indigo-200">Checkout Verification</h4>
                  <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-md" />
                  <div className="h-8 w-1/3 bg-slate-200 dark:bg-slate-800 rounded-md" />
                  {/* Shifted button layout difference */}
                  <div className="h-10 bg-indigo-650 rounded-sm ml-6 w-5/6 border border-rose-500 relative">
                    <span className="absolute -top-3.5 left-2 bg-rose-600 text-white font-mono text-[8px] font-bold px-1 rounded">Shifted + Radius Mismatch</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
