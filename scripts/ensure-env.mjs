/**
 * Make a fresh clone runnable without a manual secret-generation step.
 *
 * Runs from the `predev` hook, so `npm run dev` on a new machine just works.
 * It only ever FILLS IN what is missing:
 *
 *   - creates .env from .env.example when there is no .env at all;
 *   - generates APP_ENCRYPTION_KEY when it is absent, empty, or still the
 *     documented placeholder;
 *   - sets APP_ENCRYPTION_KEY_VERSION when absent.
 *
 * It never replaces a key it does not recognise, even a malformed one: that
 * value may be the key some rows in the developer's database were encrypted
 * with, and silently swapping it would make them permanently unreadable. It
 * says what is wrong and stops instead.
 *
 * Deliberately dev-only and dependency-free: Railway runs build/start, not dev,
 * and a deployment must never invent its own encryption key — that would give
 * every replica a different one.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ENV_PATH = path.join(ROOT, ".env")
const EXAMPLE_PATH = path.join(ROOT, ".env.example")

const KEY = "APP_ENCRYPTION_KEY"
const VERSION_KEY = "APP_ENCRYPTION_KEY_VERSION"

/** Values that were never a real key — safe to replace without asking. */
const PLACEHOLDERS = new Set([
  "",
  "base64-encoded-32-byte-key-must-be-exactly-32-bytes",
  "replace-me",
  "changeme",
])

function readEnv() {
  if (fs.existsSync(ENV_PATH)) return fs.readFileSync(ENV_PATH, "utf8")
  if (fs.existsSync(EXAMPLE_PATH)) {
    const seeded = fs.readFileSync(EXAMPLE_PATH, "utf8")
    fs.writeFileSync(ENV_PATH, seeded)
    console.log("[env] created .env from .env.example")
    return seeded
  }
  fs.writeFileSync(ENV_PATH, "")
  console.log("[env] created an empty .env")
  return ""
}

/** Value of `NAME=...` in a .env, unquoted. Returns null when absent. */
function valueOf(source, name) {
  const match = source.match(new RegExp(`^\\s*${name}\\s*=(.*)$`, "m"))
  if (!match) return null
  return match[1].trim().replace(/^["']|["']$/g, "")
}

function setValue(source, name, value) {
  const line = `${name}="${value}"`
  const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, "m")
  if (pattern.test(source)) return source.replace(pattern, line)
  return source.replace(/\n*$/, "\n") + line + "\n"
}

let env = readEnv()
let changed = false

const current = valueOf(env, KEY)
const decoded = current ? Buffer.from(current, "base64") : null

if (current === null || PLACEHOLDERS.has(current)) {
  env = setValue(env, KEY, crypto.randomBytes(32).toString("base64"))
  changed = true
  console.log(`[env] generated ${KEY} (32 bytes, base64)`)
} else if (decoded.length !== 32) {
  // Not ours to overwrite — see the note at the top of this file.
  console.error(
    `\n[env] ${KEY} in .env decodes to ${decoded.length} bytes; AES-256 needs exactly 32.\n` +
      `      Stopping here rather than starting a dev server that cannot save secrets.\n` +
      `      Saving any secret (tracker tokens, credentials, Figma tokens) will fail until this is fixed.\n` +
      `      If nothing in your database was encrypted with it, replace it with:\n` +
      `        node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      `      If secrets WERE saved with it, restore the original value instead — a new key cannot read them.\n`
  )
  process.exitCode = 1
}

if (valueOf(env, VERSION_KEY) === null) {
  env = setValue(env, VERSION_KEY, "v1")
  changed = true
  console.log(`[env] set ${VERSION_KEY}=v1`)
}

if (changed) fs.writeFileSync(ENV_PATH, env)
