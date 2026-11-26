/**
 * Dark mode for the whole Tailwind palette.
 *
 * Most screens were written for a light page with classes like bg-white,
 * text-slate-900 or bg-emerald-50. Instead of adding a dark: variant to every
 * one of them, each palette class reads a CSS variable. In light mode the
 * variable is the stock Tailwind colour, so nothing changes. Under `.dark`
 * the variables are retuned per use:
 *   - backgrounds: light tints become dark tints, strong colours stay
 *   - text: dark text becomes light text, light text stays light
 *   - borders: light lines become dark lines
 * Neutral greys use the SKILL.md dark surfaces (#181818 #1F1F1F #272727 #313131).
 * Classes that already have a dark: variant keep working: dark shades stay
 * dark as backgrounds and light shades stay light as text.
 */
import defaultColors from "tailwindcss/colors"

const colors = defaultColors as unknown as Record<string, Record<string, string>>

const NEUTRALS = ["slate", "gray", "zinc", "neutral", "stone"]
const CHROMATIC = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]
const CARD = "#1f1f1f"

type Kind = "bg" | "tx" | "bd"

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const ch = (hex: string) => rgb(hex).join(" ")
/** Mix `amount` (0..1) of `hex` into the dark card colour. */
function mix(hex: string, amount: number): string {
  const a = rgb(hex)
  const b = rgb(CARD)
  return a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount))).join(" ")
}

const NEUTRAL_DARK: Record<Kind, string[]> = {
  //      50        100       200       300       400       500       600       700       800       900       950
  bg: ["#232323", "#2a2a2a", "#313131", "#3b3b3b", "#4a4a4a", "#5a5a5a", "#474747", "#3a3a3a", "#272727", "#1a1a1a", "#131313"],
  tx: ["#fafafa", "#f0f0f0", "#e0e0e0", "#c4c4c4", "#7d7d7d", "#9b9b9b", "#b0b0b0", "#cfcfcf", "#e5e5e5", "#f5f5f5", "#fafafa"],
  bd: ["#262626", "#2a2a2a", "#313131", "#3b3b3b", "#4f4f4f", "#666666", "#555555", "#3b3b3b", "#313131", "#262626", "#1f1f1f"],
}

function chromaticDark(name: string, kind: Kind, i: number): string {
  const p = colors[name] as Record<string, string>
  if (kind === "bg") {
    const amount = [0.1, 0.16, 0.24, 0.6][i]
    return amount === undefined ? ch(p[SHADES[i]]) : mix(p[SHADES[i]], amount)
  }
  if (kind === "bd") {
    const amount = [0.14, 0.2, 0.3, 0.45, 0.7][i]
    return amount === undefined ? ch(p[SHADES[i]]) : mix(p[SHADES[i]], amount)
  }
  // text: 500 and darker become their light counterpart
  const map: Record<string, string> = { "500": "400", "600": "400", "700": "300", "800": "200", "900": "200", "950": "100" }
  return ch(p[map[SHADES[i]] ?? SHADES[i]])
}

const root: Record<string, string> = {}
const dark: Record<string, string> = { "color-scheme": "dark" }
for (const name of [...NEUTRALS, ...CHROMATIC]) {
  SHADES.forEach((s, i) => {
    root[`--c-${name}-${s}`] = ch(colors[name][s])
    for (const kind of ["bg", "tx", "bd"] as Kind[]) {
      dark[`--${kind}-${name}-${s}`] = NEUTRALS.includes(name) ? ch(NEUTRAL_DARK[kind][i]) : chromaticDark(name, kind, i)
    }
  })
}
root["--c-white"] = "255 255 255"
root["--c-black"] = "0 0 0"
dark["--bg-white"] = ch(CARD)
dark["--bd-white"] = ch(CARD)
dark["--tx-black"] = ch("#fafafa")

// `.paper` keeps a light page inside dark mode (BRD documents carry their own
// text colours, so they read like a printed page). `initial` drops back to
// the stock colour.
const paper: Record<string, string> = { "color-scheme": "light" }
for (const k of Object.keys(dark)) if (k.startsWith("--")) paper[k] = "initial"

export const themeColorVars = { ":root": root, ".dark": dark, ".dark .paper": paper }

function scale(kind: Kind) {
  const v = (name: string) => `rgb(var(--${kind}-${name}, var(--c-${name})) / <alpha-value>)`
  const out: Record<string, string | Record<string, string>> = { white: v("white"), black: v("black") }
  for (const name of [...NEUTRALS, ...CHROMATIC]) {
    out[name] = Object.fromEntries(SHADES.map((s) => [s, v(`${name}-${s}`)]))
  }
  return out
}

const bg = scale("bg")
const tx = scale("tx")
const bd = scale("bd")

export const themeColorConfig = {
  backgroundColor: bg,
  gradientColorStops: bg,
  ringOffsetColor: bg,
  textColor: tx,
  placeholderColor: tx,
  fill: tx,
  caretColor: tx,
  accentColor: tx,
  textDecorationColor: tx,
  borderColor: bd,
  divideColor: bd,
  ringColor: bd,
  outlineColor: bd,
  stroke: bd,
}
