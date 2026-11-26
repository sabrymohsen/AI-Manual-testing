"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AssertionBuilder } from "./assertion-builder"
import { Trash2, Plus, ChevronUp, ChevronDown, RefreshCw, CheckCircle, AlertTriangle, MessageSquareText, SlidersHorizontal } from "@/components/ui/icons"
import { PlainEnglishEditor, isPlainStep } from "@/components/plain-english/plain-english-editor"

interface Step {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: any[]
  // Carried untouched so saving keeps recorder data and the plain-English flag.
  actionMetadata?: any
  [key: string]: any
}

interface StepBuilderProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
  projectId?: string
  /** Manual cases: no automation-wording warnings. */
  manual?: boolean
}

import {
  ACTION_TYPES,
  TARGET_TYPES,
  ACTION_TYPE_LABELS,
  TARGET_TYPE_LABELS,
} from "@/lib/test-constants"

interface Locator {
  id: string
  friendlyName: string
  pageUrl: string
  locatorType: string
  locatorValue: string
}

export function StepBuilder({ steps, onChange, projectId, manual = false }: StepBuilderProps) {
  const [locators, setLocators] = useState<Locator[]>([])
  const [validatingIdx, setValidatingIdx] = useState<number | null>(null)
  const [validationResults, setValidationResults] = useState<Record<number, { valid: boolean; message: string }>>({})
  // Plain English for a new test case, or when every step already is; detailed otherwise.
  const [mode, setMode] = useState<"plain" | "detailed">(() => (steps.length === 0 || steps.every(isPlainStep) ? "plain" : "detailed"))
  const [modeTouched, setModeTouched] = useState(false)
  // Steps usually arrive after the form has rendered (the edit page fetches them), so decide again once they do.
  useEffect(() => {
    if (!modeTouched && steps.length > 0) setMode(steps.every(isPlainStep) ? "plain" : "detailed")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length > 0])

  useEffect(() => {
    if (projectId) {
      fetch(`/api/projects/${projectId}/locators`)
        .then((res) => res.json())
        .then((data) => setLocators(data.locators || []))
        .catch((err) => console.error("Error fetching locators:", err))
    }
  }, [projectId])

  function addStep() {
    onChange([
      ...steps,
      {
        actionDescription: "",
        expectedResult: "",
        actionType: "custom_instruction",
        targetType: "none",
        targetValue: "",
        inputValue: "",
        timeoutMs: 10000,
        assertions: [],
      },
    ])
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index))
    // Clear validation result for this step if any
    const updatedResults = { ...validationResults }
    delete updatedResults[index]
    setValidationResults(updatedResults)
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return
    const updated = [...steps]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onChange(updated)

    // Swap validation results
    const updatedResults = { ...validationResults }
    const fromRes = updatedResults[from]
    const toRes = updatedResults[to]
    if (fromRes) updatedResults[to] = fromRes; else delete updatedResults[to]
    if (toRes) updatedResults[from] = toRes; else delete updatedResults[from]
    setValidationResults(updatedResults)
  }

  function updateStep(index: number, field: keyof Step, value: any) {
    const updated = [...steps]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  async function handleValidateStepSelector(index: number, type: string, value: string) {
    if (!projectId || !value) return
    setValidatingIdx(index)
    
    // Find locator URL or default to project web app URL
    const loc = locators.find((l) => l.locatorValue === value)
    let pageUrl = loc?.pageUrl
    if (!pageUrl) {
      try {
        const res = await fetch(`/api/projects/${projectId}`)
        const data = await res.json()
        pageUrl = data.project?.webAppUrl
      } catch {}
    }

    if (!pageUrl) {
      setValidationResults((prev) => ({
        ...prev,
        [index]: { valid: false, message: "No page to check against. Add the website URL in the project settings, or save this locator with a page URL." },
      }))
      setValidatingIdx(null)
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/locators/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          locatorType: type,
          locatorValue: value,
        }),
      })

      const data = await res.json().catch(() => ({}))
      setValidationResults((prev) => ({
        ...prev,
        [index]: res.ok
          ? { valid: data.valid, message: data.message }
          : { valid: false, message: data.error || "The selector could not be checked. Try again." },
      }))
    } catch {
      setValidationResults((prev) => ({
        ...prev,
        [index]: { valid: false, message: "The selector could not be checked because the server could not be reached." },
      }))
    } finally {
      setValidatingIdx(null)
    }
  }

  const modeToggle = (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
      {([
        ["plain", "Plain English", MessageSquareText],
        ["detailed", "Detailed fields", SlidersHorizontal],
      ] as const).map(([m, label, Icon]) => (
        <button
          key={m}
          type="button"
          onClick={() => {
            setMode(m)
            setModeTouched(true)
          }}
          className={`flex items-center gap-1 rounded-md px-3 py-1 font-medium ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  )

  if (mode === "plain") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium text-foreground">Steps <span className="font-normal text-muted-foreground">{steps.length || ""}</span></h2>
          {modeToggle}
        </div>
        <PlainEnglishEditor
          steps={steps}
          onChange={onChange}
          projectId={projectId}
          manual={manual}
          onEditDetailed={() => {
            setMode("detailed")
            setModeTouched(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-foreground">Steps <span className="font-normal text-muted-foreground">{steps.length || ""}</span></h2>
        <div className="flex items-center gap-2">
          {modeToggle}
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4 mr-1" /> Add step
          </Button>
        </div>
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground">No steps yet. Click &ldquo;Add step&rdquo; to begin.</p>
      )}

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="border rounded-lg p-4 space-y-3 bg-card/45">
            {isPlainStep(step) && (
              <p className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                Written in plain English — it runs from its description. Edit it in the Plain English view; the fields below are a summary.
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Step {index + 1}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveStep(index, index - 1)}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveStep(index, index + 1)}
                  disabled={index === steps.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStep(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Saved Locators Integration */}
            {projectId && locators.length > 0 && (
              <div className="bg-accent/10 p-3 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Use saved locator</Label>
                  {step.targetValue && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleValidateStepSelector(index, step.targetType, step.targetValue)}
                      disabled={validatingIdx === index}
                      className="text-xs h-6 px-2 hover:bg-background flex items-center gap-1"
                    >
                      {validatingIdx === index ? <BusyDot /> : <RefreshCw className="h-3 w-3" />}
                      Validate selector
                    </Button>
                  )}
                </div>
                <select
                  value={locators.find((l) => l.locatorValue === step.targetValue && l.locatorType === step.targetType)?.id || ""}
                  onChange={(e) => {
                    const locId = e.target.value
                    if (!locId) {
                      updateStep(index, "targetValue", "")
                      return
                    }
                    const loc = locators.find((l) => l.id === locId)
                    if (loc) {
                      // Autofill fields
                      const updated = [...steps]
                      updated[index] = {
                        ...updated[index],
                        targetType: loc.locatorType,
                        targetValue: loc.locatorValue,
                        actionDescription: updated[index].actionDescription || `Click saved locator: ${loc.friendlyName}`,
                      }
                      onChange(updated)
                    }
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="">Select a saved locator...</option>
                  {locators.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.friendlyName} ({TARGET_TYPE_LABELS[loc.locatorType] || loc.locatorType}: {loc.locatorValue})
                    </option>
                  ))}
                </select>

                {validationResults[index] && (
                  <div className="flex items-center gap-1 text-xs font-medium pt-1">
                    {validationResults[index].valid ? (
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 fill-current" />
                        {validationResults[index].message}
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 fill-current" />
                        {validationResults[index].message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Action type</Label>
                <select
                  value={step.actionType}
                  onChange={(e) => updateStep(index, "actionType", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>{ACTION_TYPE_LABELS[t] || t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target type</Label>
                <select
                  value={step.targetType}
                  onChange={(e) => updateStep(index, "targetType", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {TARGET_TYPES.map((t) => (
                    <option key={t} value={t}>{TARGET_TYPE_LABELS[t] || t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Action Description *</Label>
              <Input
                value={step.actionDescription}
                onChange={(e) => updateStep(index, "actionDescription", e.target.value)}
                placeholder="Describe the action"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Target value</Label>
                <Input
                  value={step.targetValue}
                  onChange={(e) => updateStep(index, "targetValue", e.target.value)}
                  placeholder="#login-button"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Input value</Label>
                <Input
                  value={step.inputValue}
                  onChange={(e) => updateStep(index, "inputValue", e.target.value)}
                  placeholder="Text to fill or URL"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Expected Result *</Label>
              <Input
                value={step.expectedResult}
                onChange={(e) => updateStep(index, "expectedResult", e.target.value)}
                placeholder="What should happen?"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Timeout (ms)</Label>
              <Input
                type="number"
                value={step.timeoutMs}
                onChange={(e) => updateStep(index, "timeoutMs", parseInt(e.target.value) || 10000)}
              />
            </div>

            <AssertionBuilder
              assertions={step.assertions}
              onChange={(assertions) => updateStep(index, "assertions", assertions)}
            />
          </div>
        ))}
        {steps.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStep}
              className="w-full max-w-[200px] border-dashed hover:border-solid hover:bg-accent/40"
            >
              <Plus className="h-4 w-4 mr-1" /> Add step
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
