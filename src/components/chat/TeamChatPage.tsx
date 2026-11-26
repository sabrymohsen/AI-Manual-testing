"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useEditor, EditorContent, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { FormattedMessage, docToMarkdown } from "@/components/chat/rich-text"
import Link from "next/link"
import { Hash, Plus, Search, X, Edit2, Send, Smile, Paperclip, Bold, Italic, Strikethrough, Code2, List, ListOrdered, MessageSquare, Trash2, Lock } from "@/components/ui/icons"
import { useConfirm } from "@/components/ui/alert-provider"
import { PromptDialog } from "@/components/ui/prompt-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useChatStore, ChatMessage, ChatChannel } from "@/stores/chatStore"
import { useSocket } from "@/hooks/useSocket"
import { EmojiPicker } from "@/components/chat/EmojiPicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { replaceEmojiShortcodes, QUICK_REACTIONS } from "@/lib/emoji-shortcodes"
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence"

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

/** A project item referenceable from chat with `#`. */
interface LinkableEntity {
  id: string
  type: string
  key: string
  label: string
  url: string
  meta?: string | null
}

const ENTITY_CHIP: Record<string, string> = {
  TASK: "bg-blue-50 text-blue-700 border-blue-200",
  SUBTASK: "bg-sky-50 text-sky-700 border-sky-200",
  BUG_REPORT: "bg-red-50 text-red-700 border-red-200",
  TEST_CASE: "bg-violet-50 text-violet-700 border-violet-200",
  BRD_DOCUMENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

/** The token being typed right before the caret, if it starts with @ or #. */
function activeToken(text: string, caret: number): { trigger: "@" | "#"; query: string } | null {
  const upto = text.slice(0, caret)
  const m = upto.match(/(^|\s)([@#])([^\s@#]*)$/)
  if (!m) return null
  return { trigger: m[2] as "@" | "#", query: m[3] }
}

export function TeamChatPage({ projectId, token, currentUserId }: TeamChatPageProps) {
  const socketRef = useSocket(token, projectId, currentUserId)

  const {
    channels, dms, messages, activeChannelId,
    setChannels, setDMs, setMessages, setActiveChannel,
    unreadCounts, typingUsers, onlineUsers, clearUnread, setUnreadCounts,
    setProjectMembers, setPresences,
    activeThreadId, setActiveThread,
    addReaction, removeReaction,
    threadReplies, setThreadReplies, editMessage, deleteMessage,
  } = useChatStore()
  const confirm = useConfirm()
  const search = useSearchParams()
  // ?channel=<id>&message=<id> from a notification: open that conversation and
  // point at that message.
  const deepChannel = search.get("channel")
  const [focusMessageId, setFocusMessageId] = useState<string | null>(search.get("message"))
  const deepMessage = search.get("message")
  // A notification clicked while already on this page only changes the URL.
  useEffect(() => {
    if (deepMessage) setFocusMessageId(deepMessage)
  }, [deepMessage])
  const [sidebarQuery, setSidebarQuery] = useState("")
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")

  const [projectMembers, setLocalMembers] = useState<ProjectMember[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)
  const [startingDM, setStartingDM] = useState(false)
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null)
  const threadMessages = activeThreadId ? threadReplies[activeThreadId] || [] : []
  const [messageInput, setMessageInput] = useState("")
  // Mention pickers for the composer: `@` for people, `#` for project items
  // (stories, subtasks, bugs, test cases, BRDs).
  const [mentionMode, setMentionMode] = useState<null | "user" | "entity">(null)
  const [mentionQuery, setMentionQuery] = useState("")
  const [entityResults, setEntityResults] = useState<LinkableEntity[]>([])
  const [entityLoading, setEntityLoading] = useState(false)
  const [pickedEntities, setPickedEntities] = useState<LinkableEntity[]>([])
  // Keep the latest picker state readable from TipTap's keydown handler, which
  // closes over stale props otherwise.
  const mentionModeRef = useRef<null | "user" | "entity">(null)
  useEffect(() => { mentionModeRef.current = mentionMode }, [mentionMode])
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
        const [channelsRes, dmsRes] = await Promise.all([
          fetch(`/api/channels?projectId=${projectId}`),
          fetch(`/api/dm?projectId=${projectId}`),
        ])
        const chs: ChatChannel[] = channelsRes.ok ? (await channelsRes.json()).channels || [] : []
        const dmList: ChatChannel[] = dmsRes.ok ? (await dmsRes.json()).dms || [] : []
        setChannels(chs)
        setDMs(dmList)
        const all = [...chs, ...dmList]
        const target =
          (deepChannel && all.find((c) => c.id === deepChannel)?.id) ||
          (activeChannelId && all.find((c) => c.id === activeChannelId)?.id) ||
          chs[0]?.id ||
          dmList[0]?.id ||
          null
        // Unread counts the server worked out from each conversation's last
        // read time. The one we're about to open counts as read.
        setUnreadCounts(Object.fromEntries(all.map((c) => [c.id, c.id === target ? 0 : c.unreadCount ?? 0])))
        setActiveChannel(target)
        if (deepChannel && !all.some((c) => c.id === deepChannel)) {
          toast.error("That conversation isn't available to you any more")
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
        toast.error("Couldn't load conversations")
      } finally {
        setLoadingChannels(false)
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, deepChannel])

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

  // Keep the open conversation marked as read while messages arrive, and once
  // more when leaving it, so live-read messages aren't unread next visit.
  useEffect(() => {
    if (!activeChannelId) return
    const id = activeChannelId
    const t = setTimeout(() => fetch(`/api/channels/${id}/read`, { method: "POST" }).catch(() => {}), 1500)
    return () => {
      clearTimeout(t)
      fetch(`/api/channels/${id}/read`, { method: "POST", keepalive: true }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, (messages[activeChannelId || ""] || []).length])

  // Scroll to the newest message, or to the message a notification pointed at.
  const channelMessageCount = (messages[activeChannelId || ""] || []).length
  useEffect(() => {
    if (focusMessageId) {
      const el = document.getElementById(`msg-${focusMessageId}`)
      if (el) {
        el.scrollIntoView({ block: "center" })
        const t = setTimeout(() => setFocusMessageId(null), 4000)
        return () => clearTimeout(t)
      }
    }
    messagesEndRef.current?.scrollIntoView({ block: "end" })
  }, [activeChannelId, channelMessageCount, focusMessageId])

  // Load thread when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
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
          setThreadReplies(activeThreadId!, data.replies || [])
        }
      } catch (err) {
        console.error("Failed to load thread:", err)
      }
    }
    loadThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" })
  }, [threadMessages.length])

  // Heartbeat, plus a re-read of everyone else's presence on the same tick.
  // Nothing pushes a "went offline" event when a member simply stops
  // heartbeating, so without this their dot would stay green until reload.
  useEffect(() => {
    if (!projectId) return
    const interval = setInterval(async () => {
      fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {})
      try {
        const res = await fetch(`/api/presence?projectId=${projectId}`)
        if (res.ok) setPresences((await res.json()).presences || [])
      } catch {
        // Transient network failure — the next tick will pick it up.
      }
    }, PRESENCE_HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [projectId, setPresences])

  // Debounced `#` search across project items.
  useEffect(() => {
    if (mentionMode !== "entity" || !projectId) return
    let cancelled = false
    setEntityLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/linkables?q=${encodeURIComponent(mentionQuery)}` +
            `&types=TASK,SUBTASK,BUG_REPORT,TEST_CASE,BRD_DOCUMENT&limit=12`
        )
        if (res.ok && !cancelled) setEntityResults((await res.json()).results || [])
      } catch {
        if (!cancelled) setEntityResults([])
      } finally {
        if (!cancelled) setEntityLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [mentionMode, mentionQuery, projectId])

  /** Replace the half-typed @/# token at the caret with the chosen value. */
  const replaceToken = useCallback((insert: string) => {
    const ed = editorRef.current
    if (!ed) return
    const from = ed.state.selection.from
    const before = ed.state.doc.textBetween(0, from, "\n", " ")
    const m = before.match(/([@#])([^\s@#]*)$/)
    const tokenLen = m ? m[0].length : 0
    ed.chain()
      .focus()
      .deleteRange({ from: from - tokenLen, to: from })
      .insertContent(insert + " ")
      .run()
    setMentionMode(null)
  }, [])

  const insertUserMention = useCallback((m: ProjectMember) => {
    replaceToken(`@${m.name || m.email}`)
  }, [replaceToken])

  const insertEntityMention = useCallback((e: LinkableEntity) => {
    replaceToken(`#${e.key}`)
    setPickedEntities((prev) =>
      prev.some((p) => p.id === e.id && p.type === e.type) ? prev : [...prev, e]
    )
  }, [replaceToken])

  // Send message
  const sendRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false })],
    content: "",
    editorProps: {
      attributes: {
        class:
          // No @tailwindcss/typography in this project, so `prose` would be a
          // no-op; composer formatting is styled in globals.css instead.
          "composer-body min-h-[44px] max-h-[160px] overflow-y-auto outline-none px-4 py-3 text-sm text-foreground",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && mentionModeRef.current) {
          setMentionMode(null)
          return true
        }
        if (event.key === "Enter" && !event.shiftKey) {
          // A picker is open — Enter must not send a half-typed token.
          if (mentionModeRef.current) return true
          // Inside a list, Enter continues the list (TipTap's own handler).
          if (editorRef.current?.isActive("listItem")) return false
          event.preventDefault()
          sendRef.current()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.state.doc.textBetween(0, editor.state.selection.from, "\n", " ")
      const tok = activeToken(text, text.length)
      if (tok) {
        setMentionMode(tok.trigger === "@" ? "user" : "entity")
        setMentionQuery(tok.query)
      } else {
        setMentionMode(null)
      }
      if (socketRef.current?.connected && activeChannelId) {
        socketRef.current.emit("typing", activeChannelId)
      }
    },
    immediatelyRender: false,
  })
  /**
   * TipTap v3's `useEditor` is intentionally non-reactive — the component does
   * not re-render as the selection moves. Toolbar active states and the Send
   * button's enabled state both need that, so subscribe explicitly.
   */
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isEmpty: e?.isEmpty ?? true,
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      strike: e?.isActive("strike") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      code: e?.isActive("code") ?? false,
    }),
  })

  const editorRef = useRef<typeof editor>(null)
  useEffect(() => { editorRef.current = editor }, [editor])

  const handleSendMessage = useCallback(async () => {
    const raw = editorRef.current ? docToMarkdown(editorRef.current.getJSON()) : messageInput
    if (!raw.trim() || !activeChannelId || sendingMessage) return
    setSendingMessage(true)

    const content = replaceEmojiShortcodes(raw.trim())

    // Only keep references whose chip survived any edits to the text.
    const entityMentions = pickedEntities.filter((e) => content.includes(`#${e.key}`))
    const mentionedUserIds = projectMembers
      .filter((m) => content.includes(`@${m.name || m.email}`))
      .map((m) => m.id)

    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit("send-message", {
        channelId: activeChannelId,
        content,
        mentions: mentionedUserIds,
        entityMentions,
      })
      editorRef.current?.commands.clearContent()
      setMessageInput("")
      setPickedEntities([])
      setSendingMessage(false)
    } else {
      try {
        await fetch(`/api/channels/${activeChannelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, mentions: mentionedUserIds, entityMentions }),
        })
        editorRef.current?.commands.clearContent()
        setMessageInput("")
        setPickedEntities([])
        // Reload messages
        const res = await fetch(`/api/channels/${activeChannelId}/messages?limit=50`)
        if (res.ok) {
          const data = await res.json()
          setMessages(activeChannelId, data.messages || [])
        }
      } catch (err) {
        console.error("Failed to send message:", err)
        toast.error("Message not sent. Check your connection and try again.")
      } finally {
        setSendingMessage(false)
      }
    }
  }, [messageInput, activeChannelId, sendingMessage, pickedEntities, projectMembers])

  useEffect(() => { sendRef.current = handleSendMessage }, [handleSendMessage])

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
      setSendingThread(false)
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
          setThreadReplies(activeThreadId, data.replies || [])
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
        toast.error(data.error || "Couldn't start the conversation")
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
    // Must go through the editor — the old messageInput string is no longer
    // what gets sent, so appending to it put the emoji nowhere visible.
    editorRef.current?.chain().focus().insertContent(emoji).run()
  }

  // Create channel
  const handleCreateChannel = async (name: string) => {
    if (!name.trim() || creatingChannel) return
    setCreatingChannel(true)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), projectId, type: "PUBLIC" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't create the channel")
      setChannels([...channels, data.channel])
      setActiveChannel(data.channel.id)
      setShowCreateChannel(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the channel")
    } finally {
      setCreatingChannel(false)
    }
  }

  // Edit / delete your own messages (socket first so everyone sees it live).
  const saveEdit = async (msg: ChatMessage) => {
    const content = replaceEmojiShortcodes(editText.trim())
    if (!content || content === msg.content) return setEditingId(null)
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit("edit-message", { messageId: msg.id, content })
      editMessage(msg.channelId, msg.id, content)
      return setEditingId(null)
    }
    const res = await fetch(`/api/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error || "Couldn't edit the message")
    editMessage(msg.channelId, msg.id, content)
    setEditingId(null)
  }

  const removeMessage = async (msg: ChatMessage) => {
    const ok = await confirm({
      title: "Delete this message?",
      description: "Everyone in the conversation will see that a message was deleted.",
      confirmLabel: "Delete message",
      variant: "danger",
    })
    if (!ok) return
    const socket = socketRef.current
    if (socket?.connected) {
      socket.emit("delete-message", msg.id)
      deleteMessage(msg.channelId, msg.id)
      return
    }
    const res = await fetch(`/api/messages/${msg.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Couldn't delete the message")
    deleteMessage(msg.channelId, msg.id)
  }

  const activeChannel = [...channels, ...dms].find(c => c.id === activeChannelId)
  const isDM = activeChannel?.type === "DIRECT"
  const activeDisplayName = isDM
    ? activeChannel?.otherMember?.name || activeChannel?.otherMember?.email || activeChannel?.name
    : activeChannel?.name
  const activeChannelMessages = activeChannelId ? messages[activeChannelId] || [] : []
  const currentTyping = activeChannelId ? typingUsers[activeChannelId] || [] : []
  const otherOnline = !!(isDM && activeChannel?.otherMember && onlineUsers.includes(activeChannel.otherMember.id))

  // Search inside the open conversation (it used to be a box that did nothing).
  const q = searchQuery.trim().toLowerCase()
  const shownMessages = q
    ? activeChannelMessages.filter((m) => !m.isDeleted && m.content.toLowerCase().includes(q))
    : activeChannelMessages

  // Sidebar filter.
  const sq = sidebarQuery.trim().toLowerCase()
  const shownChannels = sq ? channels.filter((c) => (c.name || "").toLowerCase().includes(sq)) : channels
  const shownDMs = sq
    ? dms.filter((d) => (d.otherMember?.name || d.otherMember?.email || d.name || "").toLowerCase().includes(sq))
    : dms

  const others = projectMembers.filter((m) => m.id !== currentUserId)
  useEffect(() => setSearchQuery(""), [activeChannelId])

  function formatTime(date: string | Date) {
    return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  function formatDateDivider(date: string | Date) {
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return "Today"
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  }

  /**
   * Date dividers, and grouping: a message from the same person within five
   * minutes of their previous one drops the avatar and name, like most chat
   * apps, so a burst of short messages reads as one block.
   */
  const rows = useMemo(() => {
    let lastDay = ""
    return shownMessages.map((msg, i) => {
      const day = new Date(msg.createdAt).toDateString()
      const showDivider = day !== lastDay
      lastDay = day
      const prev = shownMessages[i - 1]
      const grouped =
        !showDivider &&
        !!prev &&
        prev.senderId === msg.senderId &&
        !prev.isDeleted &&
        new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
      return { msg, showDivider, grouped }
    })
  }, [shownMessages])

  const canEdit = (msg: ChatMessage) =>
    msg.senderId === currentUserId && !msg.isDeleted && Date.now() - new Date(msg.createdAt).getTime() < 24 * 60 * 60 * 1000

  const toolbarBtn = (on: boolean) =>
    cn(
      "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
    )

  const memberPicker = (trigger: React.ReactNode) => (
    <Popover open={showNewDM} onOpenChange={setShowNewDM}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="start">
        <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Message someone on this project</p>
        <div className="max-h-72 overflow-y-auto">
          {others.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nobody else is on this project yet. Invite people from Members.
            </p>
          ) : (
            others.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handleStartDM(member.id)}
                disabled={startingDM}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                <Avatar name={member.name || member.email} url={member.avatarUrl} size={28} online={onlineUsers.includes(member.id)} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{member.name || member.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* ─── Conversations ─── */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card" aria-label="Conversations">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h1 className="heading-6 text-foreground">Team chat</h1>
          {memberPicker(
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="New direct message"
              aria-label="New direct message"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              placeholder="Find a conversation"
              aria-label="Find a conversation"
              className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4 pt-1">
          <section>
            <div className="flex items-center justify-between px-2 pb-1">
              <h2 className="text-xs font-medium text-muted-foreground">Channels</h2>
              <button
                type="button"
                onClick={() => setShowCreateChannel(true)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="New channel"
                aria-label="New channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {loadingChannels ? (
              <div className="space-y-1 px-1">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />)}
              </div>
            ) : channels.length === 0 ? (
              <div className="mx-1 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <p>No channels yet. A channel is a shared room for the whole project team.</p>
                <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" onClick={() => setShowCreateChannel(true)}>
                  <Plus className="h-3.5 w-3.5" /> Create a channel
                </Button>
              </div>
            ) : (
              shownChannels.map((channel) => (
                <ConversationButton
                  key={channel.id}
                  active={activeChannelId === channel.id}
                  unread={unreadCounts[channel.id] || 0}
                  onClick={() => setActiveChannel(channel.id)}
                  icon={channel.type === "PRIVATE" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  label={channel.name || "channel"}
                />
              ))
            )}
          </section>

          <section>
            <div className="flex items-center justify-between px-2 pb-1">
              <h2 className="text-xs font-medium text-muted-foreground">Direct messages</h2>
              {memberPicker(
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="New direct message"
                  aria-label="New direct message"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!loadingChannels && dms.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">Private one-to-one conversations appear here.</p>
            )}
            {shownDMs.map((dm) => {
              const otherName = dm.otherMember?.name || dm.otherMember?.email || dm.name || "Someone"
              return (
                <ConversationButton
                  key={dm.id}
                  active={activeChannelId === dm.id}
                  unread={unreadCounts[dm.id] || 0}
                  onClick={() => setActiveChannel(dm.id)}
                  icon={
                    <Avatar
                      name={otherName}
                      url={dm.otherMember?.avatarUrl}
                      size={20}
                      online={!!dm.otherMember && onlineUsers.includes(dm.otherMember.id)}
                    />
                  }
                  label={otherName}
                />
              )
            })}
            {sq && shownChannels.length === 0 && shownDMs.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">No conversation matches “{sidebarQuery}”.</p>
            )}
          </section>
        </nav>
      </aside>

      {/* ─── Conversation ─── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {activeChannel ? (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-2.5">
              {isDM ? (
                <Avatar name={activeDisplayName || "?"} url={activeChannel.otherMember?.avatarUrl} size={32} online={otherOnline} />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {activeChannel.type === "PRIVATE" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">{activeDisplayName}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {isDM
                    ? otherOnline
                      ? "Online"
                      : "Offline. They'll get a notification."
                    : activeChannel.type === "PRIVATE"
                      ? "Private channel"
                      : "Everyone on the project can read and post here"}
                </p>
              </div>
              <div className="relative ms-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                  placeholder="Search this conversation"
                  aria-label="Search this conversation"
                  className="h-8 w-56 rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </header>

            {q && (
              <div className="flex shrink-0 items-center justify-between border-b bg-muted/50 px-5 py-1.5 text-xs text-muted-foreground">
                <span>
                  {shownMessages.length === 0
                    ? `No messages contain “${searchQuery}”`
                    : `${shownMessages.length} ${shownMessages.length === 1 ? "message contains" : "messages contain"} “${searchQuery}”`}
                </span>
                <button type="button" onClick={() => setSearchQuery("")} className="font-medium text-primary hover:underline">
                  Clear search
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4" role="log" aria-live="polite" aria-label={`Messages in ${activeDisplayName}`}>
              {activeChannelMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {isDM ? <MessageSquare className="h-6 w-6" /> : <Hash className="h-6 w-6" />}
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {isDM ? `This is the start of your conversation with ${activeDisplayName}` : `This is the start of #${activeChannel.name}`}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Type @ to mention someone, or # to link a story, bug, test case or BRD.
                  </p>
                </div>
              ) : (
                rows.map(({ msg, showDivider, grouped }) => (
                  <div key={msg.id}>
                    {showDivider && (
                      <div className="my-4 flex items-center gap-3" role="separator">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground">{formatDateDivider(msg.createdAt)}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div
                      id={`msg-${msg.id}`}
                      className={cn(
                        "group relative flex gap-3 rounded-lg px-2 transition-colors hover:bg-accent/50",
                        grouped ? "py-0.5" : "mt-2 py-1.5",
                        focusMessageId === msg.id && "bg-primary/10 ring-1 ring-primary/40"
                      )}
                    >
                      <div className="w-9 shrink-0">
                        {grouped ? (
                          <span className="block pt-0.5 text-right text-xs tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">
                            {formatTime(msg.createdAt)}
                          </span>
                        ) : (
                          <a href={`/users/${msg.sender.id}`} title="View profile" className="block">
                            <Avatar name={msg.sender.name || msg.sender.email} url={msg.sender.avatarUrl} size={36} />
                          </a>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {!grouped && (
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-foreground">{msg.sender.name || msg.sender.email}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatTime(msg.createdAt)}</span>
                            {msg.editedAt && !msg.isDeleted && <span className="text-xs text-muted-foreground">edited</span>}
                          </div>
                        )}

                        {editingId === msg.id ? (
                          <div className="mt-1 space-y-2">
                            <textarea
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingId(null)
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault()
                                  saveEdit(msg)
                                }
                              }}
                              rows={Math.min(6, editText.split("\n").length + 1)}
                              aria-label="Edit message"
                              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                            <div className="flex items-center gap-2 text-xs">
                              <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(msg)}>Save</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                              <span className="text-muted-foreground">Enter saves, Esc cancels</span>
                            </div>
                          </div>
                        ) : (
                          <div className="break-words text-sm leading-relaxed text-foreground" dir="auto">
                            {msg.isDeleted ? (
                              <span className="text-muted-foreground">This message was deleted</span>
                            ) : (
                              <FormattedMessage content={msg.content} people={projectMembers} entities={(msg.entityMentions as any) || []} />
                            )}
                            {grouped && msg.editedAt && !msg.isDeleted && <span className="block text-xs text-muted-foreground">edited</span>}
                          </div>
                        )}

                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {msg.attachments.map((att: any) => (
                              <a
                                key={att.id}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                              >
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="max-w-[180px] truncate">{att.name}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {groupReactions(msg.reactions).map((r: any) => {
                              const mine = r.users.some((u: any) => u?.id === currentUserId)
                              return (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => toggleReaction(msg, r.emoji)}
                                  title={r.users.map((u: any) => u?.name || "Someone").join(", ")}
                                  aria-pressed={mine}
                                  className={cn(
                                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                                    mine ? "border-primary/40 bg-primary/10 text-primary" : "bg-background hover:bg-accent"
                                  )}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="font-medium tabular-nums">{r.count}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {(msg._count?.replies || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveThread(msg.id)}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {msg._count!.replies} {msg._count!.replies === 1 ? "reply" : "replies"}
                          </button>
                        )}
                      </div>

                      {/* Actions on hover or keyboard focus */}
                      {!msg.isDeleted && editingId !== msg.id && (
                        <div className="absolute -top-3 right-2 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className={toolbarBtn(false)} title="Add a reaction" aria-label="Add a reaction">
                                <Smile className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-1.5" align="end">
                              <div className="flex gap-0.5">
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => toggleReaction(msg, emoji)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-accent"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <button type="button" onClick={() => setActiveThread(msg.id)} className={toolbarBtn(false)} title="Reply in thread" aria-label="Reply in thread">
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          {canEdit(msg) && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(msg.id)
                                setEditText(msg.content)
                              }}
                              className={toolbarBtn(false)}
                              title="Edit message"
                              aria-label="Edit message"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          {msg.senderId === currentUserId && (
                            <button
                              type="button"
                              onClick={() => removeMessage(msg)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="h-5 shrink-0 px-6 text-xs text-muted-foreground" aria-live="polite">
              {currentTyping.length > 0 &&
                `${currentTyping.map((t) => t.name).join(", ")} ${currentTyping.length === 1 ? "is" : "are"} typing…`}
            </div>

            {/* Composer */}
            <div className="shrink-0 px-5 pb-4">
              <div className="relative rounded-xl border bg-card shadow-sm transition-shadow focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
                {mentionMode && (
                  <div className="absolute bottom-full left-3 z-50 mb-2 max-h-64 w-80 overflow-y-auto rounded-lg border bg-popover py-1 shadow-lg">
                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
                      {mentionMode === "user" ? "Mention someone" : "Link an item"}
                    </p>
                    {mentionMode === "user" && (() => {
                      const mq = mentionQuery.toLowerCase()
                      const list = projectMembers.filter((m) => (m.name || m.email).toLowerCase().includes(mq))
                      if (list.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">Nobody matches.</p>
                      return list.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => insertUserMention(m)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                        >
                          <Avatar name={m.name || m.email} url={m.avatarUrl} size={20} />
                          <span className="truncate">{m.name || m.email}</span>
                        </button>
                      ))
                    })()}
                    {mentionMode === "entity" && (
                      <>
                        {entityLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
                        {!entityLoading && entityResults.length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Nothing matches.</p>
                        )}
                        {!entityLoading &&
                          entityResults.map((e) => (
                            <button
                              key={`${e.type}:${e.id}`}
                              type="button"
                              onClick={() => insertEntityMention(e)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                            >
                              <span className={cn("shrink-0 rounded border px-1 py-0.5 text-xs font-semibold", ENTITY_CHIP[e.type] || "border-border bg-muted text-muted-foreground")}>
                                {e.key}
                              </span>
                              <span className="truncate">{e.label}</span>
                            </button>
                          ))}
                      </>
                    )}
                  </div>
                )}

                <EditorContent
                  editor={editor}
                  className="composer-editor"
                  data-placeholder={isDM ? `Message ${activeDisplayName}` : `Message #${activeChannel.name}`}
                />

                <div className="flex items-center gap-0.5 border-t px-2 py-1.5">
                  <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={toolbarBtn(!!editorState?.bold)} title="Bold" aria-label="Bold" aria-pressed={!!editorState?.bold}>
                    <Bold className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={toolbarBtn(!!editorState?.italic)} title="Italic" aria-label="Italic" aria-pressed={!!editorState?.italic}>
                    <Italic className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={toolbarBtn(!!editorState?.strike)} title="Strikethrough" aria-label="Strikethrough" aria-pressed={!!editorState?.strike}>
                    <Strikethrough className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                  <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={toolbarBtn(!!editorState?.bulletList)} title="Bulleted list" aria-label="Bulleted list" aria-pressed={!!editorState?.bulletList}>
                    <List className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={toolbarBtn(!!editorState?.orderedList)} title="Numbered list" aria-label="Numbered list" aria-pressed={!!editorState?.orderedList}>
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleCode().run()} className={toolbarBtn(!!editorState?.code)} title="Code" aria-label="Code" aria-pressed={!!editorState?.code}>
                    <Code2 className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                  <EmojiPicker onEmojiSelect={insertEmoji} />
                  <span className="ms-2 hidden text-xs text-muted-foreground md:inline">
                    Enter to send, Shift+Enter for a new line
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={(editorState?.isEmpty ?? true) || sendingMessage}
                    className="ms-auto h-8 gap-1.5 text-xs"
                  >
                    <Send className="h-3.5 w-3.5" /> Send
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            {loadingChannels ? (
              <div className="h-24 w-64 animate-pulse rounded-xl bg-muted" />
            ) : (
              <div className="max-w-sm">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MessageSquare className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">Start talking with your team</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a channel for the whole project, or send someone a direct message.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" className="h-8 text-xs" onClick={() => setShowCreateChannel(true)}>
                    <Plus className="h-3.5 w-3.5" /> Create a channel
                  </Button>
                  {memberPicker(
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Edit2 className="h-3.5 w-3.5" /> Direct message
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Thread (only while one is open) ─── */}
      {activeThreadId && threadParent && (
        <aside className="flex w-96 shrink-0 flex-col border-l bg-card" aria-label="Thread">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Thread</h2>
              <p className="text-xs text-muted-foreground">
                {isDM ? `With ${activeDisplayName}` : `In #${activeChannel?.name}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveThread(null)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close thread"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <ThreadMessage msg={threadParent} people={projectMembers} time={formatTime(threadParent.createdAt)} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{threadMessages.length} {threadMessages.length === 1 ? "reply" : "replies"}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {threadMessages.map((reply) => (
              <ThreadMessage key={reply.id} msg={reply} people={projectMembers} time={formatTime(reply.createdAt)} />
            ))}
            <div ref={threadEndRef} />
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
              <textarea
                value={threadInput}
                onChange={(e) => setThreadInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendThreadReply()
                  }
                }}
                rows={1}
                placeholder="Reply in thread"
                aria-label="Reply in thread"
                className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <Button size="sm" onClick={handleSendThreadReply} disabled={!threadInput.trim() || sendingThread} className="h-8 w-8 p-0" aria-label="Send reply">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>
      )}

      <PromptDialog
        open={showCreateChannel}
        title="Create a channel"
        description="Everyone on this project can read and post in it. Use a short name, like qa or releases."
        label="Channel name"
        placeholder="releases"
        confirmLabel="Create channel"
        pending={creatingChannel}
        onCancel={() => setShowCreateChannel(false)}
        onSubmit={(name) => handleCreateChannel(name)}
      />
    </div>
  )
}

function Avatar({ name, url, size = 32, online }: { name: string; url?: string | null; size?: number; online?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-primary/15 font-semibold text-primary"
          style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
          aria-hidden
        >
          {(name || "?").trim().charAt(0).toUpperCase()}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card",
            online ? "bg-emerald-500" : "bg-muted-foreground/40"
          )}
          style={{ width: Math.max(8, size * 0.3), height: Math.max(8, size * 0.3) }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </span>
  )
}

function ConversationButton({
  active,
  unread,
  onClick,
  icon,
  label,
}: {
  active: boolean
  unread: number
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/10 font-medium text-primary" : unread > 0 ? "font-semibold text-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {unread > 0 && !active && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground" aria-label={`${unread} unread`}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  )
}

function ThreadMessage({ msg, people, time }: { msg: ChatMessage; people: ProjectMember[]; time: string }) {
  return (
    <div className="flex gap-3">
      <Avatar name={msg.sender.name || msg.sender.email || "?"} url={msg.sender.avatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{msg.sender.name || msg.sender.email}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
        </div>
        <div className="break-words text-sm leading-relaxed text-foreground" dir="auto">
          {msg.isDeleted ? (
            <span className="text-muted-foreground">This message was deleted</span>
          ) : (
            <FormattedMessage content={msg.content} people={people} entities={(msg.entityMentions as any) || []} />
          )}
        </div>
      </div>
    </div>
  )
}

function groupReactions(reactions: any[]) {
  const grouped: { [emoji: string]: { emoji: string; count: number; users: any[] } } = {}
  reactions.forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] }
    grouped[r.emoji].count++
    grouped[r.emoji].users.push(r.user)
  })
  return Object.values(grouped)
}
