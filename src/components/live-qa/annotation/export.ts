// Export engine — renders annotations onto the original image via an OFFSCREEN
// canvas at natural resolution (independent of display zoom), then applies the
// optional crop. Phase 1 outputs PNG (the onSave contract). Later phases add
// JPG/PDF/JSON on top of this same renderer.
import { Annotation, CropRect, stickerByKey } from "./types"

function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, img: HTMLImageElement) {
  ctx.save()
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  ctx.lineWidth = a.strokeWidth
  ctx.lineJoin = "round"
  ctx.lineCap = "round"

  // Apply rotation about the annotation's center for box types.
  const cx = a.x + a.width / 2
  const cy = a.y + a.height / 2
  const rot = ((a.rotation || 0) * Math.PI) / 180
  const withRotation = (fn: () => void) => {
    if (rot) {
      ctx.translate(cx, cy)
      ctx.rotate(rot)
      ctx.translate(-cx, -cy)
    }
    fn()
  }

  if (a.type === "rect") {
    withRotation(() => ctx.strokeRect(a.x, a.y, a.width, a.height))
  } else if (a.type === "highlight") {
    withRotation(() => {
      ctx.globalAlpha = 0.25
      ctx.fillRect(a.x, a.y, a.width, a.height)
      ctx.globalAlpha = 1
      ctx.lineWidth = Math.max(1.5, a.strokeWidth / 2)
      ctx.strokeRect(a.x, a.y, a.width, a.height)
    })
  } else if (a.type === "ellipse") {
    withRotation(() => {
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.abs(a.width / 2), Math.abs(a.height / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    })
  } else if (a.type === "arrow") {
    const [x1, y1, x2, y2] = a.points || [a.x, a.y, a.x + a.width, a.y + a.height]
    const head = Math.max(12, a.strokeWidth * 3.5)
    const angle = Math.atan2(y2 - y1, x2 - x1)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  } else if (a.type === "text") {
    const fontSize = a.fontSize || 26
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    const padX = fontSize * 0.45
    const padY = fontSize * 0.3
    const w = ctx.measureText(a.text || "").width + padX * 2
    const h = fontSize + padY * 2
    withRotation(() => {
      ctx.beginPath()
      ctx.roundRect(a.x, a.y, w, h, 6)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.textBaseline = "top"
      ctx.fillText(a.text || "", a.x + padX, a.y + padY)
    })
  } else if (a.type === "blur") {
    if (a.width > 2 && a.height > 2) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(a.x, a.y, a.width, a.height)
      ctx.clip()
      ctx.filter = "blur(14px)"
      ctx.drawImage(img, 0, 0)
      ctx.restore()
    }
  } else if (a.type === "line") {
    const [x1, y1, x2, y2] = a.points || [a.x, a.y, a.x + a.width, a.y + a.height]
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  } else if (a.type === "freehand") {
    const p = a.points || []
    if (p.length >= 4) {
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
      ctx.stroke()
    }
  } else if (a.type === "pixelate") {
    if (a.width > 2 && a.height > 2) {
      // Downscale the region then draw it back up with smoothing off → blocks.
      const block = Math.max(6, a.strokeWidth * 2)
      const smallW = Math.max(1, Math.round(a.width / block))
      const smallH = Math.max(1, Math.round(a.height / block))
      const tmp = document.createElement("canvas")
      tmp.width = smallW
      tmp.height = smallH
      const tctx = tmp.getContext("2d")
      if (tctx) {
        tctx.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, smallW, smallH)
        ctx.save()
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tmp, 0, 0, smallW, smallH, a.x, a.y, a.width, a.height)
        ctx.restore()
      }
    }
  } else if (a.type === "spotlight") {
    // Darken everything except the box.
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    ctx.save()
    ctx.fillStyle = "rgba(0,0,0,0.55)"
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.rect(a.x, a.y, a.width, a.height)
    ctx.fill("evenodd")
    ctx.restore()
  } else if (a.type === "measure") {
    ctx.strokeRect(a.x, a.y, a.width, a.height)
    const label = `${Math.round(a.width)} × ${Math.round(a.height)} px`
    const fs = Math.max(14, a.strokeWidth * 4 + 10)
    ctx.font = `bold ${fs}px Inter, system-ui, sans-serif`
    const tw = ctx.measureText(label).width
    const lx = a.x
    const ly = a.y - fs * 1.5 < 0 ? a.y + 4 : a.y - fs * 1.5
    ctx.fillStyle = a.color
    ctx.beginPath()
    ctx.roundRect(lx, ly, tw + fs * 0.8, fs * 1.3, 4)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "middle"
    ctx.fillText(label, lx + fs * 0.4, ly + fs * 0.65)
  } else if (a.type === "number") {
    const r = 16 + a.strokeWidth * 2
    ctx.beginPath()
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.font = `bold ${r}px Inter, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(String(a.badge ?? 1), a.x, a.y + 1)
    ctx.textAlign = "left"
  } else if (a.type === "sticker") {
    const def = stickerByKey(a.sticker)
    const fs = a.fontSize || 30
    if (def.kind === "emoji") {
      ctx.font = `${fs * 1.6}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
      ctx.textBaseline = "top"
      ctx.fillText(def.label, a.x, a.y)
    } else {
      ctx.font = `bold ${fs}px Inter, system-ui, sans-serif`
      const padX = fs * 0.5
      const tw = ctx.measureText(def.label).width
      const boxH = fs * 1.5
      ctx.fillStyle = def.color || a.color
      ctx.beginPath()
      ctx.roundRect(a.x, a.y, tw + padX * 2, boxH, boxH / 2)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.textBaseline = "middle"
      ctx.fillText(def.label, a.x + padX, a.y + boxH / 2 + 1)
    }
  }
  ctx.restore()
}

export interface RenderOptions {
  crop?: CropRect | null
  mimeType?: "image/png" | "image/jpeg"
  quality?: number
}

/** Render image + annotations to a data URL at natural resolution. */
export function renderToDataUrl(
  img: HTMLImageElement,
  annotations: Annotation[],
  opts: RenderOptions = {}
): string {
  const full = document.createElement("canvas")
  full.width = img.naturalWidth
  full.height = img.naturalHeight
  const ctx = full.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(img, 0, 0)
  for (const a of annotations) drawAnnotation(ctx, a, img)

  const mime = opts.mimeType || "image/png"
  const crop = opts.crop
  if (crop && crop.width > 10 && crop.height > 10) {
    const c = document.createElement("canvas")
    c.width = Math.round(crop.width)
    c.height = Math.round(crop.height)
    const cctx = c.getContext("2d")
    if (!cctx) return ""
    // JPEG has no alpha — white-fill so cropped transparent edges aren't black.
    if (mime === "image/jpeg") {
      cctx.fillStyle = "#ffffff"
      cctx.fillRect(0, 0, c.width, c.height)
    }
    cctx.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    return c.toDataURL(mime, opts.quality)
  }
  return full.toDataURL(mime, opts.quality)
}

// Convert a data URL to a Blob (for clipboard / uploads).
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",")
  const mime = head.match(/:(.*?);/)?.[1] || "image/png"
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// Trigger a client-side download of a data URL / string.
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Export the editable annotation model + metadata as JSON (re-importable later).
export function exportJson(annotations: Annotation[], metadata: unknown, crop: CropRect | null): string {
  const payload = { version: 1, exportedAt: new Date().toISOString(), metadata, crop, annotations }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  return URL.createObjectURL(blob)
}

// Build a one-page PDF report: annotated image + metadata + annotation summary.
export async function exportPdf(
  img: HTMLImageElement,
  annotations: Annotation[],
  crop: CropRect | null,
  metadata: {
    title?: string
    description?: string
    tags?: string[]
    url?: string
    severity?: string | null
    capturedAt?: string
    os?: string
    browser?: string
    dimensions?: string
  }
): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const pngUrl = renderToDataUrl(img, annotations, { crop })
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = margin

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(metadata.title || "Screenshot Report", margin, y)
  y += 20

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(110)
  const meta: string[] = []
  if (metadata.severity) meta.push(`Severity: ${metadata.severity}`)
  if (metadata.url) meta.push(`URL: ${metadata.url}`)
  if (metadata.capturedAt) meta.push(`Captured: ${metadata.capturedAt}`)
  if (metadata.os || metadata.browser) meta.push(`Env: ${metadata.browser || "?"} on ${metadata.os || "?"}`)
  if (metadata.dimensions) meta.push(`Size: ${metadata.dimensions}`)
  if (metadata.tags?.length) meta.push(`Tags: ${metadata.tags.join(", ")}`)
  for (const line of meta) {
    doc.text(doc.splitTextToSize(line, pageW - margin * 2), margin, y)
    y += 13
  }
  y += 6

  if (metadata.description?.trim()) {
    doc.setTextColor(30)
    doc.setFontSize(9)
    const desc = doc.splitTextToSize(metadata.description, pageW - margin * 2)
    doc.text(desc, margin, y)
    y += desc.length * 12 + 8
  }

  // Fit the image into the remaining width.
  const cropped = crop && crop.width > 10
  const imgW = cropped ? crop!.width : img.naturalWidth
  const imgH = cropped ? crop!.height : img.naturalHeight
  const maxW = pageW - margin * 2
  const drawW = Math.min(maxW, imgW)
  const drawH = (imgH / imgW) * drawW
  doc.addImage(pngUrl, "PNG", margin, y, drawW, drawH)
  y += drawH + 16

  doc.setTextColor(110)
  doc.setFontSize(8)
  doc.text(`${annotations.length} annotation(s)`, margin, y)

  return doc.output("blob")
}
