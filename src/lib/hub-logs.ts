// Helpers for the Evidence Vault "Execution Logs" viewer, which streams SHAFT's
// asynchronous log4j output (target/logs/log4j.log) rather than blocking on it.

import * as path from "path"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"

export const LOG4J_PATH = path.join(ARTIFACT_ROOT, "target/logs/log4j.log")

// SHAFT colourises its console output; strip the ANSI escape codes so the
// browser viewer can apply its own semantic colouring by log level.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, "")
}
