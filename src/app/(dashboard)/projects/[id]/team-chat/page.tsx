"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { TeamChatPage } from "@/components/chat/TeamChatPage"

export default function TeamChat() {
  const params = useParams()
  const projectId = params.id as string
  const [token, setToken] = useState<string>("")
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Try to read token from layout's window cache first
    const cachedToken = (window as any).__CHAT_TOKEN__
    if (cachedToken) {
      setToken(cachedToken)
    }

    async function loadUser() {
      try {
        const res = await fetch("/api/me")
        if (res.ok) {
          const data = await res.json()
          setCurrentUserId(data.user.id)
          if (data.token) setToken(data.token)
        }
      } catch (err) {
        console.error("Failed to load user for chat:", err)
      } finally {
        setLoading(false)
      }
    }
    loadUser()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (!token || !currentUserId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Unable to load chat. Please sign in again.
      </div>
    )
  }

  return (
    <TeamChatPage
      projectId={projectId}
      token={token}
      currentUserId={currentUserId}
    />
  )
}
