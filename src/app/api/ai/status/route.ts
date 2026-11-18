import { NextResponse } from "next/server"
import { isHuggingFaceAvailable } from "@/lib/ai/test-case-generator"
import { resolveProvider } from "@/lib/ai/provider-chat"
import { probeOllama } from "@/lib/hub-ai-providers"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    // The workspace Ollama card's address, else OLLAMA_URL / localhost.
    const saved = await prisma.aiProviderConfig
      .findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } })
      .catch(() => null)
    const [ollama, hfAvailable, configured] = await Promise.all([
      probeOllama(saved?.baseUrl),
      isHuggingFaceAvailable(),
      resolveProvider(),
    ])
    const ollamaAvailable = ollama.reachable

    return NextResponse.json({
      // The hub-configured provider (Kimi/OpenAI/Anthropic/…) is what the
      // generators try first, so it decides whether AI generation is real or
      // falls back to the offline templates. Reported without the key.
      provider: configured
        ? { available: true, name: configured.provider, model: configured.model }
        : { available: false, name: null, model: null },
      ollama: {
        available: ollamaAvailable,
        models: ollama.models,
        url: ollama.baseUrl,
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
