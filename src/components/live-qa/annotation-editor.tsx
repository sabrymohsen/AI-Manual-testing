"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/**
 * Screenshot annotation editor (Live QA Session).
 *
 * Phase 1 rewrite on Konva/react-konva: annotations are Konva nodes (select /
 * drag / resize / rotate), with a 1%-precision instant zoom system, minimap,
 * keyboard shortcuts, collapsible toolbar and dark mode. The model stays in
 * image-space and export renders at natural resolution via an offscreen canvas,
 * so the onSave(pngDataUrl) contract is unchanged.
 *
 * Konva touches the DOM canvas, so the implementation is loaded client-only.
 */
const KonvaAnnotationEditor = dynamic(() => import("./annotation/konva-editor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 text-white/80">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs font-semibold">Loading editor…</span>
      </div>
    </div>
  ),
})

export interface AnnotationEditorProps {
  imageSrc: string
  onSave: (annotatedDataUrl: string) => void
  onCancel: () => void
  saving?: boolean
}

export function AnnotationEditor(props: AnnotationEditorProps) {
  return <KonvaAnnotationEditor {...props} />
}
