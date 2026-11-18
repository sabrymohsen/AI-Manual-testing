// Node-only startup work, loaded by src/instrumentation.ts.
import { startScheduler } from "@/lib/hub-schedule"

if (process.env.HUB_SCHEDULER_DISABLED !== "true") startScheduler()
