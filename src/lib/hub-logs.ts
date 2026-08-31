// Helpers for the Evidence Vault "Execution Logs" viewer, which tails the
// current run's log rather than blocking on it.
//
// This read SHAFT's log4j output at target/logs/log4j.log. Playwright writes no
// such file — it logs to stdout — so hub-runner now tees the run's output to
// RUN_LOG_PATH as it streams, which keeps the byte-offset tailing in the viewer
// working exactly as before.

import * as path from "path"
import { WORKSPACE_ROOT } from "@/lib/hub-workspace"

// Deliberately NOT inside test-results/: Playwright wipes its output directory
// when a run starts, which truncated the log the viewer was tailing.
export const RUN_LOG_PATH = path.join(WORKSPACE_ROOT, "run.log")

/** @deprecated old name; kept so existing imports resolve. */
export const LOG4J_PATH = RUN_LOG_PATH

// Playwright colourises its console output; strip the ANSI escape codes so the
// browser viewer can apply its own semantic colouring by log level.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, "")
}
