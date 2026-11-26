import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useChatStore, ChatMessage } from "@/stores/chatStore";

export function useSocket(token: string, projectId: string | null, currentUserId?: string) {
  const socketRef = useRef<Socket | null>(null);

  const {
    addMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    updatePresence,
    activeChannelId,
    incrementUnread,
  } = useChatStore();

  useEffect(() => {
    if (!token || !projectId) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Join the project room (presence, public channel activity) and the open
      // conversation. Read the store here, not the value from when this effect
      // ran, or a reconnect rejoins whichever channel was open at page load.
      socket.emit("join-project", projectId);
      const active = useChatStore.getState().activeChannelId;
      if (active) socket.emit("join-channel", active);
    });

    // Find which channel a message lives in from the local cache
    const findChannelOfMessage = (messageId: string): string | null => {
      const { messages } = useChatStore.getState();
      for (const [channelId, msgs] of Object.entries(messages)) {
        if (msgs.some((m) => m.id === messageId)) return channelId;
      }
      return null;
    };

    // Handle new message
    socket.on("new-message", (message: ChatMessage) => {
      const state = useChatStore.getState();
      addMessage(message.channelId, message);

      // If the message belongs to a channel we don't know yet (e.g. someone just
      // opened a new DM with us), refresh the DM list so it appears in the sidebar.
      const known =
        state.channels.some((c) => c.id === message.channelId) ||
        state.dms.some((d) => d.id === message.channelId);
      if (!known && projectId) {
        fetch(`/api/dm?projectId=${projectId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.dms) useChatStore.getState().setDMs(data.dms);
          })
          .catch(() => {});
      }

      // Unread badges come from "channel-activity"; alerts come from the bell.
    });

    // A conversation we don't have open got a message: bump its badge. The
    // server sends this to everyone who can see the conversation, including
    // people who never opened it, so badges no longer depend on having joined
    // the channel's room.
    socket.on("channel-activity", (payload: { channelId: string; senderId: string; parentId?: string | null }) => {
      const state = useChatStore.getState();
      if (payload.senderId === currentUserId) return;
      if (payload.parentId) return; // thread replies don't count as unread in the list
      if (state.activeChannelId === payload.channelId && document.visibilityState === "visible") return;
      incrementUnread(payload.channelId);
      const known =
        state.channels.some((c) => c.id === payload.channelId) || state.dms.some((d) => d.id === payload.channelId);
      if (!known && projectId) {
        fetch(`/api/dm?projectId=${projectId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.dms) useChatStore.getState().setDMs(data.dms);
          })
          .catch(() => {});
      }
    });

    // Handle message edit
    socket.on("message-edited", (message: ChatMessage) => {
      editMessage(message.channelId, message.id, message.content, message.htmlContent);
    });

    // Handle message delete
    socket.on("message-deleted", (payload: { messageId: string }) => {
      const channelId = findChannelOfMessage(payload.messageId) || useChatStore.getState().activeChannelId;
      if (channelId) {
        deleteMessage(channelId, payload.messageId);
      }
    });

    // Handle reaction added
    socket.on("reaction-added", (payload: { messageId: string; reaction: any }) => {
      const channelId = findChannelOfMessage(payload.messageId) || useChatStore.getState().activeChannelId;
      if (channelId) {
        addReaction(channelId, payload.messageId, payload.reaction);
      }
    });

    // Handle reaction removed
    socket.on("reaction-removed", (payload: { messageId: string; emoji: string; userId: string }) => {
      const channelId = findChannelOfMessage(payload.messageId) || useChatStore.getState().activeChannelId;
      if (channelId) {
        removeReaction(channelId, payload.messageId, payload.emoji, payload.userId);
      }
    });

    // Handle typing indicators
    socket.on("user-typing", (payload: { userId: string; name: string; channelId: string }) => {
      const { typingUsers, setTyping } = useChatStore.getState();
      const current = typingUsers[payload.channelId] || [];
      if (!current.some((u) => u.userId === payload.userId)) {
        setTyping(payload.channelId, [...current, { userId: payload.userId, name: payload.name }]);
      }
    });

    socket.on("user-stopped-typing", (payload: { userId: string; channelId: string }) => {
      const { typingUsers, setTyping } = useChatStore.getState();
      const current = typingUsers[payload.channelId] || [];
      setTyping(
        payload.channelId,
        current.filter((u) => u.userId !== payload.userId)
      );
    });

    // Handle presence updates
    socket.on("presence-update", (payload: { userId: string; isOnline: boolean }) => {
      updatePresence(payload.userId, payload.isOnline, new Date());
    });

    return () => {
      socket.disconnect();
    };
  }, [token, projectId, currentUserId]);

  // Handle active channel change
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !activeChannelId) return;

    // Join new channel room
    socket.emit("join-channel", activeChannelId);

    return () => {
      socket.emit("leave-channel", activeChannelId);
    };
  }, [activeChannelId]);

  return socketRef;
}
