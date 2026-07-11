// Common :shortcode: -> unicode emoji mapping used by the chat input.
const SHORTCODES: Record<string, string> = {
  smile: "😄",
  grin: "😁",
  joy: "😂",
  rofl: "🤣",
  slight_smile: "🙂",
  wink: "😉",
  blush: "😊",
  heart_eyes: "😍",
  thinking: "🤔",
  neutral: "😐",
  sweat_smile: "😅",
  cry: "😢",
  sob: "😭",
  angry: "😠",
  scream: "😱",
  sunglasses: "😎",
  thumbsup: "👍",
  "+1": "👍",
  thumbsdown: "👎",
  "-1": "👎",
  clap: "👏",
  wave: "👋",
  pray: "🙏",
  muscle: "💪",
  ok_hand: "👌",
  point_up: "☝️",
  eyes: "👀",
  heart: "❤️",
  broken_heart: "💔",
  fire: "🔥",
  star: "⭐",
  sparkles: "✨",
  tada: "🎉",
  rocket: "🚀",
  check: "✅",
  white_check_mark: "✅",
  x: "❌",
  warning: "⚠️",
  bug: "🐛",
  bulb: "💡",
  zap: "⚡",
  coffee: "☕",
  pizza: "🍕",
  "100": "💯",
  question: "❓",
  exclamation: "❗",
  wrench: "🔧",
  hammer: "🔨",
  lock: "🔒",
  key: "🔑",
  memo: "📝",
  calendar: "📅",
  chart: "📊",
  laughing: "😆",
};

// Replace :shortcode: tokens with their emoji. Unknown shortcodes are left as-is.
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+\-]+):/gi, (match, code) => {
    return SHORTCODES[code.toLowerCase()] || match;
  });
}

// Quick-reaction emojis shown in the message hover picker.
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "😢", "🔥", "✅"];
