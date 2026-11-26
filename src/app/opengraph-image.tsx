import { ImageResponse } from "next/og"

/** Social sharing image for the website (SKILL.md B10). */
export const alt = "QA Engine: from the requirements document to a tested, tracked release"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: 80,
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#5e6ad2", display: "flex" }} />
          QA Engine
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1.05,
            maxWidth: 900,
            backgroundImage: "linear-gradient(90deg, #ffffff, #9b9b9b)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          From the requirements document to a tested, tracked release
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#9b9b9b" }}>Test cases and bugs from your BRD, in Arabic and English</div>
      </div>
    ),
    size,
  )
}
