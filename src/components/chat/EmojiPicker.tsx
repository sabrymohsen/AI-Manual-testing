"use client";

import dynamic from "next/dynamic";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";

// Dynamically import to prevent SSR compilation errors from external dependency
const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

export function EmojiPicker({ onEmojiSelect }: { onEmojiSelect: (emoji: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Add Emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none" align="end">
        <Picker
          onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
          lazyLoadEmojis={true}
          skinTonesDisabled={true}
        />
      </PopoverContent>
    </Popover>
  );
}
