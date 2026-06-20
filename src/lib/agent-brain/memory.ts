import { prisma } from "@/lib/db"
import { AgentMemoryState } from "./types"

export async function getProjectMemory(projectId: string): Promise<AgentMemoryState> {
  const memories = await prisma.agentMemory.findMany({
    where: { projectId },
  })

  const state: AgentMemoryState = {
    successfulLocators: {},
    failedLocatorPatterns: [],
    stableComponents: [],
    flakyComponents: [],
    userCorrections: {},
  }

  for (const m of memories) {
    try {
      const val = m.value as any
      if (m.key === "successful_locators") {
        state.successfulLocators = val || {}
      } else if (m.key === "failed_locator_patterns") {
        state.failedLocatorPatterns = val || []
      } else if (m.key === "stable_components") {
        state.stableComponents = val || []
      } else if (m.key === "flaky_components") {
        state.flakyComponents = val || []
      } else if (m.key === "user_corrections") {
        state.userCorrections = val || {}
      }
    } catch (e) {
      console.error(`[AgentMemory] Failed to parse memory key ${m.key}:`, e)
    }
  }

  return state
}

export async function updateProjectMemory(
  projectId: string,
  key: string,
  value: any
): Promise<void> {
  await prisma.agentMemory.upsert({
    where: {
      projectId_key: {
        projectId,
        key,
      },
    },
    update: { value },
    create: {
      projectId,
      key,
      value,
    },
  })
}

export async function resolveLocatorFromMemory(
  projectId: string,
  targetValue: string
): Promise<{ resolved: string | null; lookupMs: number }> {
  const start = performance.now()
  try {
    const memory = await getProjectMemory(projectId)

    // 1. User corrections take absolute priority
    if (memory.userCorrections[targetValue]) {
      return {
        resolved: memory.userCorrections[targetValue],
        lookupMs: performance.now() - start,
      }
    }

    // 2. Successful locators next
    if (memory.successfulLocators[targetValue]) {
      return {
        resolved: memory.successfulLocators[targetValue].selector,
        lookupMs: performance.now() - start,
      }
    }

    return { resolved: null, lookupMs: performance.now() - start }
  } catch (err) {
    console.error("[AgentMemory] Error resolving locator from memory:", err)
    return { resolved: null, lookupMs: performance.now() - start }
  }
}

export async function recordSuccessfulLocator(
  projectId: string,
  targetValue: string,
  resolvedSelector: string
): Promise<void> {
  try {
    const memory = await getProjectMemory(projectId)

    const locators = { ...memory.successfulLocators }
    const current = locators[targetValue] || { selector: resolvedSelector, successCount: 0 }
    current.successCount += 1
    current.selector = resolvedSelector
    locators[targetValue] = current

    await updateProjectMemory(projectId, "successful_locators", locators)

    // Check if this resolvedSelector is now stable
    if (current.successCount >= 3) {
      const stable = new Set(memory.stableComponents)
      stable.add(resolvedSelector)
      
      const flaky = new Set(memory.flakyComponents)
      flaky.delete(resolvedSelector)

      await updateProjectMemory(projectId, "stable_components", Array.from(stable))
      await updateProjectMemory(projectId, "flaky_components", Array.from(flaky))
    }
  } catch (err) {
    console.error("[AgentMemory] Failed to record successful locator:", err)
  }
}

export async function recordFailedLocator(
  projectId: string,
  targetValue: string,
  resolvedSelector?: string
): Promise<void> {
  try {
    const memory = await getProjectMemory(projectId)

    // Add targetValue or resolvedSelector to flaky components
    const flaky = new Set(memory.flakyComponents)
    const target = resolvedSelector || targetValue
    flaky.add(target)

    const stable = new Set(memory.stableComponents)
    stable.delete(target)

    await updateProjectMemory(projectId, "flaky_components", Array.from(flaky))
    await updateProjectMemory(projectId, "stable_components", Array.from(stable))

    // Record as failed pattern if it contains specific selector classes
    if (target.includes("cls-") || target.includes("d-") || target.includes("react-")) {
      const patterns = new Set(memory.failedLocatorPatterns)
      patterns.add(target)
      await updateProjectMemory(projectId, "failed_locator_patterns", Array.from(patterns))
    }
  } catch (err) {
    console.error("[AgentMemory] Failed to record failed locator:", err)
  }
}

export async function recordUserCorrection(
  projectId: string,
  targetValue: string,
  correctedSelector: string
): Promise<void> {
  try {
    const memory = await getProjectMemory(projectId)

    const corrections = { ...memory.userCorrections }
    corrections[targetValue] = correctedSelector

    await updateProjectMemory(projectId, "user_corrections", corrections)

    // Also update successful locators to use this corrected selector
    const locators = { ...memory.successfulLocators }
    locators[targetValue] = { selector: correctedSelector, successCount: 1 }
    await updateProjectMemory(projectId, "successful_locators", locators)

    // Remove from flaky components if present
    const flaky = new Set(memory.flakyComponents)
    flaky.delete(correctedSelector)
    await updateProjectMemory(projectId, "flaky_components", Array.from(flaky))
  } catch (err) {
    console.error("[AgentMemory] Failed to record user correction:", err)
  }
}
