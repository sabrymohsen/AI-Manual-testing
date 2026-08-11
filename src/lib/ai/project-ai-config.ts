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
import { PROVIDER_CATALOG, type AiProvider } from "@/lib/hub-ai-providers"

export interface ProjectAiSettings {
  provider: AiProvider
  enabled: boolean
  model: string
  /** Whether a key is stored on the project itself (vs inherited). */
  hasKey: boolean
}

export interface ProjectAiCredentials {
  provider: AiProvider
  model: string
  apiKey: string
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
  }
}

export async function deleteProjectAiConfig(projectId: string): Promise<void> {
  await prisma.projectAiConfig.deleteMany({ where: { projectId } })
}
