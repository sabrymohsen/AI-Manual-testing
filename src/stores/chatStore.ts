import { create } from "zustand";

export interface ChatMessage {
  id: string;
  content: string;
  htmlContent: string | null;
  /** Entities referenced with `#`: [{ type, id, key, label, url }]. */
  entityMentions?: { type: string; id: string; key: string; label: string; url: string }[] | null;
  type: "TEXT" | "SYSTEM" | "FILE" | "CODE";
  channelId: string;
  senderId: string;
  parentId: string | null;
  createdAt: string | Date;
  editedAt: string | Date | null;
  isDeleted: boolean;
  sender: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
  reactions: {
    id: string;
    emoji: string;
    userId: string;
    messageId: string;
    user: {
      id: string;
      name: string | null;
    };
  }[];
  attachments: {
    id: string;
    name: string;
    url: string;
    size: number;
    mimeType: string;
    createdAt: string | Date;
  }[];
  _count?: {
    replies: number;
  };
}

export interface ChatChannel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE" | "DIRECT";
  projectId: string;
  createdById: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  unreadCount?: number;
  role?: string | null;
  muted?: boolean;
  members?: {
    lastReadAt: string | Date;
    role: string;
    muted: boolean;
  }[];
  otherMember?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
}

export interface PresenceInfo {
  userId: string;
  isOnline: boolean;
  lastSeen?: string | Date;
  typingIn?: string | null;
}

export interface ProjectMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  role?: string;
}

interface ChatStore {
  isOpen: boolean;
  activeChannelId: string | null;
  activeThreadId: string | null;
  activeParentMessage: ChatMessage | null;
  channels: ChatChannel[];
  dms: ChatChannel[];
  messages: Record<string, ChatMessage[]>; // channelId -> messages
  threadReplies: Record<string, ChatMessage[]>; // parentMessageId -> replies
  typingUsers: Record<string, { userId: string; name: string }[]>; // channelId -> typing
  unreadCounts: Record<string, number>;
  onlineUsers: string[]; // userIds
  presences: Record<string, PresenceInfo>; // userId -> presence
  projectMembers: ProjectMember[];
  
  openChat: () => void;
  closeChat: () => void;
  setChannels: (channels: ChatChannel[]) => void;
  setDMs: (dms: ChatChannel[]) => void;
  setActiveChannel: (channelId: string | null) => void;
  setActiveThread: (messageId: string | null, parentMessage?: ChatMessage | null) => void;
  setMessages: (channelId: string, messages: ChatMessage[]) => void;
  loadMoreMessages: (channelId: string, messages: ChatMessage[]) => void;
  setThreadReplies: (parentId: string, replies: ChatMessage[]) => void;
  addMessage: (channelId: string, message: ChatMessage) => void;
  editMessage: (channelId: string, messageId: string, content: string, htmlContent?: string | null) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  setTyping: (channelId: string, users: { userId: string; name: string }[]) => void;
  setUnread: (channelId: string, count: number) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  setOnlineUsers: (userIds: string[]) => void;
  updatePresence: (userId: string, isOnline: boolean, lastSeen?: string | Date) => void;
  setPresences: (presences: PresenceInfo[]) => void;
  setProjectMembers: (members: ProjectMember[]) => void;
  addReaction: (channelId: string, messageId: string, reaction: any) => void;
  removeReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  isOpen: false,
  activeChannelId: null,
  activeThreadId: null,
  activeParentMessage: null,
  channels: [],
  dms: [],
  messages: {},
  threadReplies: {},
  typingUsers: {},
  unreadCounts: {},
  onlineUsers: [],
  presences: {},
  projectMembers: [],

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  
  setChannels: (channels) => set({ channels }),
  setDMs: (dms) => set({ dms }),
  
  setActiveChannel: (channelId) => set({ 
    activeChannelId: channelId, 
    activeThreadId: null, 
    activeParentMessage: null 
  }),
  
  setActiveThread: (messageId, parentMessage = null) => set({ 
    activeThreadId: messageId,
    activeParentMessage: parentMessage 
  }),
  
  setMessages: (channelId, channelMessages) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: channelMessages
    }
  })),

  loadMoreMessages: (channelId, olderMessages) => set((state) => {
    const current = state.messages[channelId] || [];
    // De-duplicate
    const currentIds = new Set(current.map(m => m.id));
    const uniqueOlder = olderMessages.filter(m => !currentIds.has(m.id));
    return {
      messages: {
        ...state.messages,
        [channelId]: [...uniqueOlder, ...current]
      }
    };
  }),

  setThreadReplies: (parentId, replies) => set((state) => ({
    threadReplies: {
      ...state.threadReplies,
      [parentId]: replies
    }
  })),

  addMessage: (channelId, message) => set((state) => {
    // If it's a thread reply
    if (message.parentId) {
      const parentId = message.parentId;
      const currentReplies = state.threadReplies[parentId] || [];
      const updatedReplies = currentReplies.some(r => r.id === message.id)
        ? currentReplies
        : [...currentReplies, message];

      // Update parent message's reply count in the main messages feed
      const channelMsgs = state.messages[channelId] || [];
      const updatedChannelMsgs = channelMsgs.map((m) => {
        if (m.id === parentId) {
          return {
            ...m,
            _count: {
              ...m._count,
              replies: (m._count?.replies || 0) + 1
            }
          };
        }
        return m;
      });

      return {
        threadReplies: {
          ...state.threadReplies,
          [parentId]: updatedReplies
        },
        messages: {
          ...state.messages,
          [channelId]: updatedChannelMsgs
        }
      };
    }

    // Standard message
    const currentMsgs = state.messages[channelId] || [];
    if (currentMsgs.some((m) => m.id === message.id)) {
      return {}; // Duplicate, do nothing
    }

    return {
      messages: {
        ...state.messages,
        [channelId]: [...currentMsgs, message]
      }
    };
  }),

  editMessage: (channelId, messageId, content, htmlContent = null) => set((state) => {
    const editMsg = (msg: ChatMessage) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content,
          htmlContent,
          editedAt: new Date()
        };
      }
      return msg;
    };

    const updatedFeed = (state.messages[channelId] || []).map(editMsg);
    
    // Check if it's a reply in threadReplies cache
    const threadKeys = Object.keys(state.threadReplies);
    const updatedThreads = { ...state.threadReplies };
    threadKeys.forEach((key) => {
      updatedThreads[key] = updatedThreads[key].map(editMsg);
    });

    // Check parent message details too
    const updatedParent = state.activeParentMessage?.id === messageId
      ? { ...state.activeParentMessage, content, htmlContent, editedAt: new Date() }
      : state.activeParentMessage;

    return {
      messages: {
        ...state.messages,
        [channelId]: updatedFeed
      },
      threadReplies: updatedThreads,
      activeParentMessage: updatedParent
    };
  }),

  deleteMessage: (channelId, messageId) => set((state) => {
    const deleteMsg = (msg: ChatMessage) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          isDeleted: true,
          content: "This message was deleted",
          htmlContent: "<p><i>This message was deleted</i></p>"
        };
      }
      return msg;
    };

    const updatedFeed = (state.messages[channelId] || []).map(deleteMsg);

    const threadKeys = Object.keys(state.threadReplies);
    const updatedThreads = { ...state.threadReplies };
    threadKeys.forEach((key) => {
      updatedThreads[key] = updatedThreads[key].map(deleteMsg);
    });

    const updatedParent = state.activeParentMessage?.id === messageId
      ? { ...state.activeParentMessage, isDeleted: true, content: "This message was deleted", htmlContent: "<p><i>This message was deleted</i></p>" }
      : state.activeParentMessage;

    return {
      messages: {
        ...state.messages,
        [channelId]: updatedFeed
      },
      threadReplies: updatedThreads,
      activeParentMessage: updatedParent
    };
  }),

  setTyping: (channelId, users) => set((state) => ({
    typingUsers: {
      ...state.typingUsers,
      [channelId]: users
    }
  })),

  setUnread: (channelId, count) => set((state) => ({
    unreadCounts: {
      ...state.unreadCounts,
      [channelId]: count
    }
  })),

  incrementUnread: (channelId) => set((state) => ({
    unreadCounts: {
      ...state.unreadCounts,
      [channelId]: (state.unreadCounts[channelId] || 0) + 1
    }
  })),

  clearUnread: (channelId) => set((state) => ({
    unreadCounts: {
      ...state.unreadCounts,
      [channelId]: 0
    }
  })),

  setOnlineUsers: (userIds) => set({ onlineUsers: userIds }),

  updatePresence: (userId, isOnline, lastSeen) => set((state) => {
    const newPresences = { ...state.presences };
    newPresences[userId] = {
      userId,
      isOnline,
      lastSeen: lastSeen || new Date(),
    };

    const currentOnline = new Set(state.onlineUsers);
    if (isOnline) {
      currentOnline.add(userId);
    } else {
      currentOnline.delete(userId);
    }

    return {
      presences: newPresences,
      onlineUsers: Array.from(currentOnline)
    };
  }),

  setPresences: (presencesList) => set((state) => {
    const newPresences = { ...state.presences };
    const online = new Set<string>();

    presencesList.forEach((p) => {
      newPresences[p.userId] = p;
      if (p.isOnline) online.add(p.userId);
    });

    return {
      presences: newPresences,
      onlineUsers: Array.from(online)
    };
  }),

  setProjectMembers: (members) => set({ projectMembers: members }),

  addReaction: (channelId, messageId, reaction) => set((state) => {
    const appendReaction = (msg: ChatMessage) => {
      if (msg.id === messageId) {
        const reactions = msg.reactions || [];
        // Prevent duplicate reaction add
        const exists = reactions.some((r) => r.id === reaction.id);
        return {
          ...msg,
          reactions: exists ? reactions : [...reactions, reaction]
        };
      }
      return msg;
    };

    const updatedFeed = (state.messages[channelId] || []).map(appendReaction);

    const threadKeys = Object.keys(state.threadReplies);
    const updatedThreads = { ...state.threadReplies };
    threadKeys.forEach((key) => {
      updatedThreads[key] = updatedThreads[key].map(appendReaction);
    });

    const updatedParent = state.activeParentMessage?.id === messageId
      ? appendReaction(state.activeParentMessage)
      : state.activeParentMessage;

    return {
      messages: {
        ...state.messages,
        [channelId]: updatedFeed
      },
      threadReplies: updatedThreads,
      activeParentMessage: updatedParent
    };
  }),

  removeReaction: (channelId, messageId, emoji, userId) => set((state) => {
    const deleteReaction = (msg: ChatMessage) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          reactions: (msg.reactions || []).filter(
            (r) => !(r.emoji === emoji && r.userId === userId)
          )
        };
      }
      return msg;
    };

    const updatedFeed = (state.messages[channelId] || []).map(deleteReaction);

    const threadKeys = Object.keys(state.threadReplies);
    const updatedThreads = { ...state.threadReplies };
    threadKeys.forEach((key) => {
      updatedThreads[key] = updatedThreads[key].map(deleteReaction);
    });

    const updatedParent = state.activeParentMessage?.id === messageId
      ? deleteReaction(state.activeParentMessage)
      : state.activeParentMessage;

    return {
      messages: {
        ...state.messages,
        [channelId]: updatedFeed
      },
      threadReplies: updatedThreads,
      activeParentMessage: updatedParent
    };
  })
}));
