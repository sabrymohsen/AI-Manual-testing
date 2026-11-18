"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { TestCaseEditor, EMPTY_DRAFT, type TestCaseDraft } from "@/components/test-cases/test-case-editor"

export default function NewTestCasePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const initialSuiteId = searchParams.get("suite") || ""

  async function create(d: TestCaseDraft) {
    const res = await fetch(`/api/projects/${projectId}/test-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: d.title,
        priority: d.priority,
        preconditions: d.preconditions.trim() || null,
        source: "Manual",
        executionType: d.executionType,
        suiteId: d.suiteId || null,
        testData: null,
        tags: d.tags,
        reviewState: d.reviewState,
        estimatedMinutes: d.estimatedMinutes === "" ? null : d.estimatedMinutes,
        assignee: d.assignee || null,
        steps: d.steps.map((s) => ({ ...s, timeoutMs: s.timeoutMs || 10000 })),
        requirementIds: d.requirementIds,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return data.error || "Failed to create test case"
    }
    router.push(`/projects/${projectId}/test-cases${d.suiteId ? `?suite=${encodeURIComponent(d.suiteId)}` : ""}`)
  }

  return (
    <TestCaseEditor
      projectId={projectId}
      initial={{ ...EMPTY_DRAFT, suiteId: initialSuiteId }}
      heading="New test case"
      submitLabel="Create test case"
      onSubmit={create}
      onCancel={() => router.back()}
    />
  )
}
