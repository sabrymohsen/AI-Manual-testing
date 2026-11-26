"use client";

import React, { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useChatStore } from "@/stores/chatStore";
import { EmojiPicker } from "./EmojiPicker";
import { Paperclip, Send, Loader2, X, AtSign } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Attachment {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

interface Member {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

/** A project entity referenceable from chat with `#`. */
interface LinkableEntity {
  id: string;
  type: string;
  key: string;
  label: string;
  url: string;
  meta?: string | null;
}

const ENTITY_CHIP: Record<string, string> = {
  TASK: "bg-blue-50 text-blue-700 border-blue-200",
  SUBTASK: "bg-sky-50 text-sky-700 border-sky-200",
  BUG_REPORT: "bg-red-50 text-red-700 border-red-200",
  TEST_CASE: "bg-violet-50 text-violet-700 border-violet-200",
  BRD_DOCUMENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function ChatInput({
  projectId,
  channelId,
  parentId,
  socket,
  placeholder = "Message...",
}: {
  projectId: string;
  channelId: string;
  parentId?: string;
  socket: any; // SocketRef
  placeholder?: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  // `#` entity mentions (tasks, bugs, test cases, BRDs) run alongside `@` users.
  const [showEntities, setShowEntities] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [entityResults, setEntityResults] = useState<LinkableEntity[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  // Entities actually chosen from the picker, sent with the message so the
  // reference survives even if someone edits the text afterwards.
  const [pickedEntities, setPickedEntities] = useState<LinkableEntity[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        heading: false,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        // `prose` is a no-op here (no @tailwindcss/typography); composer-body carries the real styles.
        class: "composer-body min-h-[24px] max-h-[120px] overflow-y-auto outline-none py-1 pr-12 text-sm text-foreground dark:text-slate-200",
      },
      handleKeyDown: (view, event) => {
        // Send on Enter (unless Shift is pressed)
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // Trigger typing indicator (throttled 500ms)
      triggerTyping();

      // Check for mention trigger
      const text = editor.getText();
      const lastWord = text.split(/\s+/).pop() || "";
      if (lastWord.startsWith("@")) {
        setMentionQuery(lastWord.slice(1));
        setShowMentions(true);
        setShowEntities(false);
      } else if (lastWord.startsWith("#")) {
        setEntityQuery(lastWord.slice(1));
        setShowEntities(true);
        setShowMentions(false);
      } else {
        setShowMentions(false);
        setShowEntities(false);
      }
    },
    immediatelyRender: false,
  });

  // Debounced entity search while the `#` picker is open.
  useEffect(() => {
    if (!showEntities || !projectId) return;
    let cancelled = false;
    setEntityLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/linkables?q=${encodeURIComponent(entityQuery)}` +
            `&types=TASK,SUBTASK,BUG_REPORT,TEST_CASE,BRD_DOCUMENT&limit=12`
        );
        if (res.ok && !cancelled) {
          const d = await res.json();
          setEntityResults(d.results || []);
        }
      } catch {
        if (!cancelled) setEntityResults([]);
      } finally {
        if (!cancelled) setEntityLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [showEntities, entityQuery, projectId]);

  // Fetch project members for mentions
  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await fetch(`/api/projects/${projectId}/scrum/members`);
        if (res.ok) {
          const data = await res.json();
          setMembers(data.members || []);
        }
      } catch (err) {
        console.error("Failed to load members for mentions:", err);
      }
    }
    if (projectId) loadMembers();
  }, [projectId]);

  // Listen to mention insertion requests from chat bubbles
  useEffect(() => {
    const handleMentionInsert = (e: Event) => {
      const name = (e as CustomEvent).detail.name;
      if (editor) {
        editor.commands.insertContent(`@${name} `);
        editor.commands.focus();
      }
    };
    window.addEventListener("chat-mention-insert", handleMentionInsert);
    return () => {
      window.removeEventListener("chat-mention-insert", handleMentionInsert);
    };
  }, [editor]);

  const triggerTyping = () => {
    if (!socket.current) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.current.emit("typing", channelId);
    }, 500);
  };

  const handleEmojiSelect = (emoji: string) => {
    if (editor) {
      editor.commands.insertContent(emoji);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, data]);
      } else {
        alert("Upload failed. Limit is 50MB.");
      }
    } catch (err) {
      console.error("File upload error:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const insertMention = (member: Member) => {
    if (!editor) return;

    const text = editor.getText();
    const words = text.split(/\s+/);
    // Remove the partial mention text
    words.pop();
    
    const baseText = words.join(" ");
    const textToInsert = (baseText ? baseText + " " : "") + `@${member.name || member.email} `;
    
    editor.commands.setContent(textToInsert);
    editor.commands.focus();
    setShowMentions(false);
  };

  const insertEntity = (entity: LinkableEntity) => {
    if (!editor) return;
    const words = editor.getText().split(/\s+/);
    words.pop(); // drop the partial "#..." token
    const baseText = words.join(" ");
    editor.commands.setContent((baseText ? baseText + " " : "") + `#${entity.key} `);
    editor.commands.focus();
    setShowEntities(false);
    setPickedEntities((prev) =>
      prev.some((e) => e.id === entity.id && e.type === entity.type) ? prev : [...prev, entity]
    );
  };

  const handleSubmit = async () => {
    if (!editor) return;
    const content = editor.getText().trim();
    const htmlContent = editor.getHTML();

    if (!content && attachments.length === 0) return;

    // Detect mentions in the text
    const mentions: string[] = [];
    members.forEach((m) => {
      const mentionName = `@${m.name || m.email}`;
      if (content.includes(mentionName)) {
        mentions.push(m.id);
      }
    });

    // Only keep picked entities whose chip is still in the text.
    const entityMentions = pickedEntities.filter((e) => content.includes(`#${e.key}`));

    const payload = {
      channelId,
      content,
      htmlContent,
      parentId,
      mentions,
      entityMentions,
      attachments,
    };

    if (socket.current && socket.current.connected) {
      socket.current.emit("send-message", payload);
    } else {
      // REST API fallback
      try {
        await fetch(`/api/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("REST message send fallback failed:", err);
      }
    }

    editor.commands.clearContent();
    setAttachments([]);
    setPickedEntities([]);
  };

  // Filter members based on mention text query
  const filteredMembers = members.filter((m) => {
    const name = (m.name || m.email).toLowerCase();
    return name.includes(mentionQuery.toLowerCase());
  });

  return (
    <div className="relative border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      {/* Entity (#) picker — tasks, bugs, test cases, BRDs */}
      {showEntities && (
        <div className="absolute bottom-full left-3 z-50 mb-1 max-h-56 w-80 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
            Reference an item
          </p>
          {entityLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          )}
          {!entityLoading && entityResults.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching items.</p>
          )}
          {!entityLoading &&
            entityResults.map((e) => (
              <button
                key={`${e.type}:${e.id}`}
                onClick={() => insertEntity(e)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <span
                  className={cn(
                    "shrink-0 rounded border px-1 py-0.5 text-xs font-semibold",
                    ENTITY_CHIP[e.type] || "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {e.key}
                </span>
                <span className="truncate">{e.label}</span>
              </button>
            ))}
        </div>
      )}

      {/* Mentions dropdown overlay */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-3 z-50 mb-1 max-h-48 w-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              onClick={() => insertMention(member)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <div className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {(member.name || member.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="font-semibold truncate">{member.name || member.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Attachments previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="group relative flex items-center gap-2 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-[180px]"
            >
              <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate pr-4">{file.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted dark:hover:bg-slate-700 hover:text-muted-foreground dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor box */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 px-3 py-2">
        {/* Attachment triggers */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 transition-colors"
          title="Attach File"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Rich Text Editor */}
        <div className="flex-1 min-w-0 min-h-[24px]">
          <EditorContent editor={editor} placeholder={placeholder} />
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1 self-end">
          {/* Mentions trigger helper */}
          <button
            type="button"
            onClick={() => {
              if (editor) {
                editor.commands.insertContent("@");
                editor.commands.focus();
              }
            }}
            className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            title="Mention Member"
          >
            <AtSign className="h-5 w-5" />
          </button>

          {/* Emoji Trigger */}
          <EmojiPicker onEmojiSelect={handleEmojiSelect} />

          {/* Send Trigger */}
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-primary p-2 text-white hover:bg-primary/90 transition-colors shadow-sm"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
