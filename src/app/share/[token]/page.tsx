import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// Public viewer for a shared annotated screenshot. Reachable by anyone with the
// unguessable token link; honors the record's expiry.
export default async function SharedAnnotationPage({ params }: { params: { token: string } }) {
  const share = await prisma.sharedAnnotation.findUnique({ where: { token: params.token } })
  const expired = share?.expiresAt ? share.expiresAt.getTime() < Date.now() : false

  if (!share || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground dark:text-slate-100">
            {expired ? "This link has expired" : "Shared screenshot not found"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">The share link is invalid or is no longer available.</p>
        </div>
      </div>
    )
  }

  const meta = (share.metadata as any) || {}
  const tags: string[] = Array.isArray(meta.tags) ? meta.tags : []

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-foreground dark:text-slate-100">{share.title || "Shared Screenshot"}</h1>
          {meta.severity && (
            <span className="text-[11px] font-semibold uppercase px-2 py-1 rounded-full text-white" style={{ backgroundColor: severityColor(meta.severity) }}>
              {meta.severity}
            </span>
          )}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={share.imageUrl} alt={share.title || "Shared screenshot"} className="w-full rounded-xl border border-border dark:border-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.06)] bg-card" />

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 text-sm">
          {meta.description && <p className="whitespace-pre-wrap text-foreground dark:text-slate-300">{meta.description}</p>}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] pt-2">
            <Meta label="URL" value={meta.url} />
            <Meta label="Captured" value={meta.capturedAt} />
            <Meta label="Environment" value={meta.browser && meta.os ? `${meta.browser} · ${meta.os}` : undefined} />
            <Meta label="Dimensions" value={meta.dimensions} />
          </dl>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((t) => (
                <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground text-center">Shared via the QA annotation tool{share.expiresAt ? ` · expires ${share.expiresAt.toLocaleDateString()}` : ""}</p>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-muted-foreground font-medium text-[11px]">{label}</dt>
      <dd className="text-foreground dark:text-slate-300 font-medium break-words">{value}</dd>
    </div>
  )
}

function severityColor(s: string): string {
  return { critical: "#dc2626", major: "#ea580c", minor: "#ca8a04", trivial: "#2563eb" }[s] || "#64748b"
}
