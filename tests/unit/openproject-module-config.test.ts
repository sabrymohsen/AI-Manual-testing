/**
 * Unit tests for per-module OpenProject config merge logic.
 * Tests the isComplete computation and effective config inheritance rules.
 */
import { describe, it, expect } from "vitest"

// Mirrors the logic in groups/route.ts and modules/[moduleId]/config/route.ts
function computeEffectiveConfig(
  modCfg: {
    baseUrl?: string | null
    openProjectProjectIdentifier?: string | null
    apiTokenEncrypted?: string | null
    testCaseTypeId?: string | null
    passedStatusId?: string | null
    failedStatusId?: string | null
    defaultStatusId?: string | null
  } | null,
  projCfg: {
    baseUrl?: string | null
    openProjectProjectIdentifier?: string | null
    apiTokenEncrypted?: string | null
    testCaseTypeId?: string | null
    passedStatusId?: string | null
    failedStatusId?: string | null
    defaultStatusId?: string | null
  } | null
) {
  return {
    baseUrl: modCfg?.baseUrl || projCfg?.baseUrl || null,
    openProjectProjectIdentifier: modCfg?.openProjectProjectIdentifier || projCfg?.openProjectProjectIdentifier || null,
    hasToken: !!(modCfg?.apiTokenEncrypted || projCfg?.apiTokenEncrypted),
    testCaseTypeId: modCfg?.testCaseTypeId || projCfg?.testCaseTypeId || null,
    passedStatusId: modCfg?.passedStatusId || projCfg?.passedStatusId || null,
    failedStatusId: modCfg?.failedStatusId || projCfg?.failedStatusId || null,
    defaultStatusId: modCfg?.defaultStatusId || projCfg?.defaultStatusId || null,
  }
}

function isComplete(effective: ReturnType<typeof computeEffectiveConfig>): boolean {
  return !!(
    effective.baseUrl &&
    effective.hasToken &&
    effective.openProjectProjectIdentifier &&
    (effective.passedStatusId || effective.failedStatusId || effective.defaultStatusId)
  )
}

describe("OpenProject module config — effective config merge", () => {
  it("inherits all fields from project when module config is null", () => {
    const eff = computeEffectiveConfig(null, {
      baseUrl: "https://op.example.com",
      openProjectProjectIdentifier: "my-project",
      apiTokenEncrypted: "enc-token",
      passedStatusId: "5",
    })
    expect(eff.baseUrl).toBe("https://op.example.com")
    expect(eff.openProjectProjectIdentifier).toBe("my-project")
    expect(eff.hasToken).toBe(true)
    expect(eff.passedStatusId).toBe("5")
  })

  it("module override wins over project for baseUrl", () => {
    const eff = computeEffectiveConfig(
      { baseUrl: "https://module-op.example.com" },
      { baseUrl: "https://project-op.example.com", apiTokenEncrypted: "tok", openProjectProjectIdentifier: "proj" }
    )
    expect(eff.baseUrl).toBe("https://module-op.example.com")
  })

  it("module token takes precedence over project token", () => {
    const eff = computeEffectiveConfig(
      { apiTokenEncrypted: "module-token" },
      { apiTokenEncrypted: "project-token" }
    )
    expect(eff.hasToken).toBe(true)
  })

  it("falls back to project token when module has no token", () => {
    const eff = computeEffectiveConfig(
      { baseUrl: "https://op.example.com" },
      { apiTokenEncrypted: "project-token" }
    )
    expect(eff.hasToken).toBe(true)
  })

  it("status mapping inherits from project when module has none", () => {
    const eff = computeEffectiveConfig(
      { testCaseTypeId: "3" },
      { passedStatusId: "10", failedStatusId: "11", apiTokenEncrypted: "tok" }
    )
    expect(eff.passedStatusId).toBe("10")
    expect(eff.failedStatusId).toBe("11")
  })

  it("module status mapping overrides project", () => {
    const eff = computeEffectiveConfig(
      { passedStatusId: "99" },
      { passedStatusId: "10", apiTokenEncrypted: "tok" }
    )
    expect(eff.passedStatusId).toBe("99")
  })

  it("returns null for fields with no project or module value", () => {
    const eff = computeEffectiveConfig(null, null)
    expect(eff.baseUrl).toBeNull()
    expect(eff.hasToken).toBe(false)
    expect(eff.passedStatusId).toBeNull()
  })
})

describe("OpenProject module config — isComplete", () => {
  it("is complete when baseUrl + token + identifier + at least one status are set", () => {
    const eff = computeEffectiveConfig(
      { passedStatusId: "5" },
      { baseUrl: "https://op.example.com", openProjectProjectIdentifier: "proj", apiTokenEncrypted: "tok" }
    )
    expect(isComplete(eff)).toBe(true)
  })

  it("is incomplete when baseUrl is missing", () => {
    const eff = computeEffectiveConfig(null, {
      openProjectProjectIdentifier: "proj",
      apiTokenEncrypted: "tok",
      passedStatusId: "5",
    })
    expect(isComplete(eff)).toBe(false)
  })

  it("is incomplete when token is missing", () => {
    const eff = computeEffectiveConfig(null, {
      baseUrl: "https://op.example.com",
      openProjectProjectIdentifier: "proj",
      passedStatusId: "5",
    })
    expect(isComplete(eff)).toBe(false)
  })

  it("is incomplete when project identifier is missing", () => {
    const eff = computeEffectiveConfig(null, {
      baseUrl: "https://op.example.com",
      apiTokenEncrypted: "tok",
      passedStatusId: "5",
    })
    expect(isComplete(eff)).toBe(false)
  })

  it("is incomplete when no status mapping is set (even partially)", () => {
    const eff = computeEffectiveConfig(null, {
      baseUrl: "https://op.example.com",
      openProjectProjectIdentifier: "proj",
      apiTokenEncrypted: "tok",
    })
    expect(isComplete(eff)).toBe(false)
  })

  it("is complete with only defaultStatusId (not-executed mapping)", () => {
    const eff = computeEffectiveConfig(null, {
      baseUrl: "https://op.example.com",
      openProjectProjectIdentifier: "proj",
      apiTokenEncrypted: "tok",
      defaultStatusId: "1",
    })
    expect(isComplete(eff)).toBe(true)
  })

  it("is complete with module overriding all project defaults", () => {
    const eff = computeEffectiveConfig(
      {
        baseUrl: "https://mod-op.example.com",
        openProjectProjectIdentifier: "mod-proj",
        apiTokenEncrypted: "mod-tok",
        passedStatusId: "20",
      },
      null
    )
    expect(isComplete(eff)).toBe(true)
  })
})
