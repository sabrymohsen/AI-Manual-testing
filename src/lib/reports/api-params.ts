import { z } from "zod"
import type { ListParams } from "./analytics"

export const listQuerySchema = z.object({
  projectId: z.string().min(1),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().optional(),
  severity: z.string().optional(),
})

export function parseList(url: URL): { ok: true; params: ListParams } | { ok: false; error: string } {
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") }
  return { ok: true, params: parsed.data }
}

export const rangeSchema = z.object({
  projectId: z.string().min(1),
  sprintId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
