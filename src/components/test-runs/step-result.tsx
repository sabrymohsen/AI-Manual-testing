"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react"

interface StepResultProps {
  stepNumber: number
  actionDescription: string
  expectedResult: string
  status: string
  actualResult: string | null
  errorDetails: string | null
  durationMs: number
  screenshotBefore: string | null
  screenshotAfter: string | null
  actionMetadata?: any
}

export function StepResultItem({
  stepNumber,
  actionDescription,
  expectedResult,
  status,
  actualResult,
  errorDetails,
  durationMs,
  screenshotBefore,
  screenshotAfter,
  actionMetadata,
}: StepResultProps) {
  const [expanded, setExpanded] = useState(status === "Failed" || status === "SelfHealed")

  const statusIcon = {
    Passed: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    Failed: <XCircle className="h-5 w-5 text-red-600" />,
    Running: <Clock className="h-5 w-5 text-blue-600 animate-pulse" />,
    Pending: <Clock className="h-5 w-5 text-muted-foreground" />,
    Warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    Blocked: <XCircle className="h-5 w-5 text-orange-600" />,
    Skipped: <AlertTriangle className="h-5 w-5 text-muted-foreground" />,
    SelfHealed: <Sparkles className="h-5 w-5 text-primary animate-pulse" />,
  }[status] || <Clock className="h-5 w-5 text-muted-foreground" />

  const statusColor = {
    Passed: "bg-green-50 border-green-200",
    Failed: "bg-red-50 border-red-200",
    Running: "bg-blue-50 border-blue-200",
    Pending: "bg-muted/50 border-border",
    SelfHealed: "bg-primary/10 border-primary/25 backdrop-blur-sm shadow-sm",
  }[status] || "bg-muted/50 border-border"

  const wasHealed = status === "SelfHealed" || actionMetadata?.wasHealed

  return (
    <div className={`border rounded-lg ${statusColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          {statusIcon}
          <div className="text-left">
            <p className="font-medium text-sm">
              Step {stepNumber}: {actionDescription}
            </p>
            <p className="text-xs text-muted-foreground">
              {durationMs > 0 ? `${durationMs}ms` : status === "SelfHealed" ? "Self Healed" : status}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <div>
            <p className="text-xs text-muted-foreground font-semibold">Expected:</p>
            <p className="text-sm text-foreground">{expectedResult}</p>
          </div>
          {actualResult && (
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Actual:</p>
              <p className="text-sm text-foreground">{actualResult}</p>
            </div>
          )}
          {errorDetails && (
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Error:</p>
              <p className="text-sm text-destructive">{errorDetails}</p>
            </div>
          )}

          {/* Self Healing Diagnostics Panel */}
          {wasHealed && actionMetadata && (
            <div className="mt-3 p-3.5 rounded-lg border border-primary/25 bg-primary/10 backdrop-blur-sm shadow-sm space-y-2.5">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                <span>Self-Healing Diagnostics</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded bg-white/70 border border-indigo-50/50">
                  <p className="text-muted-foreground font-medium mb-1">Original Locator</p>
                  <code className="text-[10px] text-red-600 break-all select-all font-mono">
                    {actionMetadata.oldLocator || "Unknown"}
                  </code>
                </div>
                <div className="p-2 rounded bg-white/70 border border-indigo-50/50">
                  <p className="text-muted-foreground font-medium mb-1">Healed Locator</p>
                  <code className="text-[10px] text-green-600 break-all select-all font-mono">
                    {actionMetadata.newLocator || "Unknown"}
                  </code>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs">
                <div>
                  <span className="text-muted-foreground font-medium">Strategy: </span>
                  <span className="capitalize font-semibold text-primary font-mono text-[11px]">
                    {(actionMetadata.healingMethod || "fallback_locator").replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">Confidence Score: </span>
                  <span className={`font-bold ${
                    actionMetadata.confidence >= 90 ? "text-green-600" :
                    actionMetadata.confidence >= 70 ? "text-yellow-600" : "text-orange-600"
                  }`}>
                    {actionMetadata.confidence || 0}%
                  </span>
                </div>
              </div>

              {actionMetadata.confidence >= 90 ? (
                <div className="p-2 rounded bg-green-50/70 border border-green-200/50 text-[11px] text-green-800 leading-relaxed">
                  <strong>Auto-Updated:</strong> This locator has a high confidence score (&ge; 90%). The locator has been automatically updated in the database.
                </div>
              ) : actionMetadata.confidence >= 70 ? (
                <div className="p-2 rounded bg-yellow-50/70 border border-yellow-200/50 text-[11px] text-yellow-800 leading-relaxed">
                  <strong>Suggestion:</strong> This locator has been healed with moderate confidence ({actionMetadata.confidence}%). We suggest updating the test step in your test case to this new selector.
                </div>
              ) : (
                <div className="p-2 rounded bg-orange-50/70 border border-orange-200/50 text-[11px] text-orange-800 leading-relaxed">
                  <strong>Warning:</strong> This step was healed with low confidence ({actionMetadata.confidence}%). The locator might be unstable. Consider reviewing the UI element.
                </div>
              )}
            </div>
          )}

          {/* Failed Step Recovery / Suggestions Panel */}
          {status === "Failed" && actionMetadata?.suggestManualRerecord && (
            <div className="mt-3 p-3.5 rounded-lg border border-red-200 bg-red-50/30 backdrop-blur-sm shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-red-900 font-semibold text-xs">
                <AlertTriangle className="h-4 w-4 text-red-600 animate-bounce" />
                <span>Healing Failure Recovery Suggestions</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                All auto-healing strategies were exhausted. We recommend manually re-recording this test step to build updated selectors.
              </p>
              {actionMetadata.domSnapshotPath && (
                <div className="pt-1 text-xs">
                  <span className="text-muted-foreground font-medium">DOM Snapshot Captured: </span>
                  <a 
                    href={`/api/files/${actionMetadata.domSnapshotPath}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:text-primary hover:underline break-all"
                  >
                    {actionMetadata.domSnapshotPath.split("/").pop() || "Download DOM Snapshot"}
                  </a>
                </div>
              )}
            </div>
          )}

          {screenshotBefore && (
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1">Before:</p>
              <img
                src={`/api/files/${screenshotBefore}`}
                alt={`Step ${stepNumber} before`}
                className="max-w-full border rounded-lg shadow-sm"
              />
            </div>
          )}
          {screenshotAfter && (
            <div>
              <p className="text-xs text-muted-foreground font-semibold mb-1">After:</p>
              <img
                src={`/api/files/${screenshotAfter}`}
                alt={`Step ${stepNumber} after`}
                className="max-w-full border rounded-lg shadow-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
