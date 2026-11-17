"use client"

/**
 * "Tracker" card in the task panel: send this task to the project's Jira /
 * Azure DevOps / OpenProject / ClickUp, open it there, or push an update.
 * Once sent, later edits on the board update the tracker item automatically.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, RefreshCw, Send, Share2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

const NAMES: Record<string, string> = { Jira: "Jira", AzureDevOps: "Azure DevOps", OpenProject: "OpenProject", ClickUp: "ClickUp" }

interface TrackerInfo {
  provider: string | null
  linked: null | { externalId: string; url: string | null; lastSyncedAt: string | null; status: string | null; error: string | null }
}

export function TaskTrackerPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const key = ["scrum", "task", taskId, "tracker"]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await (await fetch(`/api/scrum/tasks/${taskId}/tracker`)).json()) as TrackerInfo,
  })
  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scrum/tasks/${taskId}/tracker`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Couldn't reach the tracker")
      return body as TrackerInfo & { result: { status: string } }
    },
    onSuccess: (body) => {
      qc.setQueryData(key, body)
      toast.success(body.result.status === "created" ? `Created in ${NAMES[body.provider || ""] || "the tracker"}` : "Tracker item updated")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const name = data?.provider ? NAMES[data.provider] || data.provider : null

  return (
    <div>
      <h4 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
        <Share2 className="h-4 w-4 text-indigo-500" /> Tracker
      </h4>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !name ? (
        <p className="text-xs text-muted-foreground">No tracker connected. Connect Jira, Azure DevOps, OpenProject or ClickUp under the project’s Integrations to send tasks there.</p>
      ) : data?.linked ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            {data.linked.url ? (
              <a href={data.linked.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                {name} #{data.linked.externalId} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="font-semibold">{name} #{data.linked.externalId}</span>
            )}
            <button
              onClick={() => send.mutate()}
              disabled={send.isPending}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
              title="Push the current title, description, status and priority"
            >
              {send.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Update
            </button>
          </div>
          <p className="text-muted-foreground">
            {data.linked.status === "failed" ? (
              <span className="text-destructive">Last update failed: {data.linked.error}</span>
            ) : (
              <>Edits here update it automatically{data.linked.lastSyncedAt ? ` · synced ${formatDistanceToNow(new Date(data.linked.lastSyncedAt), { addSuffix: true })}` : ""}.</>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">Not in {name} yet.</p>
          <button
            onClick={() => send.mutate()}
            disabled={send.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {send.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send to {name}
          </button>
        </div>
      )}
    </div>
  )
}
