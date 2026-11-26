"use client"

import { useEffect, useState } from "react"
import { ModuleSelect, useProjectModules } from "@/components/bug-reports/module-select"
import { applyModulePrefix } from "@/lib/bug-reports/title-prefix"
import { encodeImageForAi } from "@/lib/images/encode-for-ai"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { ComposerDialog, ComposerTitle, ComposerText, ComposerSection, ChipRow, ChipSelect } from "@/components/ui/issue-composer"
import { Bug, X, Sparkles, Paperclip, Video, Trash2, Check, AlertTriangle, Server, Globe, Tag, UserRound, GitBranch, Plus, Link2, Boxes, Image as ImageIcon } from "@/components/ui/icons"

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
  // The AI panel starts closed so the form opens on the title; opening it is one click.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiImage, setAiImage] = useState<File | null>(null)
  const [aiNotice, setAiNotice] = useState<{
    kind: "ai" | "template" | "degraded"
    text: string
  } | null>(null)

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
        // Downscaled for the trip to the model only — the same File is still
        // attached to the bug at full resolution below. A raw Retina PNG is
        // megabytes of base64 uploaded inside the draft's own timeout, which
        // is how a screenshot turned a draft into a template.
        const encoded = await encodeImageForAi(image)
        imageBase64 = encoded.base64
        imageMimeType = encoded.mimeType
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
        // Say why the template answered, not just that it did. "No provider is
        // configured" was printed even when one was configured and had just
        // failed, which sent people to the hub to re-enter a key that was fine.
        setAiNotice(
          draft.provider === "rule-based"
            ? {
                kind: "template",
                text: `Drafted from a template — ${draft.fallbackReason || "no AI provider is configured"}, so this is a best-effort guess. Review every field.`,
              }
            : draft.degradedReason
              ? {
                  // A real draft, written without the picture. The tester is
                  // the only one who can tell whether anything was lost with it.
                  kind: "degraded",
                  text: `Draft ready, but ${draft.degradedReason}. Check it against your screenshot before saving.`,
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

  const LEVELS = ["Low", "Medium", "High", "Critical"].map((v) => ({ value: v, label: v }))
  const LEVEL_DOT: Record<string, string> = {
    Low: "bg-slate-400",
    Medium: "bg-amber-500",
    High: "bg-orange-500",
    Critical: "bg-red-500",
  }

  return (
    <ComposerDialog
      open={open}
      onOpenChange={(o) => { if (!o && !saving) onClose() }}
      title="Create bug report"
      description="Describe the defect; every field stays editable before you save."
      wide
      crumbs={[
        <span key="b" className="inline-flex items-center gap-2 font-medium">
          <Bug className="h-3.5 w-3.5 text-red-500" />
          New bug
        </span>,
        <button
          key="ai"
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          aria-expanded={aiOpen}
          className={`inline-flex h-6 items-center gap-1 rounded-md px-2 font-medium transition-colors ${aiOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Write with AI
        </button>,
      ]}
      onSubmit={() => handleSubmit({ preventDefault() {} } as React.FormEvent)}
      canSubmit={!!title.trim()}
      submitting={saving}
      submitLabel={saving ? "Saving…" : "Save bug"}
      error={error}
      footerLeft={
        <label className="inline-flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            id="createSyncOP"
            checked={syncOP}
            onChange={(e) => setSyncOP(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-[hsl(var(--primary))]"
          />
          Sync to {trackerName} after saving
        </label>
      }
    >
      {/* AI assist — describe the defect in plain words, optionally attach a
          screenshot, and let the model fill the whole form. */}
      {aiOpen && (
        <div className="mb-3 space-y-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onPaste={handleAiPaste}
            rows={3}
            dir="auto"
            autoFocus
            placeholder="Describe what went wrong in your own words — e.g. 'checkout button does nothing on mobile after applying a discount code'. Paste a screenshot here too."
            className="w-full resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-7 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              {aiImage ? (aiImage.name.length > 24 ? `${aiImage.name.slice(0, 24)}…` : aiImage.name) : "Attach picture"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setAiImage(e.target.files?.[0] || null)} />
            </label>
            {aiImage && (
              <button type="button" onClick={() => setAiImage(null)} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Remove picture">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerateWithAI}
              disabled={aiGenerating}
              className="ml-auto inline-flex h-7 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiGenerating ? "Writing the bug…" : "Fill the form"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Fills title, description, severity, priority, steps and expected/actual results.
          </p>
          {/* Say which engine answered, and on what evidence: a rule-based
              draft means no AI provider produced one, and a degraded draft
              means the model never saw the attached screenshot. */}
          {aiNotice && (
            <p className={`text-xs font-medium ${aiNotice.kind === "ai" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
              {aiNotice.text}
            </p>
          )}
        </div>
      )}

      <ComposerTitle
        aria-label="Bug title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        dir="auto"
        placeholder="Summarise the defect in one line"
        autoFocus={!aiOpen}
        required
      />

      {/* Possible duplicates, checked as the title is typed — a hint, not a block. */}
      {duplicateMatches.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {duplicateMatches.length === 1 ? "A similar defect already exists" : `${duplicateMatches.length} similar defects already exist`}
            <span className="font-normal text-amber-700/80 dark:text-amber-400/80">· still different? carry on</span>
          </p>
          <div className="mt-1 space-y-px">
            {duplicateMatches.map((m) => (
              <a
                key={m.id}
                href={`/projects/${projectId}/bug-reports?bugId=${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-background/70"
              >
                <span className="shrink-0 font-mono text-amber-700 dark:text-amber-400">{m.bugKey || "BUG"}</span>
                <span className="min-w-0 flex-1 truncate" title={m.title}>{m.title}</span>
                <span className="shrink-0 text-muted-foreground">{m.status}</span>
                <span className="shrink-0 tabular-nums text-amber-700 dark:text-amber-400">{m.score}%</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <ComposerText value={desc} onChange={setDesc} placeholder="Add description…" minRows={2} />

      <ChipRow>
        <span
          title="Module: groups the defect in the QA report and prefixes the title as [Module]. Empty = inherit the linked test case's module."
          className={`relative inline-flex h-7 max-w-[14rem] items-center gap-2 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring ${suiteId ? "border-border bg-card text-foreground" : "border-dashed border-border text-muted-foreground hover:bg-accent"}`}
        >
          <Boxes className="h-3.5 w-3.5 shrink-0" />
          <ModuleSelect
            projectId={projectId}
            value={suiteId}
            onChange={chooseModule}
            enabled={open}
            modules={projectModules}
            placeholder="Module"
            className="h-6 max-w-[11rem] cursor-pointer appearance-none truncate bg-transparent pr-1 text-xs outline-none"
          />
        </span>
        <ChipSelect
          label="Severity"
          icon={<span className={`h-2 w-2 rounded-full ${LEVEL_DOT[severity] ?? "bg-slate-400"}`} />}
          value={severity}
          onChange={setSeverity}
          options={LEVELS.map((o) => ({ ...o, label: `${o.label} severity` }))}
        />
        <ChipSelect
          label="Priority"
          icon={<span className={`h-2 w-2 rounded-full ${LEVEL_DOT[priority] ?? "bg-slate-400"}`} />}
          value={priority}
          onChange={setPriority}
          options={LEVELS.map((o) => ({ ...o, label: `${o.label} priority` }))}
        />
        <ChipSelect
          label="Environment"
          icon={<Server className="h-3.5 w-3.5" />}
          value={env}
          onChange={setEnv}
          options={["Dev", "Staging", "UAT", "Production"].map((v) => ({ value: v, label: v }))}
        />
        <ChipSelect
          label="Browser"
          icon={<Globe className="h-3.5 w-3.5" />}
          value={browser}
          onChange={setBrowser}
          options={["Chromium", "Firefox", "WebKit"].map((v) => ({ value: v, label: v }))}
        />
        {sourceOptions && sourceOptions.length > 0 && (
          <ChipSelect
            label="Bug source"
            icon={<Tag className="h-3.5 w-3.5" />}
            value={source}
            onChange={setSource}
            placeholder="Source"
            options={sourceOptions.map((o) => ({ value: o, label: o }))}
          />
        )}
        {opMembers.length > 0 ? (
          <ChipSelect
            label="Assignee"
            icon={<UserRound className="h-3.5 w-3.5" />}
            value={assignee}
            onChange={setAssignee}
            placeholder="Assignee"
            options={opMembers.map((m) => ({ value: String(m.id), label: m.name }))}
          />
        ) : (
          <span className={`inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring ${assignee ? "border-border bg-card" : "border-dashed border-border text-muted-foreground"}`}>
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <input
              aria-label="Assignee email"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Assignee email"
              className="w-28 bg-transparent outline-none placeholder:text-muted-foreground focus:w-44"
            />
          </span>
        )}
        <span className={`inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring ${parent ? "border-border bg-card" : "border-dashed border-border text-muted-foreground"}`}>
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <input
            aria-label={`Parent task (${trackerName} work package)`}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            list="create-bug-parent-options"
            placeholder="Parent task"
            className="w-24 bg-transparent outline-none placeholder:text-muted-foreground focus:w-48"
          />
          {parentLoading && <span className="text-xs text-muted-foreground">…</span>}
          <datalist id="create-bug-parent-options">
            {parentOptions.map((wp) => (
              <option key={wp.id} value={wp.id}>
                #{wp.id} — {wp.subject}
                {wp.type ? ` (${wp.type})` : ""}
              </option>
            ))}
          </datalist>
        </span>
      </ChipRow>


      <ComposerSection
        title={`Steps to reproduce${steps.length ? ` (${steps.length})` : ""}`}
        action={
          <button type="button" onClick={addStep} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Add step
          </button>
        }
      >
        {sessionSteps && sessionSteps.length > 0 && (
          <button
            type="button"
            onClick={addRecordedSteps}
            className="mb-2 inline-flex h-7 items-center gap-2 rounded-md border border-dashed border-primary/30 px-2 text-xs text-primary hover:bg-primary/5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add {sessionSteps.length} recorded step{sessionSteps.length === 1 ? "" : "s"} from this session
          </button>
        )}
        {steps.length === 0 ? (
          <button type="button" onClick={addStep} className="w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground/70 hover:bg-accent/50">
            1. Go to…
          </button>
        ) : (
          <ol className="max-h-[180px] space-y-px overflow-y-auto">
            {steps.map((step, idx) => (
              <li key={idx} className="group/step flex items-center gap-2 rounded-md px-2 hover:bg-accent/50">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{idx + 1}.</span>
                <input
                  value={step.actionDescription}
                  onChange={(e) => updateStepText(idx, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep() } }}
                  dir="auto"
                  aria-label={`Step ${idx + 1}`}
                  placeholder="Describe the step…"
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  aria-label={`Remove step ${idx + 1}`}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:text-red-600 focus:opacity-100 group-hover/step:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </ComposerSection>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <ComposerSection title="Expected result">
          <input
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            dir="auto"
            aria-label="Expected result"
            placeholder="What should happen"
            className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </ComposerSection>
        <ComposerSection title="Actual result">
          <input
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            dir="auto"
            aria-label="Actual result"
            placeholder="What happened instead"
            className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </ComposerSection>
      </div>

      <ComposerSection title="Evidence">
        {attachmentChoices && attachmentChoices.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1 text-xs text-muted-foreground">
              From this session — click to attach ({sessionAttachments.length} selected)
            </p>
            <div className="grid max-h-[170px] grid-cols-4 gap-2 overflow-y-auto pr-1">
              {attachmentChoices.map((att) => {
                const selected = isAttached(att.filePath)
                const isVideo = att.kind === "video"
                return (
                  <button
                    key={att.filePath}
                    type="button"
                    onClick={() => toggleAttachment(att)}
                    title={att.fileName}
                    aria-pressed={selected}
                    className={`group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted/40 transition-all ${selected ? "border-primary ring-2 ring-primary" : "border-border hover:ring-2 hover:ring-primary/30"}`}
                  >
                    {isVideo ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Video className="h-4 w-4" />
                        <span className="text-xs">Video</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${encodeURIComponent(att.filePath)}`} alt={att.fileName} className="h-full w-full object-cover" />
                    )}
                    {selected && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          sessionAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {sessionAttachments.map((att) => (
                <span key={att.filePath} className="inline-flex h-7 max-w-[16rem] items-center gap-2 rounded-md border border-border bg-card px-2 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={att.fileName}>{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setSessionAttachments((prev) => prev.filter((x) => x.filePath !== att.filePath))}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Remove ${att.fileName}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex h-7 max-w-[14rem] cursor-pointer items-center gap-2 rounded-md border px-2 text-xs ${screenshotFile ? "border-border bg-card" : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{screenshotFile ? screenshotFile.name : "Screenshot"}</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)} />
          </label>
          {screenshotFile && (
            <button type="button" onClick={() => setScreenshotFile(null)} aria-label="Remove screenshot" className="text-muted-foreground hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <label className={`inline-flex h-7 max-w-[14rem] cursor-pointer items-center gap-2 rounded-md border px-2 text-xs ${videoFile ? "border-border bg-card" : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <Video className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{videoFile ? videoFile.name : "Video file"}</span>
            <input type="file" accept="video/webm,video/mp4,video/quicktime,video/ogg" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
          </label>
          {videoFile && (
            <button type="button" onClick={() => setVideoFile(null)} aria-label="Remove video" className="text-muted-foreground hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <span className={`inline-flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring ${videoUrl ? "border-border bg-card" : "border-dashed border-border text-muted-foreground"} ${videoFile ? "opacity-50" : ""}`}>
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <input
              aria-label="Video URL"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Video URL (used if no file is chosen)"
              disabled={!!videoFile}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </span>
        </div>
      </ComposerSection>
    </ComposerDialog>
  )
}
