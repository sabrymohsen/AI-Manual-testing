"use client"

interface ScreenshotViewerProps {
  label: string
  imagePath: string | null
}

export function ScreenshotViewer({ label, imagePath }: ScreenshotViewerProps) {
  if (!imagePath) return null

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}:</p>
      <img
        src={`/api/files/${imagePath}`}
        alt={label}
        className="max-w-full border rounded"
      />
    </div>
  )
}
