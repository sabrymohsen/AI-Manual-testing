import { describe, it, expect } from "vitest"
import { encryptSecret, decryptSecret, generateEncryptionKey } from "@/lib/crypto"

// Set encryption key for tests
process.env.APP_ENCRYPTION_KEY = "WBuGjCWCotqwUPmC6NCFm1jE9KaMhNF2p5kiPFJIV7c="
process.env.APP_ENCRYPTION_KEY_VERSION = "v1"

describe("crypto module", () => {
  it("should encrypt and decrypt a value", () => {
    const original = "my-secret-password-123"
    const encrypted = encryptSecret(original)
    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(original)
  })

  it("should produce different ciphertexts for same input", () => {
    const input = "same-value"
    const e1 = encryptSecret(input)
    const e2 = encryptSecret(input)
    expect(e1.encrypted).not.toBe(e2.encrypted)
  })

  it("should include all required fields", () => {
    const result = encryptSecret("test")
    expect(result).toHaveProperty("encrypted")
    expect(result).toHaveProperty("iv")
    expect(result).toHaveProperty("authTag")
    expect(result).toHaveProperty("keyVersion")
  })

  it("should generate a valid base64 key", () => {
    const key = generateEncryptionKey()
    const decoded = Buffer.from(key, "base64")
    expect(decoded.length).toBe(32)
  })
})
