/**
 * Per-project AI provider config.
 *
 * A project can bring its own provider + key + model; anything without one
 * falls back to the workspace-wide AiProviderConfig and then to the provider's
 * key env var. The key is encrypted at rest with the same AES-256-GCM helper
 * the tracker integrations use.
 */
import { prisma } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/crypto"
import { PROVIDER_CATALOG, defaultOllamaModel, type AiProvider } from "@/lib/hub-ai-providers"

export interface ProjectAiSettings {
  provider: AiProvider
  enabled: boolean
  model: string
  /** Whether a key is stored on the project itself (vs inherited). */
  hasKey: boolean
  /**
   * A key IS stored but can no longer be decrypted — APP_ENCRYPTION_KEY is not
   * the one it was saved with.
   *
   * This is the difference between "this project has no AI key" and "this
   * project's AI key became unreadable", and it is the whole reason the key
   * seemed to vanish on every deploy: the row survived, the secret inside it
   * did not, and the app quietly reported the project as unconfigured. Saying
   * so lets the UI name the real fix (pin APP_ENCRYPTION_KEY on the host)
   * instead of inviting someone to paste the key in again every time.
   */
  keyUnreadable: boolean
  /** Ollama only: this project's Ollama server URL ("" = workspace / server default). */
  baseUrl: string
}

/** Can the stored key still be read with the key this server holds? */
function canDecrypt(row: {
  apiKeyEncrypted: string
  apiKeyIv: string
  apiKeyAuthTag: string
  apiKeyKeyVersion: string
}): boolean {
  if (!row.apiKeyEncrypted) return false
  try {
    decryptSecret({
      encrypted: row.apiKeyEncrypted,
      iv: row.apiKeyIv,
      authTag: row.apiKeyAuthTag,
      keyVersion: row.apiKeyKeyVersion,
    })
    return true
  } catch {
    return false
  }
}

export interface ProjectAiCredentials {
  provider: AiProvider
  model: string
  apiKey: string
  /** Ollama only. */
  ollamaUrl?: string
}

/** Settings for the project's AI tab. Never returns the key itself. */
export async function getProjectAiSettings(projectId: string): Promise<ProjectAiSettings | null> {
  const row = await prisma.projectAiConfig.findUnique({ where: { projectId } })
  if (!row) return null
  return {
    provider: row.provider as AiProvider,
    enabled: row.enabled,
    model: row.model,
    hasKey: !!row.apiKeyEncrypted,
    keyUnreadable: !!row.apiKeyEncrypted && !canDecrypt(row),
    baseUrl: row.baseUrl,
  }
}

/**
 * The project's own provider credentials, or null when the project has none,
 * is disabled, or its key can't be decrypted (a rotated APP_ENCRYPTION_KEY).
 * Callers fall back to the workspace config.
 */
export async function getProjectAiCredentials(
  projectId: string
): Promise<ProjectAiCredentials | null> {
  const row = await prisma.projectAiConfig.findUnique({ where: { projectId } })
  if (!row || !row.enabled) return null

  const meta = PROVIDER_CATALOG[row.provider as AiProvider]
  if (!meta) return null

  let apiKey = ""
  if (row.apiKeyEncrypted) {
    try {
      apiKey = decryptSecret({
        encrypted: row.apiKeyEncrypted,
        iv: row.apiKeyIv,
        authTag: row.apiKeyAuthTag,
        keyVersion: row.apiKeyKeyVersion,
      })
    } catch {
      // Undecryptable key — treat the project as unconfigured rather than
      // failing every AI call with a crypto error.
      return null
    }
  }

  // A project row with no key of its own can still pin the provider/model and
  // borrow the environment key.
  if (!apiKey && !meta.local) {
    apiKey = (meta.keyEnv ? process.env[meta.keyEnv] : "") || ""
    if (!apiKey) return null
  }

  if (row.provider === "Ollama") {
    // Project URL, else the workspace Ollama card's URL, else OLLAMA_URL.
    const workspace = await prisma.aiProviderConfig
      .findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } })
      .catch(() => null)
    const ollamaUrl = row.baseUrl || workspace?.baseUrl || undefined
    return { provider: "Ollama", model: row.model || (await defaultOllamaModel(ollamaUrl)), apiKey: "", ollamaUrl }
  }

  return {
    provider: row.provider as AiProvider,
    model: row.model || meta.models[0],
    apiKey,
  }
}

export interface SaveProjectAiInput {
  provider: AiProvider
  enabled?: boolean
  model?: string
  /** Omit to keep the stored key; empty string clears it. */
  apiKey?: string | null
  /** Ollama server URL; omit to keep, "" for the default. */
  baseUrl?: string
}

export async function saveProjectAiConfig(
  projectId: string,
  input: SaveProjectAiInput
): Promise<ProjectAiSettings> {
  const keyFields =
    input.apiKey === undefined
      ? {}
      : input.apiKey
        ? (() => {
            const enc = encryptSecret(input.apiKey)
            return {
              apiKeyEncrypted: enc.encrypted,
              apiKeyIv: enc.iv,
              apiKeyAuthTag: enc.authTag,
              apiKeyKeyVersion: enc.keyVersion,
            }
          })()
        : { apiKeyEncrypted: "", apiKeyIv: "", apiKeyAuthTag: "", apiKeyKeyVersion: "v1" }

  const common = {
    provider: input.provider,
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl.trim() }),
    ...keyFields,
  }

  const row = await prisma.projectAiConfig.upsert({
    where: { projectId },
    create: { projectId, enabled: input.enabled ?? true, model: input.model ?? "", ...common },
    update: common,
  })

  return {
    provider: row.provider as AiProvider,
    enabled: row.enabled,
    model: row.model,
    hasKey: !!row.apiKeyEncrypted,
    // Just written with this server's key, so by definition readable.
    keyUnreadable: false,
    baseUrl: row.baseUrl,
  }
}

export async function deleteProjectAiConfig(projectId: string): Promise<void> {
  await prisma.projectAiConfig.deleteMany({ where: { projectId } })
}
