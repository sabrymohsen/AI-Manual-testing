import { defineWorkspace } from "vitest/config"
import path from "path"

const alias = { "@": path.resolve(__dirname, "./src") }

/**
 * Two projects, because the integration tests have a constraint the unit tests
 * do not: they share ONE Postgres database and wipe it in beforeEach.
 *
 * Run in parallel, two files would truncate each other's fixtures mid-test —
 * so a passing suite depended on the timing of whichever file got there first.
 * They are pinned to a single worker here, while the unit tests keep running in
 * parallel, where they are the bulk of the runtime and touch no shared state.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
    },
  },
  {
    resolve: { alias },
    test: {
      name: "integration",
      globals: true,
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      // One worker, one file at a time: these share a database.
      fileParallelism: false,
      poolOptions: { threads: { singleThread: true } },
    },
  },
])
