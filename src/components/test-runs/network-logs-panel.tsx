"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "@/components/ui/icons"

interface NetworkLog {
  id: string
  url: string
  method: string
  status: number | null
  error: string | null
  resourceType: string | null
  durationMs: number
  timestamp: string
}

interface NetworkLogsPanelProps {
  logs: NetworkLog[]
}

export function NetworkLogsPanel({ logs }: NetworkLogsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No network logs captured</p>
  }

  return (
    <div className="border rounded-lg divide-y text-sm max-h-64 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id}>
          <button
            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
            className="w-full flex items-center gap-3 p-2 text-left hover:bg-accent"
          >
            <span className={`text-xs font-mono w-8 ${
              log.status && log.status >= 400 ? "text-red-600" :
              log.status && log.status >= 300 ? "text-yellow-600" :
              "text-green-600"
            }`}>
              {log.status || "ERR"}
            </span>
            <span className="text-xs font-mono w-12 text-muted-foreground">{log.method}</span>
            <span className="text-xs truncate flex-1">{log.url}</span>
            {expanded === log.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded === log.id && (
            <div className="px-3 pb-2 space-y-1 text-xs text-muted-foreground">
              <p>URL: {log.url}</p>
              <p>Method: {log.method}</p>
              <p>Status: {log.status || "Failed"}</p>
              {log.error && <p className="text-destructive">Error: {log.error}</p>}
              <p>Type: {log.resourceType || "Unknown"}</p>
              <p>Duration: {log.durationMs}ms</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
