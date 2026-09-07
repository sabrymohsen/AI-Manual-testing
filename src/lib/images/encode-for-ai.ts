/**
 * Prepare a screenshot for an AI provider.
 *
 * The picture travels to the provider inlined in the request body as base64, so
 * a full-resolution Retina screenshot (3-8 MB, ~4-11 MB once encoded) is
 * uploaded from the server inside the very same budget that has to cover
 * generation. On a deployed box that upload is what pushed bug drafts past
 * their timeout and sent them back as rule-based templates.
 *
 * Only what we SEND is shrunk here. The file the tester attached is stored as
 * evidence untouched, at full resolution.
 */

export interface AiImagePayload {
  /** Raw base64, no data: prefix — what the API route expects. */
  base64: string
  mimeType: string
}

/** Longest edge, in pixels, of a picture sent to a model. */
export const AI_IMAGE_MAX_DIM = 1600
/**
 * JPEG quality. Deliberately higher than a photo would need: a bug screenshot
 * is read for its error text, and that is exactly what ringing artifacts eat.
 */
export const AI_IMAGE_QUALITY = 0.85
/**
 * Below this, an already-small picture is sent as-is rather than re-encoded.
 * Re-compressing a crisp 200 KB PNG of a dialog into lossy JPEG costs legible
 * text and saves nothing worth having.
 */
export const AI_IMAGE_SKIP_BELOW_BYTES = 512 * 1024

/** Scale a WxH box down to fit maxDim on its longest edge, preserving aspect. */
export function fitWithin(
  width: number,
  height: number,
  maxDim: number = AI_IMAGE_MAX_DIM
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest <= 0) return { width, height }
  if (longest <= maxDim) return { width, height }
  const scale = maxDim / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Read a File as raw base64 (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "")
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale + re-encode when it helps, otherwise hand back the original bytes.
 *
 * Every failure path falls back to the untouched file: a draft that goes up
 * fat is far better than one that does not go up at all.
 */
export async function encodeImageForAi(
  file: File,
  maxDim: number = AI_IMAGE_MAX_DIM
): Promise<AiImagePayload> {
  const original = async (): Promise<AiImagePayload> => ({
    base64: await fileToBase64(file),
    mimeType: file.type || "image/png",
  })

  // SVG has no useful pixel size to fit, and anything non-image is not ours to
  // re-encode.
  if (!file.type?.startsWith("image/") || file.type === "image/svg+xml") {
    return original()
  }
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return original()
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const target = fitWithin(bitmap.width, bitmap.height, maxDim)
    const unchanged = target.width === bitmap.width && target.height === bitmap.height
    if (unchanged && file.size <= AI_IMAGE_SKIP_BELOW_BYTES) return original()

    const canvas = document.createElement("canvas")
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return original()

    // JPEG carries no alpha, so a transparent PNG would come out on black.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const base64 = canvas.toDataURL("image/jpeg", AI_IMAGE_QUALITY).split(",")[1] || ""
    if (!base64) return original()
    return { base64, mimeType: "image/jpeg" }
  } catch {
    return original()
  } finally {
    bitmap?.close?.()
  }
}
