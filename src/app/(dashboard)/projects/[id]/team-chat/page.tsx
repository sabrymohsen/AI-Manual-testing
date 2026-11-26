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
      <div className="flex h-full" aria-busy="true" aria-label="Loading Team chat">
        <div className="w-64 shrink-0 space-y-2 border-r bg-card p-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />)}
        </div>
        <div className="flex-1" />
      </div>
    )
  }

  if (!token || !currentUserId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team chat couldn&apos;t confirm who you are. Sign out and sign in again.
      </div>
    )
  }

  return (
    <TeamChatPage projectId={projectId} token={token} currentUserId={currentUserId} />
  )
}
