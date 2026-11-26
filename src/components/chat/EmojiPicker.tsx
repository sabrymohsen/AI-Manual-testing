"use client";

import dynamic from "next/dynamic";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "@/components/ui/icons";

// Dynamically import to prevent SSR compilation errors from external dependency
const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

export function EmojiPicker({ onEmojiSelect }: { onEmojiSelect: (emoji: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Add an emoji"
          aria-label="Add an emoji"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none" align="end">
        <Picker
          onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
          lazyLoadEmojis={true}
          skinTonesDisabled={true}
          theme={"auto" as any}
        />
      </PopoverContent>
    </Popover>
  );
}
