"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"

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
}: StepResultProps) {
  const [expanded, setExpanded] = useState(status === "Failed")

  const statusIcon = {
    Passed: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    Failed: <XCircle className="h-5 w-5 text-red-600" />,
    Running: <Clock className="h-5 w-5 text-blue-600 animate-pulse" />,
    Pending: <Clock className="h-5 w-5 text-gray-400" />,
    Warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    Blocked: <XCircle className="h-5 w-5 text-orange-600" />,
    Skipped: <AlertTriangle className="h-5 w-5 text-gray-400" />,
  }[status] || <Clock className="h-5 w-5 text-gray-400" />

  const statusColor = {
    Passed: "bg-green-50 border-green-200",
    Failed: "bg-red-50 border-red-200",
    Running: "bg-blue-50 border-blue-200",
    Pending: "bg-gray-50 border-gray-200",
  }[status] || "bg-gray-50 border-gray-200"

  return (
    <div className={`border rounded-lg ${statusColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          {statusIcon}
          <div className="text-left">
            <p className="font-medium">
              Step {stepNumber}: {actionDescription}
            </p>
            <p className="text-sm text-muted-foreground">
              {durationMs > 0 ? `${durationMs}ms` : status}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Expected:</p>
            <p className="text-sm">{expectedResult}</p>
          </div>
          {actualResult && (
            <div>
              <p className="text-xs text-muted-foreground">Actual:</p>
              <p className="text-sm">{actualResult}</p>
            </div>
          )}
          {errorDetails && (
            <div>
              <p className="text-xs text-muted-foreground">Error:</p>
              <p className="text-sm text-destructive">{errorDetails}</p>
            </div>
          )}
          {screenshotBefore && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Before:</p>
              <img
                src={`/api/files/${screenshotBefore}`}
                alt={`Step ${stepNumber} before`}
                className="max-w-full border rounded"
              />
            </div>
          )}
          {screenshotAfter && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">After:</p>
              <img
                src={`/api/files/${screenshotAfter}`}
                alt={`Step ${stepNumber} after`}
                className="max-w-full border rounded"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
