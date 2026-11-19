/** What the QA Engine desktop app exposes to its pages (desktop/src/preload.js). */
export interface DesktopAi {
  status(): Promise<{ running: boolean; models: string[] }>
  chat(body: unknown): Promise<{ ok: boolean; status: number; data: any }>
  pull(model: string): Promise<{ ok: boolean; error?: string }>
  openDownload(): Promise<void>
  onPullProgress(cb: (p: { model: string; status?: string; completed?: number; total?: number }) => void): () => void
}

export interface DesktopBridge {
  isDesktop: true
  platform: string
  version?: () => Promise<string>
  checkForUpdate?: () => Promise<void>
  ai?: DesktopAi
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null
  const d = (window as unknown as { qaDesktop?: DesktopBridge }).qaDesktop
  return d?.isDesktop ? d : null
}
