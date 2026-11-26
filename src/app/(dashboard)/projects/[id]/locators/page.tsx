"use client"

import { toast } from "sonner"
import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Compass, 
  Play, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Copy, 
  FileCode, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  Zap
} from "@/components/ui/icons"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { MultiElementPicker } from "@/components/locators/multi-element-picker"

interface SavedLocator {
  id: string
  friendlyName: string
  description: string | null
  pageUrl: string
  tagName: string | null
  visibleText: string | null
  locatorType: string
  locatorValue: string
  recommendedSelector: string | null
  cssSelector: string | null
  xpathSelector: string | null
  idSelector: string | null
  testIdSelector: string | null
  roleSelector: string | null
  textSelector: string | null
  labelSelector: string | null
  placeholderSelector: string | null
  reliabilityScore: number
  attributes: any
  screenshotPath: string | null
  isValidated: boolean
  matchCount: number | null
  lastValidatedAt: string | null
  createdAt: string
}

interface Project {
  id: string
  name: string
  webAppUrl: string
  credentials: Array<{
    id: string
    roleName: string
    username: string
  }>
}

export default function ElementLocatorPickerPage() {
  const params = useParams()
  const router = useRouter()
  
  // Data states
  const [project, setProject] = useState<Project | null>(null)
  const [locators, setLocators] = useState<SavedLocator[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [validatingId, setValidatingId] = useState<string | null>(null)

  // Picker configurations
  const [targetUrl, setTargetUrl] = useState("")
  const [selectedCredentialId, setSelectedCredentialId] = useState("")

  // Captured locator state
  const [capturedLocator, setCapturedLocator] = useState<any | null>(null)
  const [friendlyName, setFriendlyName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedLocatorType, setSelectedLocatorType] = useState<string>("test_id")
  const [selectedLocatorValue, setSelectedLocatorValue] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSelfValidating, setIsSelfValidating] = useState(false)
  const [selfValidationResult, setSelfValidationResult] = useState<any | null>(null)
  const [locatorToDelete, setLocatorToDelete] = useState<string | null>(null)

  // Fetch initial project details and saved locators
  useEffect(() => {
    fetchProjectAndLocators()
  }, [params.id])

  async function fetchProjectAndLocators() {
    try {
      const projRes = await fetch(`/api/projects/${params.id}`)
      const projData = await projRes.json()
      setProject(projData.project)
      if (projData.project) {
        setTargetUrl(projData.project.webAppUrl)
      }

      const locRes = await fetch(`/api/projects/${params.id}/locators`)
      const locData = await locRes.json()
      setLocators(locData.locators || [])
    } catch (err) {
      console.error("Failed to load project or locators:", err)
    } finally {
      setLoading(false)
    }
  }

  // Trigger Element Picker browser session
  async function handleStartPicking() {
    setPicking(true)
    setCapturedLocator(null)
    setSelfValidationResult(null)
    
    try {
      const res = await fetch(`/api/projects/${params.id}/locators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pick",
          url: targetUrl,
          credentialId: selectedCredentialId || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const locator = data.locator
        setCapturedLocator(locator)
        setFriendlyName(locator.visibleText ? `Click ${locator.visibleText}` : `${locator.tagName || "element"} locator`)
        setDescription(`Captured from ${targetUrl}`)
        
        // Auto-select best locator
        setSelectedLocatorType(locator.locatorType)
        setSelectedLocatorValue(locator.locatorValue)
      } else {
        const data = await res.json()
        toast.error(data.error || "Picking session timed out or failed.")
      }
    } catch {
      toast.error("Network error starting element picker.")
    } finally {
      setPicking(false)
    }
  }

  // Save the selected locator configuration to DB
  async function handleSaveLocator() {
    if (!friendlyName.trim()) {
      toast.error("Friendly Name is required")
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/locators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          friendlyName,
          description,
          pageUrl: capturedLocator.pageUrl,
          tagName: capturedLocator.tagName,
          visibleText: capturedLocator.visibleText,
          locatorType: selectedLocatorType,
          locatorValue: selectedLocatorValue,
          recommendedSelector: capturedLocator.recommendedSelector,
          cssSelector: capturedLocator.cssSelector,
          xpathSelector: capturedLocator.xpathSelector,
          idSelector: capturedLocator.idSelector,
          testIdSelector: capturedLocator.testIdSelector,
          roleSelector: capturedLocator.roleSelector,
          textSelector: capturedLocator.textSelector,
          labelSelector: capturedLocator.labelSelector,
          placeholderSelector: capturedLocator.placeholderSelector,
          reliabilityScore: capturedLocator.reliabilityScore,
          attributes: capturedLocator.attributes,
          screenshotPath: capturedLocator.screenshotPath,
        }),
      })
 
      if (res.ok) {
        setCapturedLocator(null)
        fetchProjectAndLocators()
      } else {
        toast.error("Failed to save locator.")
      }
    } catch {
      toast.error("Network error saving locator.")
    } finally {
      setIsSaving(false)
    }
  }

  // Validate selector on page
  async function handleValidateSelector(locatorType: string, locatorValue: string, locatorId?: string) {
    if (locatorId) {
      setValidatingId(locatorId)
    } else {
      setIsSelfValidating(true)
    }

    try {
      const res = await fetch(`/api/projects/${params.id}/locators/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: capturedLocator?.pageUrl || targetUrl,
          locatorType,
          locatorValue,
          locatorId: locatorId || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (locatorId) {
          // Refresh list to show updated validation status
          fetchProjectAndLocators()
        } else {
          setSelfValidationResult(data)
        }
      } else {
        toast.error("Validation endpoint error.")
      }
    } catch {
      toast.error("Network error validating selector.")
    } finally {
      setValidatingId(null)
      setIsSelfValidating(false)
    }
  }

  // Delete saved locator
  function handleDeleteLocator(locatorId: string) {
    setLocatorToDelete(locatorId)
  }

  async function confirmDeleteLocator() {
    if (!locatorToDelete) return
    const res = await fetch(`/api/projects/${params.id}/locators/${locatorToDelete}`, {
      method: "DELETE",
    })

    if (!res.ok) {
      throw new Error("Failed to delete locator.")
    }
    setLocatorToDelete(null)
    fetchProjectAndLocators()
  }

  // Copy locator value helper
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    toast.success("Locator copied to clipboard!")
  }

  if (loading) return <p className="text-muted-foreground p-6">Loading Element Picker...</p>
  if (!project) return <p className="text-destructive p-6">Project not found</p>

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Element Locator Picker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project: <span className="font-semibold text-foreground">{project.name}</span>
          </p>
        </div>
      </div>

      {/* Multi-Element Session (session-based DOM capture) */}
      <MultiElementPicker
        projectId={project.id}
        credentials={project.credentials}
        defaultUrl={project.webAppUrl}
      />

      {/* Control Panel / Starting Picker (single-element, original) */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="p-6 md:col-span-1 space-y-4 border rounded-xl bg-card/50 backdrop-blur-sm shadow-sm">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Compass className="h-5 w-5 text-purple-500" /> Control Inspector
          </h3>
          <p className="text-xs text-muted-foreground">
            Launch a browser window, log in if desired, and click on any element to generate stable selectors automatically.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Target URL</label>
            <Input 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Login Role (Optional)</label>
            <select
              value={selectedCredentialId}
              onChange={(e) => setSelectedCredentialId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">No Automatic Login</option>
              {project.credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.roleName} ({c.username})
                </option>
              ))}
            </select>
          </div>

          <Button 
            className="w-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
            onClick={handleStartPicking}
            disabled={picking}
          >
            <Play className={`h-4 w-4 fill-current ${picking ? "animate-pulse" : ""}`} />
            {picking ? "Inspector Window Open..." : "Start Picking Element"}
          </Button>

          {picking && (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-lg text-xs text-purple-700 dark:text-purple-400 animate-pulse text-center">
              Please interact with the opened browser page. Click an element to capture its selectors.
            </div>
          )}
        </div>

        {/* Captured Locator details */}
        <div className="md:col-span-2">
          {!capturedLocator ? (
            <div className="h-full border border-dashed rounded-xl flex flex-col items-center justify-center p-12 text-center bg-card/20 min-h-[300px]">
              <FileCode className="h-12 w-12 text-muted-foreground/60 mb-4" />
              <h4 className="font-semibold text-lg">No Element Captured Yet</h4>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Once you start the picker session and click an element, its screenshot, tag properties, and selector options will appear here.
              </p>
            </div>
          ) : (
            <div className="p-6 border rounded-xl bg-card shadow-md space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-xl font-semibold text-purple-600 flex items-center gap-2">
                    <Zap className="h-5 w-5 fill-current" /> Element Captured
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    URL: {capturedLocator.pageUrl}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1 ${
                  capturedLocator.reliabilityScore >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                  capturedLocator.reliabilityScore >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                  Reliability: {capturedLocator.reliabilityScore}%
                </span>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {/* Visual Preview */}
                <div className="md:col-span-1 space-y-4">
                  <div className="text-xs font-semibold text-muted-foreground ">Visual Preview</div>
                  {capturedLocator.screenshotPath ? (
                    <div className="border rounded-lg overflow-hidden bg-accent/40 max-h-48 flex items-center justify-center p-2">
                      <img 
                        src={`/api/files/${capturedLocator.screenshotPath}`} 
                        alt="Captured Element"
                        className="object-contain max-h-40 rounded"
                      />
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg h-32 flex items-center justify-center text-xs text-muted-foreground bg-accent/10">
                      No element preview
                    </div>
                  )}

                  <div className="space-y-1 bg-accent/20 p-3 rounded-lg text-xs">
                    <div>Tag Name: <strong className="text-foreground">{capturedLocator.tagName}</strong></div>
                    {capturedLocator.visibleText && (
                      <div className="mt-1 line-clamp-3">Text: <span>&quot;{capturedLocator.visibleText}&quot;</span></div>
                    )}
                  </div>
                </div>

                {/* Form and Selectors */}
                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Friendly Name *</label>
                      <Input 
                        value={friendlyName}
                        onChange={(e) => setFriendlyName(e.target.value)}
                        placeholder="e.g. Login Email Input"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Description</label>
                      <Input 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Input for username"
                      />
                    </div>
                  </div>

                  {/* Selector Choice */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Choose Locator to Save</label>
                    <div className="border rounded-lg divide-y text-sm max-h-60 overflow-y-auto bg-background/50">
                      {/* data-testid */}
                      {capturedLocator.testIdSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector" 
                            checked={selectedLocatorType === "test_id"}
                            onChange={() => { setSelectedLocatorType("test_id"); setSelectedLocatorValue(capturedLocator.attributes["data-testid"] || capturedLocator.attributes["data-test"] || capturedLocator.attributes["data-qa"]) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-green-600 dark:text-green-400">data-testid (Highly Recommended)</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.testIdSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* id */}
                      {capturedLocator.idSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "css" && selectedLocatorValue.startsWith("#")}
                            onChange={() => { setSelectedLocatorType("css"); setSelectedLocatorValue(capturedLocator.idSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-blue-600 dark:text-blue-400">Element ID</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.idSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* placeholder */}
                      {capturedLocator.placeholderSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "placeholder"}
                            onChange={() => { setSelectedLocatorType("placeholder"); setSelectedLocatorValue(capturedLocator.placeholderSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-purple-600 dark:text-purple-400">Placeholder</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.placeholderSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* label */}
                      {capturedLocator.labelSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "label"}
                            onChange={() => { setSelectedLocatorType("label"); setSelectedLocatorValue(capturedLocator.labelSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-primary dark:text-indigo-400">Associated Label</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.labelSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* role */}
                      {capturedLocator.roleSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "role"}
                            onChange={() => {
                              setSelectedLocatorType("role")
                              const parts = capturedLocator.roleSelector.split(":")
                              const role = parts[0]
                              const name = parts.slice(1).join(":")
                              setSelectedLocatorValue(`${role}, name: "${name}"`)
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-pink-600 dark:text-pink-400">ARIA Role</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.roleSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* text */}
                      {capturedLocator.textSelector && capturedLocator.textSelector.length < 50 && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "text"}
                            onChange={() => { setSelectedLocatorType("text"); setSelectedLocatorValue(capturedLocator.textSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-amber-600 dark:text-amber-400">Text Content</div>
                            <div className="text-xs font-mono break-all mt-0.5">&quot;{capturedLocator.textSelector}&quot;</div>
                          </div>
                        </label>
                      )}

                      {/* cssSelector */}
                      {capturedLocator.cssSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "css" && !selectedLocatorValue.startsWith("#")}
                            onChange={() => { setSelectedLocatorType("css"); setSelectedLocatorValue(capturedLocator.cssSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-orange-600 dark:text-orange-400">CSS Path</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.cssSelector}</div>
                          </div>
                        </label>
                      )}

                      {/* xpathSelector */}
                      {capturedLocator.xpathSelector && (
                        <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                          <input 
                            type="radio" 
                            name="chosen-selector"
                            checked={selectedLocatorType === "xpath"}
                            onChange={() => { setSelectedLocatorType("xpath"); setSelectedLocatorValue(capturedLocator.xpathSelector) }}
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-xs text-red-600 dark:text-red-400">XPath (Fallback)</div>
                            <div className="text-xs font-mono break-all mt-0.5">{capturedLocator.xpathSelector}</div>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Validation Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-accent/15 p-3 rounded-lg text-xs">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleValidateSelector(selectedLocatorType, selectedLocatorValue)}
                      disabled={isSelfValidating}
                      className="flex items-center gap-2 h-8 bg-background"
                    >
                      {isSelfValidating ? <BusyDot /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Validate Selector On Page
                    </Button>

                    {selfValidationResult && (
                      <div className="flex items-center gap-2 font-medium mt-2 sm:mt-0">
                        {selfValidationResult.valid ? (
                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 fill-current" />
                            {selfValidationResult.message}
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 fill-current" />
                            {selfValidationResult.message}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setCapturedLocator(null)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveLocator}
                      disabled={isSaving}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {isSaving ? "Saving..." : "Save Locator to Project"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved Locators Table */}
      <div className="space-y-3">
        <h3 className="text-xl font-semibold tracking-tight">Saved Element Locators</h3>
        
        {locators.length === 0 ? (
          <div className="text-center border border-dashed rounded-xl py-12 bg-card/10">
            <p className="text-muted-foreground text-sm">No locators saved for this project yet.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-accent/40 border-b">
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Friendly Name</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Page URL</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Type</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Selector Value</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Reliability</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground ">Validation Status</th>
                  <th className="p-3 font-semibold text-xs text-muted-foreground  text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {locators.map((loc) => (
                  <tr key={loc.id} className="hover:bg-accent/20 transition-colors">
                    <td className="p-3 font-semibold">
                      <div className="flex flex-col gap-0.5">
                        <span>{loc.friendlyName}</span>
                      </div>
                      {loc.description && (
                        <div className="text-xs text-muted-foreground font-normal mt-0.5">{loc.description}</div>
                      )}
                    </td>
                    <td className="p-3 max-w-[200px] truncate text-xs font-mono text-muted-foreground" title={loc.pageUrl}>
                      {loc.pageUrl}
                    </td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                        {loc.locatorType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs max-w-[250px] truncate" title={loc.locatorValue}>
                      {loc.locatorValue}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-3 py-0.5 rounded-full font-semibold ${
                        loc.reliabilityScore >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        loc.reliabilityScore >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {loc.reliabilityScore}%
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {loc.isValidated ? (
                        <div className="flex flex-col gap-0.5">
                          {loc.matchCount === 1 ? (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-1 font-semibold">
                              <CheckCircle className="h-3.5 w-3.5 fill-current" /> Valid (1 match)
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400 flex items-center gap-1 font-semibold">
                              <AlertTriangle className="h-3.5 w-3.5 fill-current" /> Matches {loc.matchCount || 0}
                            </span>
                          )}
                          {loc.lastValidatedAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(loc.lastValidatedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not validated</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Copy Selector"
                          onClick={() => handleCopy(loc.locatorValue)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Validate Now"
                          onClick={() => handleValidateSelector(loc.locatorType, loc.locatorValue, loc.id)}
                          disabled={validatingId === loc.id}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={`h-4 w-4 ${validatingId === loc.id ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete Selector"
                          onClick={() => handleDeleteLocator(loc.id)}
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={locatorToDelete !== null}
        title="Delete Locator"
        description="Are you sure you want to delete this locator? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteLocator}
        onCancel={() => setLocatorToDelete(null)}
      />
    </div>
  )
}
