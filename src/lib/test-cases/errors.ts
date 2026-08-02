import { NextResponse } from "next/server"

/**
 * Turns "the test-library migration hasn't been applied yet" into a message
 * that says so, instead of a bare 500.
 *
 * The browse/facets/suites endpoints read columns added by
 * 20260802000000_test_suites_and_execution_rollup. Until that migration runs
 * (and the Prisma client is regenerated) every one of them throws, and the UI
 * could only report "Request failed (500)" — which tells you nothing about the
 * actual cause or the fix.
 *
 * Two distinct failure modes, both handled:
 *   - client not regenerated → PrismaClientValidationError (unknown field)
 *   - migration not applied  → P2021 (table missing) / P2022 (column missing)
 */

const MIGRATION_HINT =
  "The test library migration hasn't been applied to this database yet. Run: npx prisma generate && npx prisma migrate deploy, then npx tsx scripts/backfill-test-suites.ts --apply"

/** Detects a schema-drift error rather than a genuine runtime failure. */
export function isMissingSchemaError(err: unknown): boolean {
  const e = err as { code?: string; name?: string; message?: string }
  if (e?.code === "P2021" || e?.code === "P2022") return true
  if (e?.name === "PrismaClientValidationError") return true

  const msg = e?.message ?? ""
  return (
    /column .* does not exist/i.test(msg) ||
    /relation "TestSuite" does not exist/i.test(msg) ||
    /Unknown (field|arg|argument)/i.test(msg)
  )
}

/**
 * Standard catch for the test-library read endpoints. Returns 503 with an
 * actionable message when the schema is behind, and rethrows anything else so
 * real bugs still surface as real errors.
 */
export function handleLibraryError(err: unknown, context: string) {
  if (isMissingSchemaError(err)) {
    console.error(`[test-library] ${context} — schema not migrated:`, err)
    return NextResponse.json(
      { error: MIGRATION_HINT, code: "MIGRATION_REQUIRED" },
      { status: 503 }
    )
  }

  console.error(`[test-library] ${context} failed:`, err)
  const message = err instanceof Error ? err.message : "Unexpected error"
  return NextResponse.json({ error: message }, { status: 500 })
}
