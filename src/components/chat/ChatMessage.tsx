"use client";

import React, { useState } from "react";
import { ChatMessage as MessageType, useChatStore } from "@/stores/chatStore";
import { MoreHorizontal, MessageSquare, Edit2, Trash2, Link, Reply, Paperclip } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";

export function ChatMessage({
  message,
  currentUserId,
  isGrouped = false,
  onMention,
  socket,
}: {
  message: MessageType;
  currentUserId: string;
  isGrouped?: boolean;
  onMention: (name: string) => void;
  socket: any; // SocketRef
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  
  const { setActiveThread, deleteMessage, editMessage } = useChatStore();

  const isSender = message.senderId === currentUserId;
  const isDeleted = message.isDeleted;

  // Formatting date/time
  const timestamp = new Date(message.createdAt);
  const timeFormatted = format(timestamp, "h:mm a");
  const fullDateTime = format(timestamp, "MMM d, yyyy h:mm:ss a");

  // Format size helper
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleEdit = async () => {
    if (!editValue.trim() || editValue === message.content) {
      setIsEditing(false);
      return;
    }

    if (socket.current && socket.current.connected) {
      socket.current.emit("edit-message", {
        messageId: message.id,
        content: editValue,
        htmlContent: `<p>${editValue}</p>`,
      });
    } else {
      // REST fallback
      try {
        await fetch(`/api/messages/${message.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editValue, htmlContent: `<p>${editValue}</p>` }),
        });
        editMessage(message.channelId, message.id, editValue, `<p>${editValue}</p>`);
      } catch (err) {
        console.error("Failed to edit message:", err);
      }
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    if (socket.current && socket.current.connected) {
      socket.current.emit("delete-message", message.id);
    } else {
      // REST fallback
      try {
        await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
        deleteMessage(message.channelId, message.id);
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
    }
  };

  const handleToggleReaction = async (emoji: string) => {
    const hasReacted = message.reactions?.some((r) => r.emoji === emoji && r.userId === currentUserId);
    
    if (socket.current && socket.current.connected) {
      if (hasReacted) {
        socket.current.emit("remove-reaction", { messageId: message.id, emoji });
      } else {
        socket.current.emit("add-reaction", { messageId: message.id, emoji });
      }
    } else {
      // REST fallback
      try {
        const method = hasReacted ? "DELETE" : "POST";
        const url = hasReacted 
          ? `/api/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`
          : `/api/messages/${message.id}/reactions`;

        await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: hasReacted ? undefined : JSON.stringify({ emoji }),
        });
      } catch (err) {
        console.error("Failed to toggle reaction:", err);
      }
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/chat?channelId=${message.channelId}&messageId=${message.id}`;
    navigator.clipboard.writeText(url);
  };

  // Group reactions by emoji
  const reactionsGrouped = (message.reactions || []).reduce((acc, current) => {
    if (!acc[current.emoji]) {
      acc[current.emoji] = [];
    }
    acc[current.emoji].push(current);
    return acc;
  }, {} as Record<string, typeof message.reactions>);

  return (
    <div 
      className={cn(
        "group relative flex items-start gap-3 px-4 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors",
        isGrouped ? "mt-0.5" : "mt-3"
      )}
    >
      {/* Left Column: Avatar */}
      {!isGrouped ? (
        <Avatar className="h-9 w-9 flex-shrink-0 cursor-pointer" onClick={() => onMention(message.sender.name || message.sender.email)}>
          {message.sender.avatarUrl ? (
            <AvatarImage src={message.sender.avatarUrl} alt={message.sender.name || "Sender"} />
          ) : (
            <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold text-xs">
              {(message.sender.name || message.sender.email).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
      ) : (
        <div className="w-9 flex-shrink-0 text-center opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 select-none pt-0.5">
          {timeFormatted.split(" ")[0]}
        </div>
      )}

      {/* Right Column: Message Bubble details */}
      <div className="flex-1 min-w-0">
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span 
              onClick={() => onMention(message.sender.name || message.sender.email)}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:underline"
            >
              {message.sender.name || message.sender.email}
            </span>
            <span 
              className="text-[10px] text-slate-400 select-none"
              title={fullDateTime}
            >
              {timeFormatted}
            </span>
          </div>
        )}

        {/* Message Content */}
        {isEditing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEdit();
                if (e.key === "Escape") setIsEditing(false);
              }}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1 text-sm outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex gap-2 text-xs">
              <button 
                onClick={handleEdit} 
                className="text-indigo-600 dark:text-indigo-400 font-semibold"
              >
                Save
              </button>
              <button 
                onClick={() => setIsEditing(false)} 
                className="text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-700 dark:text-slate-300 break-words leading-relaxed select-text">
            {isDeleted ? (
              <span className="italic text-slate-400 dark:text-slate-500">This message was deleted</span>
            ) : message.htmlContent ? (
              <div 
                className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 text-sm leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: message.htmlContent }} 
              />
            ) : (
              message.content
            )}
          </div>
        )}

        {/* Message Attachments */}
        {!isDeleted && message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {message.attachments.map((file) => {
              const isImage = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mimeType);
              return (
                <div key={file.id} className="flex flex-col gap-1 max-w-[280px]">
                  {isImage ? (
                    <a 
                      href={file.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                    >
                      <img 
                        src={file.url} 
                        alt={file.name} 
                        className="max-h-40 w-auto object-cover hover:opacity-90 transition-opacity" 
                      />
                    </a>
                  ) : (
                    <a
                      href={file.url}
                      download
                      className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Paperclip className="h-4 w-4 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-400">{formatSize(file.size)}</p>
                      </div>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions List */}
        {!isDeleted && Object.keys(reactionsGrouped).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(reactionsGrouped).map(([emoji, reacts]) => {
              const hasReacted = reacts.some((r) => r.userId === currentUserId);
              const reactorsNames = reacts.map((r) => r.user.name || "Someone").join(", ");
              return (
                <button
                  key={emoji}
                  onClick={() => handleToggleReaction(emoji)}
                  title={reactorsNames}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    hasReacted
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-[10px] font-semibold">{reacts.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread replies indicator link */}
        {!isDeleted && !message.parentId && message._count?.replies && message._count.replies > 0 ? (
          <button
            onClick={() => setActiveThread(message.id, message)}
            className="flex items-center gap-1.5 mt-2 rounded bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{message._count.replies} {message._count.replies === 1 ? "reply" : "replies"}</span>
          </button>
        ) : null}
      </div>

      {/* Floating hover Actions Menu */}
      {!isDeleted && (
        <div className="absolute right-4 top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md px-1 py-0.5">
          {!message.parentId && (
            <button
              onClick={() => setActiveThread(message.id, message)}
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              title="Reply in thread"
            >
              <Reply className="h-4 w-4" />
            </button>
          )}

          {/* Quick emoji reaction picker */}
          <EmojiPicker onEmojiSelect={handleToggleReaction} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={copyLink}>
                <Link className="mr-2 h-4 w-4" />
                <span>Copy link</span>
              </DropdownMenuItem>
              {isSender && (
                <>
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    <span>Edit</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
