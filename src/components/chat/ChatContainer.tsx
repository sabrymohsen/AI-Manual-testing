"use client";

import React, { useEffect, useState } from "react";
import { useChatStore, ChatChannel } from "@/stores/chatStore";
import { useSocket } from "@/hooks/useSocket";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ThreadPanel } from "./ThreadPanel";
import { MessageCircle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatContainerProps {
  projectId: string;
  token: string;
  currentUserId: string;
}

export function ChatContainer({ projectId, token, currentUserId }: ChatContainerProps) {
  const {
    isOpen,
    openChat,
    closeChat,
    activeChannelId,
    setActiveChannel,
    channels,
    dms,
    unreadCounts,
    setChannels,
    setDMs,
    setMessages,
    setPresences,
    messages,
    activeThreadId,
  } = useChatStore();

  const [projectMembers, setProjectMembers] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);

  // Initialize socket.io Client Hook
  const socket = useSocket(token, projectId);

  // Request notification permission on first open
  useEffect(() => {
    if (isOpen && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, [isOpen]);

  // Load project details (channels, dms, members, presence)
  useEffect(() => {
    if (!projectId) return;

    async function loadProjectData() {
      try {
        // Load non-DM channels
        const channelsRes = await fetch(`/api/channels?projectId=${projectId}`);
        if (channelsRes.ok) {
          const data = await channelsRes.json();
          setChannels(data.channels || []);
          
          // Auto select first channel if none is active
          if (data.channels && data.channels.length > 0 && !activeChannelId) {
            setActiveChannel(data.channels[0].id);
          }
        }

        // Load DMs
        const dmsRes = await fetch(`/api/dm?projectId=${projectId}`);
        if (dmsRes.ok) {
          const data = await dmsRes.json();
          setDMs(data.dms || []);
        }

        // Load Project members
        const membersRes = await fetch(`/api/projects/${projectId}/scrum/members`);
        if (membersRes.ok) {
          const data = await membersRes.json();
          setProjectMembers(data.members || []);
        }

        // Load initial presence
        const presenceRes = await fetch(`/api/presence?projectId=${projectId}`);
        if (presenceRes.ok) {
          const data = await presenceRes.json();
          setPresences(data.presences || []);
        }
      } catch (err) {
        console.error("Failed to load initial chat project data:", err);
      }
    }

    loadProjectData();
  }, [projectId]);

  // Periodically send presence heartbeat (every 25 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch("/api/presence/heartbeat", { method: "POST" });
      } catch (err) {
        console.error("Heartbeat error:", err);
      }
    }, 25000);

    return () => clearInterval(interval);
  }, []);

  // Fetch messages when active channel changes
  useEffect(() => {
    if (!activeChannelId) return;
    const channelId = activeChannelId;

    async function loadChannelMessages() {
      try {
        const res = await fetch(`/api/channels/${channelId}/messages?limit=50`);
        if (res.ok) {
          const data = await res.json();
          setMessages(channelId, data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load channel messages:", err);
      }
    }

    loadChannelMessages();
  }, [activeChannelId]);

  // Compute total unread messages count across all channels & DMs
  const totalUnreads = Object.values(unreadCounts).reduce((acc, curr) => acc + curr, 0);

  // Active channel details object
  const activeChannel = [...channels, ...dms].find((c) => c.id === activeChannelId);
  const activeChannelMessages = activeChannelId ? messages[activeChannelId] || [] : [];

  const handleMentionUser = (name: string) => {
    // If the input has a TipTap instance, we can inject it.
    // For simplicity, we trigger a custom window event or let Tiptap handle it,
    // we'll dispatch an event that ChatInput listens to or handles.
    const event = new CustomEvent("chat-mention-insert", { detail: { name } });
    window.dispatchEvent(event);
  };

  if (!isOpen) {
    return (
      <button
        onClick={openChat}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-indigo-600 text-white hover:bg-indigo-750 hover:scale-105 active:scale-95 transition-all shadow-xl"
        title="Open Team Chat"
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnreads > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold h-6 min-w-6 px-1.5 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center">
            {totalUnreads}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed right-0 top-0 bottom-0 z-50 flex bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transition-all duration-300 transform",
        activeThreadId ? "w-full sm:w-[700px]" : "w-full sm:w-[380px]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Sidebar - Collapsible */}
      {showSidebar && (
        <ChatSidebar
          projectId={projectId}
          projectMembers={projectMembers}
          currentUserId={currentUserId}
        />
      )}

      {/* Main Area: Feed & Input */}
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 min-w-0 relative">
        {/* Active Channel Header */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            {/* Sidebar toggle button */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
            >
              {showSidebar ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="truncate">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate flex items-center gap-1">
                {activeChannel?.type === "DIRECT" ? (
                  <span>@ {activeChannel.otherMember?.name || activeChannel.otherMember?.email}</span>
                ) : (
                  <>
                    <span>#</span>
                    <span>{activeChannel?.name || "Select channel"}</span>
                  </>
                )}
              </h4>
              {activeChannel?.description && (
                <p className="text-[10px] text-slate-400 truncate">{activeChannel.description}</p>
              )}
            </div>
          </div>

          <button
            onClick={closeChat}
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-350"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message Feed */}
        {activeChannelId ? (
          <ChatMessageList
            messages={activeChannelMessages}
            currentUserId={currentUserId}
            lastReadAt={activeChannel?.members?.[0]?.lastReadAt || null}
            onMention={handleMentionUser}
            socket={socket}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            Please select a channel to start conversation.
          </div>
        )}

        {/* Message Input */}
        {activeChannelId && (
          <ChatInput
            projectId={projectId}
            channelId={activeChannelId}
            socket={socket}
          />
        )}
      </div>

      {/* Threads Side Panel */}
      {activeThreadId && (
        <ThreadPanel
          projectId={projectId}
          currentUserId={currentUserId}
          socket={socket}
          onMention={handleMentionUser}
        />
      )}
    </div>
  );
}
