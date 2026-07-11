# Walkthrough: Real-Time Team Chat System

I have successfully built and integrated the complete real-time team chat system into the QA Engine web app.

## Changes Made

### 1. Database Schema
- Appended models `ChatChannel`, `ChannelMember`, `ChatMessage`, `Reaction`, `MessageMention`, `ChatAttachment`, and `Presence` to [schema.prisma](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/prisma/schema.prisma).
- Added relation fields back to existing `User` and `Project` models.
- Synced changes directly using `npx prisma db push` and successfully re-generated the Prisma Client.

### 2. Node Custom Server Setup
- Created [server.ts](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/server.ts) in the project root to mount Socket.io on Node's HTTP server alongside the Next.js request handler.
- Updated the `"dev"` script in [package.json](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/package.json) to start `server.ts` using `tsx`.

### 3. Socket Server & API Routes
- Created [socket-server.ts](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/lib/socket-server.ts) with Socket.io authorization middlewares and event handlers (`join-project`, `join-channel`, `send-message`, `edit-message`, `delete-message`, `add-reaction`, `remove-reaction`, `typing`, `disconnect`).
- Created socket initialization endpoints and standard REST endpoints for channels, messages, DMs, presence status, and chat uploads:
  - [/api/socket](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/socket/route.ts) & [/api/socket/init](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/socket/init/route.ts)
  - [/api/channels](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/route.ts) & [/api/channels/[id]](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/route.ts)
  - [/api/channels/[id]/join](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/join/route.ts) & [/api/channels/[id]/leave](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/leave/route.ts)
  - [/api/channels/[id]/members](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/members/route.ts) & [/api/channels/[id]/members/[userId]](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/members/[userId]/route.ts)
  - [/api/channels/[id]/messages](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/channels/[id]/messages/route.ts)
  - [/api/messages/[id]](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/messages/[id]/route.ts) & [/api/messages/[id]/replies](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/messages/[id]/replies/route.ts)
  - [/api/messages/[id]/reactions](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/messages/[id]/reactions/route.ts) & [/api/messages/[id]/reactions/[emoji]](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/messages/[id]/reactions/[emoji]/route.ts)
  - [/api/dm](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/dm/route.ts)
  - [/api/presence](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/presence/route.ts) & [/api/presence/heartbeat](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/presence/heartbeat/route.ts)
  - [/api/upload](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/upload/route.ts) (uploads files to `public/uploads/chat/`)
- Updated [/api/me](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/api/me/route.ts) to return the token to allow Client-side socket authentication.

### 4. Client State Store & Connection Hook
- Created Zustand store [chatStore.ts](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/stores/chatStore.ts) containing open states, active channels/threads, message caching, reactions, unreads, typing arrays, and online status lists.
- Created [useSocket.ts](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/hooks/useSocket.ts) hook that sets up socket connections, binds event listeners, clears unreads, sets typing users, and handles browser notifications for mentions and DMs.

### 5. UI Layout Components
- Built modern and premium Tailwind CSS styled components under `src/components/chat`:
  - [EmojiPicker.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/EmojiPicker.tsx): Dynamic Client-side Picker (using `emoji-picker-react` via Next dynamic imports) wrapping a Radix Popover.
  - [ChatInput.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ChatInput.tsx): TipTap rich text input with bold, italic, code-inline, `@mentions` overlay member filters, emoji support, 50MB attachments upload with previews, and 500ms typing throttles.
  - [ChatMessage.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ChatMessage.tsx): Text/System/File bubbles displaying avatars, timestamps, code snippets, thumbnails, reaction pills, thread reply tags, soft-delete states, and actions dropdown (copy link, reply, edit, delete).
  - [ChatMessageList.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ChatMessageList.tsx): Virtual list using `react-virtuoso` with custom date dividers, unread indicators, message sender groupings, and a "Jump to bottom" button.
  - [ChatSidebar.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ChatSidebar.tsx): Sidebar listing non-DM channels (with unread counters and a custom creation modal), direct messages (with presence indicators), and all other project members.
  - [ThreadPanel.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ThreadPanel.tsx): Nested right panel showing the thread parent and lists of replies.
  - [ChatContainer.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/components/chat/ChatContainer.tsx): Sliding panel container containing the sidebar, message feed, thread drawer, and a floating FAB when closed.
- Integrated the chat globally inside [layout.tsx](file:///Users/sabrymohsen/Desktop/AI-Manual-testing/src/app/(dashboard)/layout.tsx) using the project context and authenticated session.

## Verification

- **TypeScript Compilation**: Ran `npx tsc --noEmit` and confirmed it compiles cleanly with zero type errors.
- **Prisma Client Code Generation**: Verified Prisma model mapping and generated the client libraries.
- **REST Endpoints & Middlewares**: Validated request gating so that only members of the current project can read or modify channels and chat messages.
