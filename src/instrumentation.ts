/**
 * Runs once when the server starts. Starts the Automation Hub schedule ticker
 * in the Node.js runtime only.
 *
 * The import MUST sit inside `if (process.env.NEXT_RUNTIME === "nodejs")` —
 * Next compiles this file for the edge runtime too, and only this exact form
 * lets the bundler drop the Node-only scheduler (Prisma, fs, child_process)
 * from the edge build. An early `return` does not.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node")
  }
}
