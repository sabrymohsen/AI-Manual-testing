import fs from "node:fs/promises"
import path from "node:path"

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Already exists
  }
}

export async function saveAgentScreenshot(
  agentRunId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const dirPath = path.join(STORAGE_ROOT, "agent-runs", agentRunId, "screenshots")
  await ensureDir(dirPath)
  const filePath = path.join(dirPath, filename)
  await fs.writeFile(filePath, buffer)
  
  // Return relative public path for frontend consumption
  return `/api/files?path=${encodeURIComponent(filePath)}`
}

export async function saveAgentLog(
  agentRunId: string,
  filename: string,
  content: string
): Promise<string> {
  const dirPath = path.join(STORAGE_ROOT, "agent-runs", agentRunId, "logs")
  await ensureDir(dirPath)
  const filePath = path.join(dirPath, filename)
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}

export async function saveAgentReport(
  agentRunId: string,
  filename: string,
  content: string
): Promise<string> {
  const dirPath = path.join(STORAGE_ROOT, "agent-runs", agentRunId, "reports")
  await ensureDir(dirPath)
  const filePath = path.join(dirPath, filename)
  await fs.writeFile(filePath, content, "utf8")
  return filePath
}
