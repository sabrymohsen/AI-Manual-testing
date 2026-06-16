"use client"

interface ComparisonResultProps {
  figmaImagePath: string
  actualImagePath: string
  diffImagePath: string | null
  mismatchPercent: number
  tolerancePercent: number
  viewportWidth: number
  viewportHeight: number
}

export function ComparisonResult({
  figmaImagePath,
  actualImagePath,
  diffImagePath,
  mismatchPercent,
  tolerancePercent,
  viewportWidth,
  viewportHeight,
}: ComparisonResultProps) {
  const passed = mismatchPercent <= tolerancePercent

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className={`text-sm px-3 py-1 rounded-full font-medium ${
          passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}>
          {passed ? "PASSED" : "FAILED"} — {mismatchPercent.toFixed(2)}% mismatch
          {!passed && ` (tolerance: ${tolerancePercent}%)`}
        </div>
        <p className="text-sm text-muted-foreground">
          Viewport: {viewportWidth}x{viewportHeight}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium mb-1">Figma Reference</p>
          <img
            src={`/api/files/${figmaImagePath}`}
            alt="Figma reference"
            className="w-full border rounded"
          />
        </div>
        <div>
          <p className="text-sm font-medium mb-1">Actual Screenshot</p>
          <img
            src={`/api/files/${actualImagePath}`}
            alt="Actual screenshot"
            className="w-full border rounded"
          />
        </div>
      </div>

      {diffImagePath && (
        <div>
          <p className="text-sm font-medium mb-1">Difference Overlay</p>
          <img
            src={`/api/files/${diffImagePath}`}
            alt="Difference overlay"
            className="w-full border rounded"
          />
        </div>
      )}
    </div>
  )
}
