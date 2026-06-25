import { NextResponse } from "next/server"
import {
  isOllamaAvailable,
  getOllamaModels,
  isHuggingFaceAvailable,
} from "@/lib/ai/test-case-generator"

export async function GET() {
  try {
    const [ollamaAvailable, ollamaModels, hfAvailable] = await Promise.all([
      isOllamaAvailable(),
      getOllamaModels(),
      isHuggingFaceAvailable(),
    ])

    return NextResponse.json({
      ollama: {
        available: ollamaAvailable,
        models: ollamaModels,
        url: process.env.OLLAMA_URL || "http://localhost:11434",
      },
      huggingface: {
        available: hfAvailable,
        hasToken: !!process.env.HUGGINGFACE_API_TOKEN,
      },
      recommended: ollamaAvailable ? "ollama" : hfAvailable ? "huggingface" : null,
    })
  } catch (error: any) {
    console.error("GET /api/ai/status error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to check AI status" },
      { status: 500 }
    )
  }
}
