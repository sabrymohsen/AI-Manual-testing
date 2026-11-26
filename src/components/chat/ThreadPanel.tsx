"use client";

import React, { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { X, Loader2 } from "@/components/ui/icons";

export function ThreadPanel({
  projectId,
  currentUserId,
  socket,
  onMention,
}: {
  projectId: string;
  currentUserId: string;
  socket: any; // SocketRef
  onMention: (name: string) => void;
}) {
  const {
    activeThreadId,
    activeParentMessage,
    setActiveThread,
    threadReplies,
    setThreadReplies,
  } = useChatStore();

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadReplies() {
      if (!activeThreadId) return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/messages/${activeThreadId}/replies`);
        if (res.ok) {
          const data = await res.json();
          setThreadReplies(activeThreadId, data.replies || []);
        }
      } catch (err) {
        console.error("Failed to load thread replies:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadReplies();
  }, [activeThreadId]);

  if (!activeThreadId || !activeParentMessage) return null;

  const replies = threadReplies[activeThreadId] || [];

  return (
    <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-14 border-b border-border dark:border-slate-800 flex items-center justify-between px-4">
        <h3 className="font-semibold text-sm text-foreground dark:text-slate-200">Thread</h3>
        <button
          onClick={() => setActiveThread(null, null)}
          className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-350"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* Parent Pinned Message */}
        <div className="bg-indigo-50/20 dark:bg-indigo-950/10 border-b border-slate-100 dark:border-slate-850/50 pb-3">
          <ChatMessage
            message={activeParentMessage}
            currentUserId={currentUserId}
            isGrouped={false}
            onMention={onMention}
            socket={socket}
          />
        </div>

        {/* Replies List */}
        <div className="flex-1 py-4 flex flex-col gap-2 min-h-0">
          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : replies.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground dark:text-muted-foreground text-xs">
              No replies yet.
            </div>
          ) : (
            replies.map((reply) => (
              <ChatMessage
                key={reply.id}
                message={reply}
                currentUserId={currentUserId}
                isGrouped={false}
                onMention={onMention}
                socket={socket}
              />
            ))
          )}
        </div>
      </div>

      {/* Thread Chat Input */}
      <ChatInput
        projectId={projectId}
        channelId={activeParentMessage.channelId}
        parentId={activeThreadId}
        socket={socket}
        placeholder="Reply to thread..."
      />
    </div>
  );
}
