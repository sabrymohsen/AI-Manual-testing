"use client"

import { useParams } from "next/navigation"
import ScrumBoard from "@/components/board/scrum-board"

export default function BoardPage() {
  const params = useParams()
  const projectId = params.id as string
  return (
    <div className="space-y-4">
      <ScrumBoard projectId={projectId} />
    </div>
  )
}
