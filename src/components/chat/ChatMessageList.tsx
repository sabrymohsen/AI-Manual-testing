"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { ChatMessage as MessageType, useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowDown } from "@/components/ui/icons";

type ListItem =
  | { type: "date-divider"; key: string; dateText: string }
  | { type: "new-divider"; key: string }
  | { type: "message"; key: string; message: MessageType; isGrouped: boolean };

export function ChatMessageList({
  messages,
  currentUserId,
  lastReadAt,
  socket,
  onMention,
}: {
  messages: MessageType[];
  currentUserId: string;
  lastReadAt: string | Date | null;
  socket: any; // SocketRef
  onMention: (name: string) => void;
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Group and format messages into list items
  const listItems = useMemo(() => {
    const items: ListItem[] = [];
    if (!messages || messages.length === 0) return items;

    const readCutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;
    let lastDateKey = "";
    let showedNewDivider = false;

    messages.forEach((msg, idx) => {
      const msgTime = new Date(msg.createdAt);
      const msgDateKey = format(msgTime, "yyyy-MM-dd");

      // 1. Insert date divider if date changed
      if (msgDateKey !== lastDateKey) {
        let dateText = format(msgTime, "EEEE, MMMM d");
        if (isToday(msgTime)) dateText = "Today";
        else if (isYesterday(msgTime)) dateText = "Yesterday";

        items.push({
          type: "date-divider",
          key: `date-${msgDateKey}`,
          dateText,
        });
        lastDateKey = msgDateKey;
      }

      // 2. Insert new message divider if message is unread
      if (
        readCutoff > 0 &&
        msgTime.getTime() > readCutoff &&
        msg.senderId !== currentUserId &&
        !showedNewDivider
      ) {
        items.push({
          type: "new-divider",
          key: "new-messages-divider",
        });
        showedNewDivider = true;
      }

      // 3. Determine if message is grouped (same sender and within 5 mins of previous message)
      let isGrouped = false;
      if (idx > 0) {
        const prevMsg = messages[idx - 1];
        const prevTime = new Date(prevMsg.createdAt);
        const timeDiffMins = (msgTime.getTime() - prevTime.getTime()) / (1000 * 60);

        if (
          prevMsg.senderId === msg.senderId &&
          timeDiffMins < 5 &&
          msgTime.getDate() === prevTime.getDate() && // Same day
          prevMsg.isDeleted === false &&
          msg.isDeleted === false
        ) {
          isGrouped = true;
        }
      }

      items.push({
        type: "message",
        key: msg.id,
        message: msg,
        isGrouped,
      });
    });

    return items;
  }, [messages, lastReadAt, currentUserId]);

  // Keep showing jump button if we are scrolled up and there are messages
  useEffect(() => {
    setShowJumpButton(!atBottom && listItems.length > 3);
  }, [atBottom, listItems.length]);

  // Auto-scroll to bottom on mount or when a new message arrives and we are already at the bottom
  useEffect(() => {
    if (atBottom && virtuosoRef.current) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: listItems.length - 1,
          behavior: "auto",
        });
      }, 50);
    }
  }, [listItems.length]);

  const jumpToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: listItems.length - 1,
      behavior: "smooth",
    });
    setAtBottom(true);
  };

  const renderItem = (index: number, item: ListItem) => {
    if (item.type === "date-divider") {
      return (
        <div className="flex items-center justify-center my-4">
          <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
          <span className="mx-4 text-xs font-semibold text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-150 dark:border-slate-800">
            {item.dateText}
          </span>
          <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
        </div>
      );
    }

    if (item.type === "new-divider") {
      return (
        <div className="flex items-center my-2">
          <div className="h-[2px] bg-red-500 flex-grow" />
          <span className="bg-red-500 text-white font-medium text-xs px-2 py-0.5 rounded-sm">
            New
          </span>
          <div className="h-[2px] bg-red-500 flex-grow" />
        </div>
      );
    }

    return (
      <ChatMessage
        message={item.message}
        currentUserId={currentUserId}
        isGrouped={item.isGrouped}
        onMention={onMention}
        socket={socket}
      />
    );
  };

  return (
    <div className="flex-1 min-h-0 relative bg-white dark:bg-slate-900">
      {listItems.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground dark:text-muted-foreground p-6">
          <p className="text-sm">This is the start of this conversation.</p>
          <p className="text-xs mt-1">Send a message to start chatting!</p>
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          data={listItems}
          itemContent={renderItem}
          atBottomStateChange={(bottom) => setAtBottom(bottom)}
          followOutput="auto"
          className="h-full"
          alignToBottom={true}
        />
      )}

      {/* Jump to Bottom FAB */}
      {showJumpButton && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1 bg-primary text-white text-xs font-semibold px-3 py-2 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:bg-primary/90 transition-all scale-100 hover:scale-105 z-20"
        >
          <span>Jump to bottom</span>
          <ArrowDown className="h-3 w-3 animate-bounce" />
        </button>
      )}
    </div>
  );
}
