import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const _TAG_LENGTH = 16
const KEY_VERSION = process.env.APP_ENCRYPTION_KEY_VERSION || "v1"

export interface EncryptedSecret {
  encrypted: string
  iv: string
  authTag: string
  keyVersion: string
}

function getEncryptionKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY environment variable is not set")
  }
  return Buffer.from(key, "base64")
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
