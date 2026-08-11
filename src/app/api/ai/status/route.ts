import { NextResponse } from "next/server"
import {
  isOllamaAvailable,
  getOllamaModels,
  isHuggingFaceAvailable,
} from "@/lib/ai/test-case-generator"
import { resolveProvider } from "@/lib/ai/provider-chat"

export async function GET() {
  try {
    const [ollamaAvailable, ollamaModels, hfAvailable, configured] = await Promise.all([
      isOllamaAvailable(),
      getOllamaModels(),
      isHuggingFaceAvailable(),
      resolveProvider(),
    ])

    return NextResponse.json({
      // The hub-configured provider (Kimi/OpenAI/Anthropic/…) is what the
      // generators try first, so it decides whether AI generation is real or
      // falls back to the offline templates. Reported without the key.
      provider: configured
        ? { available: true, name: configured.provider, model: configured.model }
        : { available: false, name: null, model: null },
      ollama: {
        available: ollamaAvailable,
        models: ollamaModels,
        url: process.env.OLLAMA_URL || "http://localhost:11434",
      },
      huggingface: {
        available: hfAvailable,
        hasToken: !!process.env.HUGGINGFACE_API_TOKEN,
      },
      recommended: configured
        ? configured.provider
        : ollamaAvailable
          ? "ollama"
          : hfAvailable
            ? "huggingface"
            : null,
    })
  } catch (error: any) {
    console.error("GET /api/ai/status error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to check AI status" },
      { status: 500 }
    )
  }
}
