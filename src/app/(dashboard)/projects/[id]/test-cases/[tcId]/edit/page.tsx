"use client"

import { SkeletonLines } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "@/components/ui/icons"
import { TestCaseEditor, type TestCaseDraft, type EditorStep } from "@/components/test-cases/test-case-editor"

export default function EditTestCasePage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const tcId = params.tcId as string
  const [initial, setInitial] = useState<TestCaseDraft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/test-cases/${tcId}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || !data.testCase) throw new Error(data.error || "Test case not found")
        const tc = data.testCase
        setInitial({
          title: tc.title,
          priority: tc.priority,
          preconditions: tc.preconditions || "",
          executionType: tc.executionType === "Automated" ? "Automated" : "Manual",
          suiteId: tc.suiteId || tc.suite?.id || "",
          assignee: tc.assignee || "",
          requirementIds: (tc.requirements || []).map((r: { requirementId: string }) => r.requirementId),
          tags: tc.tags || [],
          reviewState: tc.reviewState || "Ready",
          estimatedMinutes: tc.estimatedMinutes ?? "",
          steps: tc.steps.map((s: Record<string, unknown>) => ({
            // Sent back on save so the step is updated in place and keeps its
            // link to past run results.
            id: s.id,
            actionDescription: s.actionDescription,
            expectedResult: s.expectedResult,
            actionType: s.actionType,
            targetType: s.targetType,
            targetValue: s.targetValue || "",
            inputValue: s.inputValue || "",
            timeoutMs: s.timeoutMs,
            assertions: s.assertions || [],
            // Round-trip what the form does not edit, so saving keeps it.
            actionMetadata: s.actionMetadata ?? null,
            locatorCandidates: s.locatorCandidates ?? null,
            componentType: s.componentType ?? null,
            groupId: s.groupId ?? null,
            selectedOptionText: s.selectedOptionText ?? null,
            selectedOptionValue: s.selectedOptionValue ?? null,
          })) as EditorStep[],
        })
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [projectId, tcId])

  async function save(d: TestCaseDraft) {
    const res = await fetch(`/api/projects/${projectId}/test-cases/${tcId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title,
        priority: d.priority,
        preconditions: d.preconditions.trim() || null,
        executionType: d.executionType,
        assignee: d.assignee || null,
        suiteId: d.suiteId || null,
        steps: d.steps,
        requirementIds: d.requirementIds,
        tags: d.tags,
        reviewState: d.reviewState,
        estimatedMinutes: d.estimatedMinutes === "" ? null : d.estimatedMinutes,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return data.error || "Failed to update test case"
    }
    router.push(`/projects/${projectId}/test-cases?case=${tcId}${d.suiteId ? `&suite=${encodeURIComponent(d.suiteId)}` : ""}`)
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>
  if (!initial)
    return (
      <div className="p-6">
        <SkeletonLines lines={4} className="w-full max-w-xl" />
      </div>
    )

  return (
    <TestCaseEditor
      projectId={projectId}
      initial={initial}
      heading={`Edit · ${initial.title}`}
      submitLabel="Save changes"
      onSubmit={save}
      onCancel={() => router.back()}
    />
  )
}
