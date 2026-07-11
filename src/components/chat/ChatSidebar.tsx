"use client";

import React, { useState } from "react";
import { ChatChannel, useChatStore } from "@/stores/chatStore";
import { Plus, Hash, Lock, Circle, ChevronDown, ChevronRight, MessageSquare, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role?: string;
}

export function ChatSidebar({
  projectId,
  projectMembers,
  currentUserId,
}: {
  projectId: string;
  projectMembers: Member[];
  currentUserId: string;
}) {
  const {
    channels,
    dms,
    activeChannelId,
    setActiveChannel,
    unreadCounts,
    onlineUsers,
    setChannels,
    setDMs
  } = useChatStore();

  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [dmsCollapsed, setDMsCollapsed] = useState(false);
  const [membersCollapsed, setMembersCollapsed] = useState(false);

  // Channel Creation Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelType, setNewChannelType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName,
          description: newChannelDesc,
          type: newChannelType,
          projectId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Add to channels in store and set active
        const newChan: ChatChannel = data.channel;
        setChannels([...channels, newChan]);
        setActiveChannel(newChan.id);
        
        // Reset and close
        setNewChannelName("");
        setNewChannelDesc("");
        setNewChannelType("PUBLIC");
        setIsCreateOpen(false);
      } else {
        setErrorMsg(data.error || "Failed to create channel");
      }
    } catch (err) {
      setErrorMsg("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDM = async (targetUserId: string) => {
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, projectId }),
      });

      if (res.ok) {
        const data = await res.json();
        const dmChan: ChatChannel = data.dm;
        
        // Add to DMs list if not present
        if (!dms.some((d) => d.id === dmChan.id)) {
          setDMs([dmChan, ...dms]);
        }
        
        setActiveChannel(dmChan.id);
      }
    } catch (err) {
      console.error("Failed to start DM:", err);
    }
  };

  // Helper: check if a user is online
  const isUserOnline = (userId: string) => onlineUsers.includes(userId);

  return (
    <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col h-full select-none">
      {/* Header */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 justify-between bg-white dark:bg-slate-900">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4 text-indigo-500" />
          <span>Team Channels</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-4">
        {/* CHANNELS SECTION */}
        <div>
          <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            <button
              onClick={() => setChannelsCollapsed(!channelsCollapsed)}
              className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {channelsCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>Channels</span>
            </button>

            {/* Create Channel Trigger */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <button className="hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleCreateChannel}>
                  <DialogHeader>
                    <DialogTitle>Create Channel</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Channel Name</Label>
                      <Input
                        id="name"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        placeholder="e.g. general, bug-reports"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="desc">Description (Optional)</Label>
                      <Textarea
                        id="desc"
                        value={newChannelDesc}
                        onChange={(e) => setNewChannelDesc(e.target.value)}
                        placeholder="What is this channel about?"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Privacy Type</Label>
                      <div className="flex gap-4 mt-1">
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="radio"
                            name="privacy"
                            value="PUBLIC"
                            checked={newChannelType === "PUBLIC"}
                            onChange={() => setNewChannelType("PUBLIC")}
                            className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Public</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="radio"
                            name="privacy"
                            value="PRIVATE"
                            checked={newChannelType === "PRIVATE"}
                            onChange={() => setNewChannelType("PRIVATE")}
                            className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Private</span>
                        </label>
                      </div>
                    </div>
                    {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-indigo-600 text-white" disabled={isSubmitting}>
                      {isSubmitting ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {!channelsCollapsed && (
            <div className="flex flex-col gap-0.5">
              {channels.map((ch) => {
                const isActive = activeChannelId === ch.id;
                const unread = unreadCounts[ch.id] || 0;

                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch.id)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left group",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-semibold"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {ch.type === "PRIVATE" ? (
                        <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="truncate">{ch.name}</span>
                    </div>

                    {unread > 0 && (
                      <span className="bg-indigo-600 text-white text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })}
              {channels.length === 0 && (
                <span className="text-[11px] text-slate-400 italic px-2">No channels created</span>
              )}
            </div>
          )}
        </div>

        {/* DIRECT MESSAGES SECTION */}
        <div>
          <button
            onClick={() => setDMsCollapsed(!dmsCollapsed)}
            className="flex items-center gap-1 px-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {dmsCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            <span>Direct Messages</span>
          </button>

          {!dmsCollapsed && (
            <div className="flex flex-col gap-0.5">
              {dms.map((dm) => {
                const isActive = activeChannelId === dm.id;
                const unread = unreadCounts[dm.id] || 0;
                const memberInfo = dm.otherMember;
                const online = memberInfo ? isUserOnline(memberInfo.id) : false;

                if (!memberInfo) return null;

                return (
                  <button
                    key={dm.id}
                    onClick={() => setActiveChannel(dm.id)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-semibold"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative">
                        <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                          {(memberInfo.name || memberInfo.email).slice(0, 2)}
                        </div>
                        <Circle
                          className={cn(
                            "h-2 w-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-white dark:border-slate-950",
                            online ? "fill-emerald-500 text-emerald-500" : "fill-slate-400 text-slate-400"
                          )}
                        />
                      </div>
                      <span className="truncate">{memberInfo.name || memberInfo.email}</span>
                    </div>

                    {unread > 0 && (
                      <span className="bg-indigo-600 text-white text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })}
              {dms.length === 0 && (
                <span className="text-[11px] text-slate-400 italic px-2">No active conversations</span>
              )}
            </div>
          )}
        </div>

        {/* PROJECT MEMBERS LIST */}
        <div>
          <button
            onClick={() => setMembersCollapsed(!membersCollapsed)}
            className="flex items-center gap-1 px-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {membersCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            <Users className="h-3.5 w-3.5 text-slate-450" />
            <span>Project Members</span>
          </button>

          {!membersCollapsed && (
            <div className="flex flex-col gap-0.5">
              {projectMembers
                .filter((member) => member.id !== currentUserId)
                .map((member) => {
                  const online = isUserOnline(member.id);

                  return (
                    <button
                      key={member.id}
                      onClick={() => handleStartDM(member.id)}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-200/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200 transition-colors w-full text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-slate-700 dark:text-slate-350">
                          {(member.name || member.email).slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate">{member.name || member.email}</span>
                      </div>

                      <Circle
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300 dark:fill-slate-800 dark:text-slate-850"
                        )}
                      />
                    </button>
                  );
                })}
              {projectMembers.length <= 1 && (
                <span className="text-[11px] text-slate-400 italic px-2">No other members in project</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
