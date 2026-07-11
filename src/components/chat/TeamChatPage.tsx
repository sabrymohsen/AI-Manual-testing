"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Hash, Plus, Search, Users, X, Edit2, Send, Smile, Paperclip, AtSign, Bold, Italic, Strikethrough, Link2, Code2, MessageSquare, ChevronDown, Circle } from "lucide-react"
import { useChatStore, ChatMessage, ChatChannel } from "@/stores/chatStore"
import { useSocket } from "@/hooks/useSocket"
import { EmojiPicker } from "@/components/chat/EmojiPicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { replaceEmojiShortcodes, QUICK_REACTIONS } from "@/lib/emoji-shortcodes"

interface TeamChatPageProps {
  projectId: string
  token: string
  currentUserId: string
}

interface ProjectMember {
  id: string
  name: string | null
  email: string
  avatarUrl?: string | null
  role?: string
}

export function TeamChatPage({ projectId, token, currentUserId }: TeamChatPageProps) {
  const socketRef = useSocket(token, projectId, currentUserId)

  const {
    channels, dms, messages, activeChannelId,
    setChannels, setDMs, setMessages, setActiveChannel,
    unreadCounts, typingUsers, onlineUsers, clearUnread,
    setProjectMembers, setPresences,
    activeThreadId, setActiveThread,
    addReaction, removeReaction,
  } = useChatStore()

  const [projectMembers, setLocalMembers] = useState<ProjectMember[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState("")
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)
  const [startingDM, setStartingDM] = useState(false)
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([])
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [threadInput, setThreadInput] = useState("")
  const [sendingMessage, setSendingMessage] = useState(false)
  const [sendingThread, setSendingThread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Load project data
  useEffect(() => {
    if (!projectId) return

    async function loadData() {
      try {
        // Load channels
        const channelsRes = await fetch(`/api/channels?projectId=${projectId}`)
        if (channelsRes.ok) {
          const data = await channelsRes.json()
          setChannels(data.channels || [])
          if (data.channels?.length > 0 && !activeChannelId) {
            setActiveChannel(data.channels[0].id)
          }
        }

        // Load DMs
        const dmsRes = await fetch(`/api/dm?projectId=${projectId}`)
        if (dmsRes.ok) {
          const data = await dmsRes.json()
          setDMs(data.dms || [])
        }

        // Load project members
        const membersRes = await fetch(`/api/projects/${projectId}/scrum/members`)
        if (membersRes.ok) {
          const data = await membersRes.json()
          setLocalMembers(data.members || [])
          setProjectMembers(data.members || [])
        }

        // Load presence
        const presenceRes = await fetch(`/api/presence?projectId=${projectId}`)
        if (presenceRes.ok) {
          const data = await presenceRes.json()
          setPresences(data.presences || [])
        }
      } catch (err) {
        console.error("Failed to load chat data:", err)
      }
    }
    loadData()
  }, [projectId])

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return
    const channelId = activeChannelId
    clearUnread(channelId)

    async function loadMessages() {
      try {
        const res = await fetch(`/api/channels/${channelId}/messages?limit=50`)
        if (res.ok) {
          const data = await res.json()
          setMessages(channelId, data.messages || [])
        }
      } catch (err) {
        console.error("Failed to load messages:", err)
      }
    }
    loadMessages()
  }, [activeChannelId])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeChannelId, messages[activeChannelId || ""]])

  // Load thread when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setThreadMessages([])
      setThreadParent(null)
      return
    }

    async function loadThread() {
      try {
        // Find parent message
        if (activeChannelId) {
          const channelMsgs = messages[activeChannelId] || []
          const parent = channelMsgs.find(m => m.id === activeThreadId)
          if (parent) setThreadParent(parent)
        }

        const res = await fetch(`/api/messages/${activeThreadId}/replies`)
        if (res.ok) {
          const data = await res.json()
          setThreadMessages(data.replies || [])
        }
      } catch (err) {
        console.error("Failed to load thread:", err)
      }
    }
    loadThread()
  }, [activeThreadId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [threadMessages])

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {})
    }, 25000)
    return () => clearInterval(interval)
  }, [])

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !activeChannelId || sendingMessage) return
    setSendingMessage(true)

    const content = replaceEmojiShortcodes(messageInput.trim())

    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit("send-message", {
        channelId: activeChannelId,
        content,
      })
      setMessageInput("")
      setSendingMessage(false)
    } else {
      try {
        await fetch(`/api/channels/${activeChannelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        setMessageInput("")
        // Reload messages
        const res = await fetch(`/api/channels/${activeChannelId}/messages?limit=50`)
        if (res.ok) {
          const data = await res.json()
          setMessages(activeChannelId, data.messages || [])
        }
      } catch (err) {
        console.error("Failed to send message:", err)
      } finally {
        setSendingMessage(false)
      }
    }
  }, [messageInput, activeChannelId, sendingMessage])

  // Send thread reply
  const handleSendThreadReply = useCallback(async () => {
    if (!threadInput.trim() || !activeThreadId || !activeChannelId || sendingThread) return
    setSendingThread(true)

    const threadContent = replaceEmojiShortcodes(threadInput.trim())

    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit("send-message", {
        channelId: activeChannelId,
        content: threadContent,
        parentId: activeThreadId,
      })
      setThreadInput("")
      // Reload thread
      setTimeout(async () => {
        const res = await fetch(`/api/messages/${activeThreadId}/replies`)
        if (res.ok) {
          const data = await res.json()
          setThreadMessages(data.replies || [])
        }
        setSendingThread(false)
      }, 500)
    } else {
      try {
        await fetch(`/api/channels/${activeChannelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: threadContent, parentId: activeThreadId }),
        })
        setThreadInput("")
        const res = await fetch(`/api/messages/${activeThreadId}/replies`)
        if (res.ok) {
          const data = await res.json()
          setThreadMessages(data.replies || [])
        }
      } catch (err) {
        console.error("Failed to send thread reply:", err)
      } finally {
        setSendingThread(false)
      }
    }
  }, [threadInput, activeThreadId, activeChannelId, sendingThread])

  // Start (or reopen) a 1-on-1 DM with a project member
  const handleStartDM = async (targetUserId: string) => {
    if (startingDM) return
    setStartingDM(true)
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, projectId }),
      })
      if (res.ok) {
        const data = await res.json()
        const dmChan: ChatChannel = data.dm
        if (!dms.some((d) => d.id === dmChan.id)) {
          setDMs([dmChan, ...dms])
        }
        setActiveChannel(dmChan.id)
        setShowNewDM(false)
      } else {
        const data = await res.json().catch(() => ({}))
        console.error("Failed to start DM:", data.error)
      }
    } catch (err) {
      console.error("Failed to start DM:", err)
    } finally {
      setStartingDM(false)
    }
  }

  // Toggle a reaction on a message (socket first, REST fallback)
  const toggleReaction = async (msg: ChatMessage, emoji: string) => {
    if (!activeChannelId) return
    const mine = (msg.reactions || []).some(
      (r) => r.emoji === emoji && r.userId === currentUserId
    )

    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit(mine ? "remove-reaction" : "add-reaction", { messageId: msg.id, emoji })
      return
    }

    // REST fallback with optimistic store update
    try {
      if (mine) {
        const res = await fetch(`/api/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`, {
          method: "DELETE",
        })
        if (res.ok) removeReaction(activeChannelId, msg.id, emoji, currentUserId)
      } else {
        const res = await fetch(`/api/messages/${msg.id}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.reaction) addReaction(activeChannelId, msg.id, data.reaction)
        }
      }
    } catch (err) {
      console.error("Failed to toggle reaction:", err)
    }
  }

  // Insert emoji from the picker into the message input
  const insertEmoji = (emoji: string) => {
    setMessageInput((prev) => prev + emoji)
  }

  // Create channel
  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || creatingChannel) return
    setCreatingChannel(true)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName.trim(), projectId, type: "PUBLIC" }),
      })
      if (res.ok) {
        const data = await res.json()
        setChannels([...channels, data.channel])
        setActiveChannel(data.channel.id)
        setNewChannelName("")
        setShowCreateChannel(false)
      }
    } catch (err) {
      console.error("Failed to create channel:", err)
    } finally {
      setCreatingChannel(false)
    }
  }

  const activeChannel = [...channels, ...dms].find(c => c.id === activeChannelId)
  const isDM = activeChannel?.type === "DIRECT"
  const activeDisplayName = isDM
    ? activeChannel?.otherMember?.name || activeChannel?.otherMember?.email || activeChannel?.name
    : activeChannel?.name
  const activeChannelMessages = activeChannelId ? messages[activeChannelId] || [] : []
  const currentTyping = activeChannelId ? typingUsers[activeChannelId] || [] : []

  // Format time
  function formatTime(date: string | Date) {
    return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
  }

  // Format date divider
  function formatDateDivider(date: string | Date) {
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return "Today"
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  }

  // Group messages by date
  function getDateDividers(msgs: ChatMessage[]) {
    const dividers: { [key: string]: boolean } = {}
    return msgs.map((msg, i) => {
      const dateKey = new Date(msg.createdAt).toDateString()
      const showDivider = !dividers[dateKey]
      if (showDivider) dividers[dateKey] = true
      return { ...msg, showDivider }
    })
  }

  const messagesWithDividers = getDateDividers(activeChannelMessages)

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-xl border bg-white shadow-sm overflow-hidden -m-2">
      {/* ─── LEFT: Channels Sidebar ─── */}
      <div className="w-[260px] border-r bg-slate-50/80 flex flex-col shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-base text-gray-900">Conversations</h2>
          <button className="p-1 rounded hover:bg-slate-200 transition-colors text-muted-foreground">
            <Edit2 className="h-4 w-4" />
          </button>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {/* Channels Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">Channels</span>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="p-0.5 rounded hover:bg-slate-200 transition-colors text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Create channel inline */}
            {showCreateChannel && (
              <div className="px-2 py-2 mx-1 mb-1 bg-white rounded-lg border shadow-sm">
                <input
                  autoFocus
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateChannel()
                    if (e.key === "Escape") { setShowCreateChannel(false); setNewChannelName("") }
                  }}
                  placeholder="Channel name..."
                  className="w-full px-2 py-1.5 text-xs rounded border bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex gap-1 mt-1.5">
                  <button
                    onClick={handleCreateChannel}
                    disabled={creatingChannel || !newChannelName.trim()}
                    className="flex-1 text-[10px] py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setShowCreateChannel(false); setNewChannelName("") }}
                    className="flex-1 text-[10px] py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {channels.map(channel => {
              const isActive = activeChannelId === channel.id
              const unread = unreadCounts[channel.id] || 0

              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group ${
                    isActive
                      ? "bg-indigo-100 text-indigo-800 font-semibold"
                      : "text-gray-600 hover:bg-slate-100"
                  }`}
                >
                  <Hash className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-600" : "text-gray-400"}`} />
                  <span className="truncate flex-1 text-left">{channel.name}</span>
                  {unread > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">
                      {unread}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* DMs Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">Direct Messages</span>
              <Popover open={showNewDM} onOpenChange={setShowNewDM}>
                <PopoverTrigger asChild>
                  <button
                    className="p-0.5 rounded hover:bg-slate-200 transition-colors text-muted-foreground"
                    title="New direct message"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 px-2 pb-1.5">
                    Message a member
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    {projectMembers.filter((m) => m.id !== currentUserId).length === 0 ? (
                      <p className="text-xs text-gray-400 px-2 py-3 text-center">
                        No other members in this project yet
                      </p>
                    ) : (
                      projectMembers
                        .filter((m) => m.id !== currentUserId)
                        .map((member) => {
                          const online = onlineUsers.includes(member.id)
                          return (
                            <button
                              key={member.id}
                              onClick={() => handleStartDM(member.id)}
                              disabled={startingDM}
                              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              <div className="relative shrink-0">
                                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold">
                                  {(member.name || member.email)[0].toUpperCase()}
                                </div>
                                <Circle
                                  className={`h-2 w-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-white ${
                                    online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"
                                  }`}
                                />
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="truncate font-medium leading-tight">{member.name || member.email}</p>
                                <p className="truncate text-[11px] text-gray-400 leading-tight">{member.email}</p>
                              </div>
                            </button>
                          )
                        })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {dms.length === 0 && (
              <p className="px-3 py-1 text-[11px] text-gray-400 italic">
                No conversations yet — click + to message a member
              </p>
            )}
            {dms.map(dm => {
                const isActive = activeChannelId === dm.id
                const otherName = dm.otherMember?.name || dm.otherMember?.email || dm.name
                const unread = unreadCounts[dm.id] || 0

                return (
                  <button
                    key={dm.id}
                    onClick={() => setActiveChannel(dm.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "bg-indigo-100 text-indigo-800 font-semibold"
                        : "text-gray-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="relative">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {(otherName || "?")[0].toUpperCase()}
                      </div>
                      <Circle
                        className={`h-2 w-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-white ${
                          dm.otherMember && onlineUsers.includes(dm.otherMember.id)
                            ? "fill-emerald-500 text-emerald-500"
                            : "fill-slate-300 text-slate-300"
                        }`}
                      />
                    </div>
                    <span className="truncate flex-1 text-left">{otherName}</span>
                    {unread > 0 && (
                      <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">
                        {unread}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </div>
      </div>

      {/* ─── CENTER: Message Feed ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
              <div className="flex items-center gap-2">
                {activeChannel.type === "DIRECT" ? (
                  <>
                    <div className="relative">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold">
                        {(activeDisplayName || "?")[0].toUpperCase()}
                      </div>
                      <Circle
                        className={`h-2 w-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-white ${
                          activeChannel.otherMember && onlineUsers.includes(activeChannel.otherMember.id)
                            ? "fill-emerald-500 text-emerald-500"
                            : "fill-slate-300 text-slate-300"
                        }`}
                      />
                    </div>
                    <h3 className="font-bold text-base text-gray-900">{activeDisplayName}</h3>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 bg-slate-100 rounded px-1.5 py-0.5">
                      Private
                    </span>
                  </>
                ) : (
                  <>
                    <Hash className="h-5 w-5 text-gray-400" />
                    <h3 className="font-bold text-base text-gray-900">{activeChannel.name}</h3>
                  </>
                )}
              </div>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground">
                <Users className="h-4 w-4" />
              </button>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isDM ? `Search messages with ${activeDisplayName}...` : `Search in #${activeChannel.name}...`}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-lg border bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-52"
                />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
              {activeChannelMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  {isDM ? (
                    <MessageSquare className="h-12 w-12 mb-3 text-gray-300" />
                  ) : (
                    <Hash className="h-12 w-12 mb-3 text-gray-300" />
                  )}
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs mt-1">
                    {isDM
                      ? `This is the beginning of your private conversation with ${activeDisplayName}`
                      : `Be the first to say something in #${activeChannel.name}`}
                  </p>
                </div>
              ) : (
                messagesWithDividers.map((msg: any) => (
                  <div key={msg.id}>
                    {/* Date Divider */}
                    {msg.showDivider && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-[11px] font-medium text-gray-400 px-2">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                    )}

                    {/* Message */}
                    <div className="group flex gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                      {/* Avatar — links to the sender's public profile */}
                      <a href={`/users/${msg.sender.id}`} className="shrink-0 mt-0.5" title="View profile">
                        {msg.sender.avatarUrl ? (
                          <img src={msg.sender.avatarUrl} className="h-9 w-9 rounded-full object-cover hover:ring-2 hover:ring-indigo-300 transition-shadow" alt="" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold hover:ring-2 hover:ring-indigo-300 transition-shadow">
                            {(msg.sender.name || msg.sender.email || "?")[0].toUpperCase()}
                          </div>
                        )}
                      </a>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {msg.sender.name || msg.sender.email}
                          </span>
                          <span className="text-[11px] text-gray-400">{formatTime(msg.createdAt)}</span>
                          {msg.editedAt && (
                            <span className="text-[10px] text-gray-300 italic">(edited)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                          {msg.isDeleted ? (
                            <span className="italic text-gray-400">This message was deleted</span>
                          ) : msg.htmlContent ? (
                            <div dangerouslySetInnerHTML={{ __html: msg.htmlContent }} />
                          ) : (
                            msg.content
                          )}
                        </div>

                        {/* Attachments */}
                        {msg.attachments?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {msg.attachments.map((att: any) => (
                              <a
                                key={att.id}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors text-xs text-indigo-700"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                <span className="truncate max-w-[180px]">{att.name}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Reactions */}
                        {msg.reactions?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {groupReactions(msg.reactions).map((r: any) => (
                              <button
                                key={r.emoji}
                                onClick={() => toggleReaction(msg, r.emoji)}
                                title={r.users.map((u: any) => u.name || "Someone").join(", ")}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                  r.users.some((u: any) => u.id === currentUserId)
                                    ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-medium">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Thread indicator */}
                        {(msg._count?.replies || 0) > 0 && (
                          <button
                            onClick={() => setActiveThread(msg.id)}
                            className="flex items-center gap-1.5 mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {msg._count.replies} {msg._count.replies === 1 ? "reply" : "replies"}
                          </button>
                        )}
                      </div>

                      {/* Hover actions */}
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-start gap-0.5 mt-1">
                        <button
                          onClick={() => setActiveThread(msg.id)}
                          className="p-1 rounded hover:bg-slate-200 text-gray-400 hover:text-gray-600"
                          title="Reply in thread"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="p-1 rounded hover:bg-slate-200 text-gray-400 hover:text-gray-600" title="React">
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1.5" align="end">
                            <div className="flex gap-0.5">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg, emoji)}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg text-lg hover:bg-slate-100 transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {currentTyping.length > 0 && (
              <div className="px-5 py-1 text-xs text-gray-400 italic">
                {currentTyping.map(t => t.name).join(", ")} {currentTyping.length === 1 ? "is" : "are"} typing...
              </div>
            )}

            {/* Message Input */}
            <div className="px-5 pb-4 pt-2 border-t bg-white shrink-0">
              <div className="rounded-xl border bg-white shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition-all">
                {/* Formatting toolbar */}
                <div className="flex items-center gap-0.5 px-3 pt-2.5 pb-1 border-b border-gray-100">
                  <button className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-600" title="Bold">
                    <Bold className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-600" title="Italic">
                    <Italic className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-600" title="Strikethrough">
                    <Strikethrough className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-600" title="Link">
                    <Link2 className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-600" title="Code">
                    <Code2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Text area */}
                <textarea
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value)
                    // Emit typing
                    if (socketRef.current?.connected && activeChannelId) {
                      socketRef.current.emit("typing", activeChannelId)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder={isDM ? `Message ${activeDisplayName}...` : `Message #${activeChannel.name}...`}
                  rows={2}
                  className="w-full px-4 py-3 text-sm resize-none focus:outline-none placeholder:text-gray-400"
                />

                {/* Bottom bar */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                  <div className="flex items-center gap-0.5">
                    <EmojiPicker onEmojiSelect={insertEmoji} />
                    <span className="text-[10px] text-gray-300 ml-1 hidden sm:inline">
                      Type :smile: or pick an emoji
                    </span>
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || sendingMessage}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">Select a channel</p>
              <p className="text-xs mt-1">Choose a channel from the sidebar to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── RIGHT: Thread Panel ─── */}
      <div className={`w-[320px] border-l bg-white flex flex-col shrink-0 transition-all ${activeThreadId ? "" : ""}`}>
        {activeThreadId && threadParent ? (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-base text-gray-900">Thread</h3>
              <button
                onClick={() => setActiveThread(null)}
                className="p-1 rounded hover:bg-slate-100 transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Parent message */}
            <div className="px-4 py-3 border-b bg-slate-50/50">
              <div className="flex gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(threadParent.sender.name || threadParent.sender.email || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-gray-900">{threadParent.sender.name || threadParent.sender.email}</span>
                    <span className="text-[10px] text-gray-400">{formatTime(threadParent.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{threadParent.content}</p>
                </div>
              </div>
            </div>

            {/* Thread replies */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No replies yet</p>
              ) : (
                threadMessages.map(reply => (
                  <div key={reply.id} className="flex gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {(reply.sender.name || reply.sender.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-xs text-gray-900">{reply.sender.name || reply.sender.email}</span>
                        <span className="text-[10px] text-gray-400">{formatTime(reply.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{reply.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Thread input */}
            <div className="px-4 pb-3 pt-2 border-t">
              <div className="flex gap-2">
                <input
                  value={threadInput}
                  onChange={(e) => setThreadInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendThreadReply()
                    }
                  }}
                  placeholder="Reply..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <button
                  onClick={handleSendThreadReply}
                  disabled={!threadInput.trim() || sendingThread}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6">
            <MessageSquare className="h-12 w-12 mb-3 text-gray-300" />
            <p className="text-sm font-medium text-center">Select a message to view its thread here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper: group reactions
function groupReactions(reactions: any[]) {
  const grouped: { [emoji: string]: { emoji: string; count: number; users: any[] } } = {}
  reactions.forEach(r => {
    if (!grouped[r.emoji]) {
      grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] }
    }
    grouped[r.emoji].count++
    grouped[r.emoji].users.push(r.user)
  })
  return Object.values(grouped)
}
