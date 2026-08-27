import crypto from "node:crypto"

/**
 * Symmetric encryption for the secrets this app stores on behalf of a project:
 * tracker API tokens, login credentials, Figma tokens, secret test-data values.
 *
 * AES-256-GCM, so the key must be exactly 32 bytes. It is read from
 * APP_ENCRYPTION_KEY as base64.
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const _TAG_LENGTH = 16
const KEY_LENGTH = 32
const KEY_VERSION = process.env.APP_ENCRYPTION_KEY_VERSION || "v1"

export interface EncryptedSecret {
  encrypted: string
  iv: string
  authTag: string
  keyVersion: string
}

/**
 * A misconfigured key, as opposed to a failure of the encryption itself.
 *
 * Separate so callers can pass the message on to the operator: it names an
 * environment variable and never contains any part of the key or the secret.
 * "Failed to encrypt API token" on its own sent people looking for a bug in
 * the tracker integration when the answer was an unset variable on the host.
 */
export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EncryptionKeyError"
  }
}

const HOW_TO_GENERATE =
  'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'

function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw || !raw.trim()) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY is not set on this server, so secrets cannot be stored. ${HOW_TO_GENERATE}`
    )
  }

  const value = raw.trim()

  // Buffer.from(..., "base64") never throws: it skips whatever it cannot
  // decode. A 32-character passphrase pasted in as-is therefore yields 24
  // silent bytes and a cryptic "Invalid key length" from createCipheriv, so
  // the length is checked here where the reason can still be explained.
  const key = Buffer.from(value, "base64")
  if (key.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY must be 32 bytes encoded as base64, but the value on this server decodes to ${key.length} bytes. ${HOW_TO_GENERATE}`
    )
  }

  return key
}

/**
 * Is this server able to store secrets? Used by the health endpoint and by the
 * integration screens, so the answer arrives before someone types a token into
 * a form that cannot save it.
 */
export function checkEncryptionKey(): { ok: true } | { ok: false; reason: string } {
  try {
    getEncryptionKey()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, reason: err?.message || "APP_ENCRYPTION_KEY is unusable" }
  }
}

export function encryptSecret(value: string): EncryptedSecret {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(value, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    keyVersion: KEY_VERSION,
  }
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = getEncryptionKey()
  const iv = Buffer.from(secret.iv, "hex")
  const authTag = Buffer.from(secret.authTag, "hex")

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(secret.encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("base64")
}
