// Combined worker entrypoint — runs every BullMQ queue consumer in one process.
//
//   ./test-runner.worker      → test-execution, visual-check, agent-run, agent-brain queues
//   ./autonomous-agent.worker  → autonomous-agent queue
//
// Each module starts its workers and heartbeat as an import side effect, so a
// single `tsx src/workers/index.ts` process drives all background jobs. The
// live-recording WebSocket server (recorder.worker.ts) is intentionally NOT
// included here — it's a networked server and belongs in its own service.
import "./test-runner.worker"
import "./autonomous-agent.worker"

console.log("[WORKERS] All background queue workers started in a single process.")
