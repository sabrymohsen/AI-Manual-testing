"use client"

import { useEffect, useState } from "react"
import { ModuleSelect, useProjectModules } from "@/components/bug-reports/module-select"
import { applyModulePrefix } from "@/lib/bug-reports/title-prefix"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Bug, X, Sparkles, Paperclip, Video, Trash2, Check, AlertTriangle } from "lucide-react"

/**
 * Shared bug-creation modal — extracted from the Bug Reports page so the same
 * form (and the same validated API path) is used everywhere, including the
 * Live QA Session. All submissions go through POST
 * /api/projects/[projectId]/bug-reports (Zod-validated); evidence files are
 * uploaded to /api/bug-reports/[bugId]/attachments after creation.
 */

export interface CreateBugStep {
  stepNumber: number
  actionDescription: string
  expectedResult?: string | null
}

export interface SessionAttachment {
  filePath: string
  fileName: string
  /** "image" renders a thumbnail; "video" renders a labeled tile. Defaults to image. */
  kind?: "image" | "video"
}

interface CreateBugModalProps {
  projectId: string
  open: boolean
  onClose: () => void
  onCreated?: (bug: any, opts: { syncedToOpenProject: boolean }) => void
  /** Optional prefills (e.g. from a Live QA Session). */
  initialValues?: {
    title?: string
    description?: string
    expectedResult?: string
    actualResult?: string
    environment?: string
    /** Pre-select the module/service (a TestSuite id). */
    suiteId?: string
  }
  /**
   * Steps recorded during a Live QA Session, offered as an opt-in inside the
   * modal. The steps list starts empty; the tester can click "Add recorded
   * steps" to pull these into the editable Reproduction Steps builder (and then
   * edit, delete, or add more) — or ignore them entirely.
   */
  sessionSteps?: CreateBugStep[]
  /** "Bug Source" dropdown options, pulled from an OpenProject list field. */
  sourceOptions?: string[]
  /** Live QA session id to link this bug to (for Session History bug counts). */
  recordingSessionId?: string | null
  /** Auto-captured live-session context, passed through the validated API fields. */
  sessionContext?: {
    pageUrl?: string | null
    consoleLogs?: string | null
    networkErrors?: string | null
    screenshotPath?: string | null
  }
  /** Existing server-side artifacts (session screenshots/recordings) to attach after creation. */
  initialAttachmentPaths?: SessionAttachment[]
  /**
   * Full pool of session artifacts the tester can pick from (all screenshots +
   * recordings). Rendered as a selectable thumbnail gallery; the ones in
   * `initialAttachmentPaths` start selected. Lets a tester with many
   * screenshots choose which to attach instead of always getting the latest.
   */
  attachmentChoices?: SessionAttachment[]
}

export function CreateBugModal({
  projectId,
  open,
  onClose,
  onCreated,
  initialValues,
  sessionSteps,
  sessionContext,
  initialAttachmentPaths,
  attachmentChoices,
  sourceOptions,
  recordingSessionId,
}: CreateBugModalProps) {
  // Label with whichever tracker this project is connected to (Jira / Azure /
  // OpenProject / …) rather than hardcoding one vendor.
  const { name: trackerName } = useProjectIntegration(projectId)
  const [title, setTitle] = useState("")
  const [desc, setDesc] = useState("")
  const [severity, setSeverity] = useState("Medium")
  const [priority, setPriority] = useState("Medium")
  const [env, setEnv] = useState("Staging")
  const [browser, setBrowser] = useState("Chromium")
  const [source, setSource] = useState("")
  // Module/service this defect belongs to (a TestSuite id); "" = Unfiled.
  const [suiteId, setSuiteId] = useState("")
  /**
   * Loaded here rather than inside ModuleSelect because the title prefix needs
   * the NAMES: the one being applied, and all of them, so an existing prefix is
   * only rewritten when it is a module's and not something like "[iOS 17]".
   */
  const { modules: projectModules } = useProjectModules(projectId, open)
  const [expected, setExpected] = useState("")
  const [actual, setActual] = useState("")
  const [steps, setSteps] = useState<CreateBugStep[]>([])
  const [syncOP, setSyncOP] = useState(false)
  const [saving, setSaving] = useState(false)

  // Possible duplicates for the title being typed.
  const [duplicateMatches, setDuplicateMatches] = useState<
    { id: string; bugKey: string | null; title: string; status: string; score: number }[]
  >([])
  const [error, setError] = useState("")
  const [aiGenerating, setAiGenerating] = useState(false)
  // AI Assist: the tester's plain-language prompt and an optional picture.
  // Kept separate from the Description field so regenerating never clobbers
  // text the tester wrote by hand.
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiImage, setAiImage] = useState<File | null>(null)
  const [aiNotice, setAiNotice] = useState<{ kind: "ai" | "template"; text: string } | null>(null)

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState("")
  const [assignee, setAssignee] = useState("")
  const [parent, setParent] = useState("")

  // Session artifacts pre-attached from a Live QA Session (removable)
  const [sessionAttachments, setSessionAttachments] = useState<SessionAttachment[]>([])

  const [opMembers, setOpMembers] = useState<Array<{ id: string; name: string }>>([])

  // Parent-task candidates pulled from the tracker, so testers can pick a real
  // task instead of having to know its work-package number.
  const [parentOptions, setParentOptions] = useState<
    Array<{ id: string; subject: string; type: string | null }>
  >([])
  const [parentLoading, setParentLoading] = useState(false)

  /**
   * Look for existing bugs matching the title being typed.
   *
   * Debounced, and aborts the in-flight request on each keystroke so a slow
   * early response can't overwrite the results for a longer, later title.
   */
  useEffect(() => {
    if (!open || title.trim().length < 6) {
      setDuplicateMatches([])
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ title: title.trim() })
        const res = await fetch(
          `/api/projects/${projectId}/bug-reports/similar?${p.toString()}`,
          { signal: controller.signal }
        )
        if (!res.ok) return
        const data = await res.json()
        setDuplicateMatches(Array.isArray(data.matches) ? data.matches : [])
      } catch {
        // Aborted or offline — a missing hint isn't worth an error message.
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, title, projectId])

  // Reset + apply prefills every time the modal opens
  useEffect(() => {
    if (!open) return
    setTitle(initialValues?.title || "")
    setDuplicateMatches([])
    setDesc(initialValues?.description || "")
    setSeverity("Medium")
    setPriority("Medium")
    setEnv(initialValues?.environment || "Staging")
    setBrowser("Chromium")
    setSource("")
    setSuiteId(initialValues?.suiteId || "")
    setExpected(initialValues?.expectedResult || "")
    setActual(initialValues?.actualResult || "")
    setSteps([])
    setSyncOP(false)
    setError("")
    setScreenshotFile(null)
    setVideoFile(null)
    setVideoUrl("")
    setAssignee("")
    setParent("")
    setParentOptions([])
    setAiPrompt("")
    setAiImage(null)
    setAiNotice(null)
    setSessionAttachments(initialAttachmentPaths || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Assignable developers — the project's team pool, which is synced from
  // whichever tracker is connected (Jira / Azure / OpenProject) plus any manual
  // members. This used to hit the OpenProject-only members endpoint, so the
  // dropdown stayed empty for every other provider. The option value is the
  // tracker's own user id (externalId), which is what bug sync sends as the
  // assignee; manual members without one fall back to their pool id.
  useEffect(() => {
    if (!open) return
    fetch(`/api/projects/${projectId}/team`)
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) =>
        setOpMembers(
          Array.isArray(data.members)
            ? data.members
                .filter((m: any) => m.active)
                .map((m: any) => ({ id: m.externalId || m.id, name: m.name }))
            : []
        )
      )
      .catch(() => setOpMembers([]))
  }, [projectId, open])

  /**
   * Parent-task candidates: open tasks on open, then whatever the tester types
   * (matched against title *or* number by the tracker). Debounced, and aborts
   * the in-flight request per keystroke so a slow early response can't replace
   * the results for a later query.
   */
  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    const query = parent.trim()
    const timer = setTimeout(async () => {
      setParentLoading(true)
      try {
        const qs = query ? `?search=${encodeURIComponent(query)}` : ""
        const res = await fetch(
          `/api/projects/${projectId}/integrations/openproject/work-packages${qs}`,
          { signal: controller.signal }
        )
        if (!res.ok) return
        const data = await res.json()
        setParentOptions(Array.isArray(data.workPackages) ? data.workPackages : [])
      } catch {
        // Aborted or offline — the field still takes a hand-typed id.
      } finally {
        if (!controller.signal.aborted) setParentLoading(false)
      }
    }, query ? 350 : 0)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, parent, projectId])

  // Read a File as raw base64 (no data: prefix)
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(",")[1] || "")
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  /** Paste a screenshot straight into the AI prompt box. */
  const handleAiPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData?.items || [])
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile()
    if (file) {
      e.preventDefault()
      setAiImage(file)
    }
  }

  const moduleNames = projectModules.map(m => m.name)
  const moduleNameFor = (id: string) => projectModules.find(m => m.id === id)?.name ?? null

  /**
   * Choose a module, and carry the title with it.
   *
   * The team writes titles as "[Module] what went wrong", so the prefix follows
   * the choice instead of being retyped. Re-picking swaps the old prefix rather
   * than stacking a second one, and Unfiled removes it.
   */
  const chooseModule = (id: string) => {
    setSuiteId(id)
    setTitle(current => applyModulePrefix(current, moduleNameFor(id), moduleNames))
  }

  // AI Assist: draft the whole bug from a plain-language prompt + picture.
  const handleGenerateWithAI = async () => {
    // The prompt box is the intended input, but fall back to whatever the
    // tester already typed / attached so the button is never a dead end.
    const promptText = aiPrompt.trim() || desc.trim()
    const image = aiImage || screenshotFile

    if (!promptText && !image) {
      setError("Describe the bug or attach a picture for the AI to work from.")
      return
    }
    setAiGenerating(true)
    setError("")
    setAiNotice(null)
    try {
      let imageBase64: string | null = null
      let imageMimeType: string | null = null
      if (image) {
        imageBase64 = await fileToBase64(image)
        imageMimeType = image.type || null
      }

      const res = await fetch(`/api/projects/${projectId}/ai-generate-bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: promptText, imageBase64, imageMimeType }),
      })

      if (res.ok) {
        const { draft } = await res.json()
        // The model writes the sentence; the module is ours to stamp on, so a
        // draft lands already matching the team's title convention.
        if (draft.title) setTitle(applyModulePrefix(draft.title, moduleNameFor(suiteId), moduleNames))
        // Fall back to the tester's own words when the model returned no prose.
        if (draft.description) setDesc(draft.description)
        else if (!desc.trim() && promptText) setDesc(promptText)
        if (draft.severity) setSeverity(draft.severity)
        if (draft.priority) setPriority(draft.priority)
        if (draft.expectedResult) setExpected(draft.expectedResult)
        if (draft.actualResult) setActual(draft.actualResult)
        // Carry the AI picture into the bug as evidence, unless one is attached.
        if (aiImage && !screenshotFile) setScreenshotFile(aiImage)
        setAiNotice(
          draft.provider === "rule-based"
            ? {
                kind: "template",
                text: "Drafted from a template — no AI provider is configured, so this is a best-effort guess. Review every field.",
              }
            : { kind: "ai", text: "Draft ready — review and edit before saving." }
        )
        if (Array.isArray(draft.steps) && draft.steps.length > 0) {
          setSteps(
            draft.steps.map((s: any, i: number) => ({
              stepNumber: i + 1,
              actionDescription: s.actionDescription || "",
              expectedResult: s.expectedResult || "",
            }))
          )
        }
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || "AI generation failed")
      }
    } catch {
      setError("Network error during AI generation")
    } finally {
      setAiGenerating(false)
    }
  }

  // Toggle a session artifact in/out of the attachment selection.
  const isAttached = (filePath: string) => sessionAttachments.some((a) => a.filePath === filePath)
  const toggleAttachment = (att: SessionAttachment) => {
    setSessionAttachments((prev) =>
      prev.some((a) => a.filePath === att.filePath)
        ? prev.filter((a) => a.filePath !== att.filePath)
        : [...prev, att]
    )
  }

  // Steps builder helpers
  const addStep = () => {
    setSteps([...steps, { stepNumber: steps.length + 1, actionDescription: "" }])
  }
  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepNumber: i + 1 })))
  }
  const updateStepText = (idx: number, text: string) => {
    const updated = [...steps]
    updated[idx].actionDescription = text
    setSteps(updated)
  }
  // Opt-in import of the Live QA recorded steps — appended to whatever is already
  // in the builder, then renumbered. Still fully editable/removable afterwards.
  const addRecordedSteps = () => {
    if (!sessionSteps || sessionSteps.length === 0) return
    setSteps((prev) =>
      [...prev, ...sessionSteps].map((s, i) => ({
        stepNumber: i + 1,
        actionDescription: s.actionDescription,
        expectedResult: s.expectedResult ?? null,
      }))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError("Title is required")
      return
    }

    setSaving(true)
    setError("")

    // Format steps builder as stepsToReproduce string
    let stepsStr = desc + "\n\nSteps:\n"
    steps.forEach((s, idx) => {
      stepsStr += `${idx + 1}. ${s.actionDescription}`
      if (s.expectedResult) stepsStr += ` — Expected: ${s.expectedResult}`
      stepsStr += "\n"
    })

    const body: any = {
      title,
      severity,
      priority,
      environment: env,
      stepsToReproduce: stepsStr,
      expectedResult: expected,
      actualResult: actual,
      status: "Open",
    }
    if (source) body.source = source
    if (suiteId) body.suiteId = suiteId
    if (recordingSessionId) body.recordingSessionId = recordingSessionId
    // A pasted video URL is stored directly; an uploaded video file takes precedence.
    if (videoUrl.trim() && !videoFile) {
      body.videoUrl = videoUrl.trim()
    }
    if (assignee) body.assignedTo = assignee
    if (parent.trim()) body.openProjectParentId = parent.trim()

    // Live QA Session auto-context — same validated API fields
    if (sessionContext) {
      if (sessionContext.pageUrl) body.pageUrl = sessionContext.pageUrl
      if (sessionContext.consoleLogs) body.consoleLogs = sessionContext.consoleLogs
      if (sessionContext.networkErrors) body.networkErrors = sessionContext.networkErrors
      if (sessionContext.screenshotPath) body.screenshotPath = sessionContext.screenshotPath
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        const newBugId = data.bugReport.id

        // Upload evidence files now that the bug exists.
        const uploadFile = async (file: File) => {
          const fd = new FormData()
          fd.append("file", file)
          const up = await fetch(`/api/bug-reports/${newBugId}/attachments`, { method: "POST", body: fd })
          if (!up.ok) {
            const d = await up.json().catch(() => ({}))
            throw new Error(d.error || "Upload failed")
          }
        }
        // Attach existing session artifacts by server path (ownership-checked server-side).
        const attachPath = async (att: SessionAttachment) => {
          const up = await fetch(`/api/bug-reports/${newBugId}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath: att.filePath }),
          })
          if (!up.ok) {
            const d = await up.json().catch(() => ({}))
            throw new Error(d.error || "Attach failed")
          }
        }
        let uploadError: string | null = null
        try {
          if (screenshotFile) await uploadFile(screenshotFile)
          if (videoFile) await uploadFile(videoFile)
          for (const att of sessionAttachments) await attachPath(att)
        } catch (upErr: any) {
          uploadError = upErr.message
        }

        // Auto OpenProject sync if checked (after evidence is attached)
        let synced = false
        if (syncOP) {
          try {
            const syncRes = await fetch(`/api/bug-reports/${newBugId}/sync/openproject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            })
            synced = syncRes.ok
          } catch {
            synced = false
          }
        }

        if (uploadError) {
          setError(`Bug created, but evidence upload failed: ${uploadError}`)
        }
        onCreated?.(data.bugReport, { syncedToOpenProject: synced })
        onClose()
      } else {
        const data = await res.json()
        setError(data.error || "Failed to submit bug report")
      }
    } catch {
      setError("Network error saving bug report")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[550px] bg-background rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 text-xs font-semibold select-none">

        <div className="p-5 border-b flex items-center justify-between bg-accent/10">
          <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-foreground">
            <Bug className="h-4.5 w-4.5 text-indigo-500" /> Create Bug Report
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 font-bold text-[11px]">
              {error}
            </div>
          )}

          {/* AI Assist — describe the defect in plain words, optionally attach a
              screenshot, and let the model fill the whole form. */}
          <div className="p-3.5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-purple-50/40 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span className="font-extrabold text-indigo-700 text-[11px] uppercase tracking-wide">
                Write this bug with AI
              </span>
            </div>

            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onPaste={handleAiPaste}
              rows={3}
              dir="auto"
              placeholder="Describe what went wrong in your own words — e.g. 'checkout button does nothing on mobile after applying a discount code'. Paste a screenshot here too."
              className="w-full border rounded-lg p-2.5 bg-background font-semibold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />

            <div className="flex items-center gap-2 flex-wrap">
              <label className="h-8 px-3 rounded-lg border bg-background text-[11px] font-bold flex items-center gap-1.5 cursor-pointer hover:bg-muted">
                <Paperclip className="h-3.5 w-3.5" />
                {aiImage ? "Change picture" : "Attach picture"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setAiImage(e.target.files?.[0] || null)}
                />
              </label>

              {aiImage && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                  <Check className="h-3 w-3" />
                  {aiImage.name.length > 28 ? `${aiImage.name.slice(0, 28)}…` : aiImage.name}
                  <button
                    type="button"
                    onClick={() => setAiImage(null)}
                    className="text-indigo-400 hover:text-indigo-700"
                    aria-label="Remove picture"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              <Button
                type="button"
                onClick={handleGenerateWithAI}
                disabled={aiGenerating}
                className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiGenerating ? "Writing the bug…" : "Generate bug report"}
              </Button>
            </div>

            <p className="text-[10px] font-semibold text-muted-foreground">
              Fills title, description, severity, priority, steps and expected/actual results.
              Everything stays editable before you save.
            </p>

            {/* Say which engine answered: a rule-based draft means no AI provider
                is configured, and the tester should know the difference. */}
            {aiNotice && (
              <p
                className={`text-[10px] font-bold ${
                  aiNotice.kind === "template" ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {aiNotice.text}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-bold">Defect Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              dir="auto"
              placeholder="e.g., Application crashes on checkout submit"
              className="h-9 bg-background"
              required
            />

            {/* Possible duplicates, checked as the title is typed. The app could
                already merge duplicates after the fact via mark-duplicate, but
                that only helps once two people have each written the same defect
                up — catching it here is what prevents the duplicate. */}
            {duplicateMatches.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {duplicateMatches.length === 1
                    ? "A similar defect already exists"
                    : `${duplicateMatches.length} similar defects already exist`}
                </p>
                <div className="mt-1.5 space-y-1">
                  {duplicateMatches.map((m) => (
                    <a
                      key={m.id}
                      href={`/projects/${projectId}/bug-reports?bugId=${m.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md bg-background/70 px-2 py-1.5 text-[11px] transition-colors hover:bg-background"
                    >
                      <span className="shrink-0 font-mono font-bold text-amber-700 dark:text-amber-400">
                        {m.bugKey || "BUG"}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={m.title}>{m.title}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                        {m.status}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        {m.score}%
                      </span>
                    </a>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-amber-700/80 dark:text-amber-400/80">
                  Still different? Carry on filing — this is a hint, not a block.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Severity</Label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Priority</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-bold">Module / Service</Label>
            <ModuleSelect
              projectId={projectId}
              value={suiteId}
              onChange={chooseModule}
              enabled={open}
              modules={projectModules}
            />
            <p className="text-[10px] text-muted-foreground font-medium">
              Groups this defect in the QA report, and prefixes the title as
              <span className="font-bold"> [Module]</span>. Left empty, it inherits the linked test
              case&apos;s module.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Environment</Label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3"
              >
                <option value="Dev">Dev</option>
                <option value="Staging">Staging</option>
                <option value="UAT">UAT</option>
                <option value="Production">Production</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Target Browser</Label>
              <select
                value={browser}
                onChange={(e) => setBrowser(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3"
              >
                <option value="Chromium">Chromium</option>
                <option value="Firefox">Firefox</option>
                <option value="WebKit">WebKit</option>
              </select>
            </div>
          </div>

          {/* Bug Source — options pulled from the tracker's list field */}
          {sourceOptions && sourceOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Bug Source</Label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3"
              >
                <option value="">— Select source —</option>
                {sourceOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-muted-foreground font-bold">General Description / Summary Details</Label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              dir="auto"
              placeholder="Summarize the issue context..."
              className="w-full border rounded-lg p-2.5 bg-background font-semibold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Steps builder list */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-foreground">Reproduction Steps</span>
              <Button
                type="button"
                variant="ghost"
                onClick={addStep}
                className="h-6 text-[9px] uppercase font-extrabold text-indigo-600"
              >
                + Add Step
              </Button>
            </div>

            {/* Opt-in: pull the steps recorded in this Live QA session into the
                builder. Shown whenever recorded steps are available. */}
            {sessionSteps && sessionSteps.length > 0 && (
              <button
                type="button"
                onClick={addRecordedSteps}
                className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/[0.08] text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/[0.14] transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Add {sessionSteps.length} recorded step{sessionSteps.length === 1 ? "" : "s"} from this session
              </button>
            )}

            {steps.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic text-center py-2">No steps listed. Click add step to define instructions.</p>
            ) : (
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{idx + 1}.</span>
                    <Input
                      value={step.actionDescription}
                      onChange={(e) => updateStepText(idx, e.target.value)}
                      dir="auto"
                      placeholder="Step description..."
                      className="h-8 text-xs bg-background flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-muted-foreground hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Expected Result</Label>
              <Input
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                dir="auto"
                placeholder="What should happen..."
                className="h-9 bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Actual Result</Label>
              <Input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                dir="auto"
                placeholder="What happened instead..."
                className="h-9 bg-background"
              />
            </div>
          </div>

          {/* Assignment & linking */}
          <div className="grid grid-cols-2 gap-4 border-t pt-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Assign To</Label>
              {opMembers.length > 0 ? (
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
                >
                  <option value="">Unassigned</option>
                  {opMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Developer email..."
                  className="h-9 bg-background"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Parent Task ({trackerName} WP ID)</Label>
              {/* Type to search the tracker's tasks by title or number and pick
                  one; the field still accepts a raw id typed by hand. */}
              <Input
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                list="create-bug-parent-options"
                placeholder={
                  parentOptions.length > 0 ? "Search a task, or type an ID…" : "e.g. 1234"
                }
                className="h-9 bg-background"
              />
              <datalist id="create-bug-parent-options">
                {parentOptions.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    #{wp.id} — {wp.subject}
                    {wp.type ? ` (${wp.type})` : ""}
                  </option>
                ))}
              </datalist>
              {parentLoading && (
                <span className="text-[10px] text-muted-foreground">Searching tasks…</span>
              )}
            </div>
          </div>

          {/* Evidence: session artifacts + screenshot / video file / video URL */}
          <div className="space-y-3 border-t pt-3">
            <span className="font-bold text-foreground">Evidence (optional)</span>

            {/* Picker gallery: when the caller passes the full pool of session
                artifacts, let the tester choose which to attach (selected ones
                start from initialAttachmentPaths). */}
            {attachmentChoices && attachmentChoices.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground font-bold">
                  From this session &mdash; tap to attach
                  <span className="ml-1 font-semibold text-[10px] text-muted-foreground/80">
                    ({sessionAttachments.length} selected)
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-2 max-h-[190px] overflow-y-auto pr-1">
                  {attachmentChoices.map((att) => {
                    const selected = isAttached(att.filePath)
                    const isVideo = att.kind === "video"
                    return (
                      <button
                        key={att.filePath}
                        type="button"
                        onClick={() => toggleAttachment(att)}
                        title={att.fileName}
                        className={`group relative border rounded-lg overflow-hidden aspect-[4/3] bg-muted/40 transition-all ${
                          selected ? "ring-2 ring-indigo-500 border-indigo-500" : "hover:ring-2 hover:ring-indigo-300"
                        }`}
                      >
                        {isVideo ? (
                          <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                            <Video className="h-5 w-5 text-indigo-500" />
                            <span className="text-[8px] font-bold uppercase">Video</span>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${encodeURIComponent(att.filePath)}`}
                            alt={att.fileName}
                            className="h-full w-full object-cover"
                          />
                        )}
                        {selected && (
                          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        )}
                        {!selected && (
                          <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                            Attach
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              sessionAttachments.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground font-bold">From this session</Label>
                  {sessionAttachments.map((att) => (
                    <div key={att.filePath} className="flex items-center gap-2 p-2 border rounded-lg bg-accent/20">
                      <Paperclip className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate flex-1 text-[11px]" title={att.fileName}>{att.fileName}</span>
                      <button
                        type="button"
                        onClick={() => setSessionAttachments((prev) => prev.filter((a) => a.filePath !== att.filePath))}
                        className="text-muted-foreground hover:text-rose-600 p-0.5"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Screenshot upload */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground font-bold">Screenshot</Label>
                <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-background cursor-pointer hover:bg-accent/40 transition-colors text-[11px] font-semibold text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{screenshotFile ? screenshotFile.name : "Choose image..."}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                  />
                </label>
                {screenshotFile && (
                  <button type="button" onClick={() => setScreenshotFile(null)} className="text-[9px] text-rose-500 font-bold">
                    Remove screenshot
                  </button>
                )}
              </div>

              {/* Video upload */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground font-bold">Video File</Label>
                <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-background cursor-pointer hover:bg-accent/40 transition-colors text-[11px] font-semibold text-muted-foreground">
                  <Video className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{videoFile ? videoFile.name : "Choose video..."}</span>
                  <input
                    type="file"
                    accept="video/webm,video/mp4,video/quicktime,video/ogg"
                    className="hidden"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  />
                </label>
                {videoFile && (
                  <button type="button" onClick={() => setVideoFile(null)} className="text-[9px] text-rose-500 font-bold">
                    Remove video
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground font-bold">Video URL</Label>
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://... (used if no video file is chosen)"
                disabled={!!videoFile}
                className="h-9 bg-background disabled:opacity-60"
              />
            </div>
          </div>

          {/* Sync check box */}
          <div className="flex items-center gap-2 pt-2 select-none border-t">
            <input
              type="checkbox"
              id="createSyncOP"
              checked={syncOP}
              onChange={(e) => setSyncOP(e.target.checked)}
              className="h-4 w-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="createSyncOP" className="text-[10px] font-bold text-muted-foreground cursor-pointer">
              Sync this bug to {trackerName} immediately after creation
            </label>
          </div>

          <div className="pt-3 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="h-9 font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
            >
              {saving ? "Submitting Defect..." : "Save Bug"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
