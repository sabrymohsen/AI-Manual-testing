# Production file storage (Railway)

## The problem this solves

Every upload the app accepts — profile photos, BRD documents, bug screenshots,
recordings, Evidence Vault files — is written to the filesystem under
`STORAGE_ROOT`. The database stores only the **path** to the file, never the
bytes:

| Thing uploaded | Written to | Referenced in DB by |
| --- | --- | --- |
| Profile photo | `$STORAGE_ROOT/avatars/` | `User.avatarUrl` |
| BRD document | `$STORAGE_ROOT/brds/<projectId>/<brdId>/` | `BrdVersion.storagePath` |
| Screenshots / evidence | `$STORAGE_ROOT/screenshots/`, `.../videos/`, … | `EvidenceFile`, `BugReport.screenshotPath` |

`Dockerfile` sets `ENV STORAGE_ROOT=/data`.

A container filesystem is **ephemeral**: every deploy starts from the image, so
anything written to `/data` at runtime is gone. The database row survives and
still points at a file that no longer exists, so the image 404s. Re-uploading
appears to fix it — until the next deploy.

The fix is to mount a persistent volume at `/data`, so the directory outlives
the container.

## Mounting the volume on Railway

Do this for **each** service that reads or writes uploads — the web service and
the worker service, if the worker handles screenshots or evidence.

1. Open the Railway project → select the service.
2. **Variables** tab → confirm `STORAGE_ROOT` is `/data` (it is baked into the
   image, so it only needs setting if you have overridden it).
3. **Settings** tab → **Volumes** → **+ New Volume**.
4. Set the **mount path** to exactly `/data`. This must match `STORAGE_ROOT`
   character for character — `/data/` or `/app/data` will not work.
5. Pick a size. Uploads are small; start at 5–10 GB and grow it later (Railway
   allows growing a volume, not shrinking it).
6. Redeploy the service.

> If the web and worker services both need the files, note that a Railway volume
> attaches to a **single service**. Either consolidate the file-writing work into
> one service, or move to object storage (see below).

## Verifying it worked

**From the logs.** On boot the server now prints one of:

```
> Storage OK at /data (persistent since 2026-08-03T09:13:38.340Z)   ← good
> Storage initialised at /data (first run — marker written)          ← expected once
!!! STORAGE APPEARS EPHEMERAL !!!                                    ← volume missing
!!! STORAGE NOT WRITABLE !!!                                         ← volume misconfigured
```

**From the health endpoint.** `GET /api/health` reports:

```json
{
  "checks": { "storage": true, "storagePersistent": true },
  "storage": { "persistedSince": "…", "looksEphemeral": false, "referencedFiles": 0 }
}
```

- `storage: false` → the path is not writable at all. Usually the volume is
  mounted but owned by root; the Dockerfile `CMD` already `chown`s
  `$STORAGE_ROOT`, so check the mount path matches `STORAGE_ROOT`.
- `storagePersistent: false` → files are being lost between deploys.

**The real test:** upload a profile photo, redeploy, and reload. If the photo is
still there, the volume is working.

### How the detection works

`src/lib/storage-health.ts` writes a marker file (`.storage-marker.json`) into
`STORAGE_ROOT` on first boot. On later boots:

- marker present → storage persisted.
- marker missing **and** the directory is empty **and** the database still
  references stored files → the volume was wiped, so it warns loudly.
- marker missing but the directory still has files → this is just the first boot
  after deploying this change. Not a problem, and it does not warn.

The marker is in `.gitignore` and `.dockerignore` excludes `storage/`, so it can
never be committed or baked into an image — a baked-in marker would make a wiped
volume look healthy.

## Recovering the files already lost

Files from before the volume existed are not recoverable — they were never
persisted anywhere. What remains is dangling database references:

- **Avatars:** users simply re-upload. To clear the broken references so people
  see their initials instead of a broken image:
  ```sql
  UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" LIKE '/api/files/avatars/%';
  ```
- **BRDs:** the `BrdDocument` / `BrdVersion` rows, links, comments and audit
  trail all survive — only the file bytes are gone. Re-upload the source
  document as a new version to restore the document while keeping its history.

Run the `UPDATE` only after the volume is confirmed working, or the next deploy
will just break the freshly uploaded photos again.

## If you outgrow a volume

A single volume attaches to a single service and does not survive a region move.
If you need multiple services writing files, or CDN delivery, move uploads to S3
or Cloudflare R2 behind the existing `/api/files/[...path]` route — that route is
already the only way the browser fetches stored files, so it is the single place
that would need to change.
