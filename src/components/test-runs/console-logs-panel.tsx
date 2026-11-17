"use client"

interface ConsoleLog {
  id: string
  level: string
  message: string
  source: string
  timestamp: string
}

interface ConsoleLogsPanelProps {
  logs: ConsoleLog[]
}

const levelColors: Record<string, string> = {
  error: "text-red-600",
  warning: "text-yellow-600",
  info: "text-blue-600",
  debug: "text-muted-foreground",
}

export function ConsoleLogsPanel({ logs }: ConsoleLogsPanelProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No console logs captured</p>
  }

  return (
    <div className="bg-gray-950 text-gray-100 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2 py-0.5">
          <span className="text-muted-foreground shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={`shrink-0 ${levelColors[log.level] || ""}`}>
            [{log.level.toUpperCase()}]
          </span>
          <span className="break-all">{log.message}</span>
        </div>
      ))}
    </div>
  )
}
