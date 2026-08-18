/**
 * Required custom fields on the tracker's bug type are captured per bug, so a
 * bug nobody filled them in for is rejected with "… can't be blank" — which is
 * every bug on an automatic sync. Project defaults close that gap, and must not
 * override a value the bug does carry.
 */
import { describe, it, expect } from "vitest"
import { mergeStoredCustomFields } from "@/lib/integrations/core/custom-fields"

const defaults = {
  customField1: { kind: "text", value: "2026.08" },
  customField2: { kind: "link-single", value: "/api/v3/custom_options/14" },
}

describe("mergeStoredCustomFields", () => {
  it("fills required fields the bug has no value for", () => {
    const { scalarFields, linkFields } = mergeStoredCustomFields(defaults, {})

    expect(scalarFields.customField1).toBe("2026.08")
    expect(linkFields.customField2).toBe("/api/v3/custom_options/14")
  })

  it("lets the bug's own value win over the default", () => {
    const own = { customField1: { kind: "text", value: "2026.09-hotfix" } }
    const { scalarFields } = mergeStoredCustomFields(defaults, own)

    expect(scalarFields.customField1).toBe("2026.09-hotfix")
  })

  it("falls back to the default when the bug's value was cleared", () => {
    // Sending "" is what the tracker rejects; an emptied field means "unset".
    const own = { customField1: { kind: "text", value: "" } }
    const { scalarFields } = mergeStoredCustomFields(defaults, own)

    expect(scalarFields.customField1).toBe("2026.08")
  })

  it("treats an empty multi-select as unset", () => {
    const multiDefaults = { customField3: { kind: "link-multi", value: ["/api/v3/custom_options/9"] } }
    const own = { customField3: { kind: "link-multi", value: [] } }
    const { linkFields } = mergeStoredCustomFields(multiDefaults, own)

    expect(linkFields.customField3).toEqual(["/api/v3/custom_options/9"])
  })

  it("works with no defaults configured", () => {
    const own = { customField1: { kind: "text", value: "only-value" } }
    const { scalarFields } = mergeStoredCustomFields(undefined, own)

    expect(scalarFields.customField1).toBe("only-value")
  })

  it("produces nothing when neither side has values", () => {
    const { scalarFields, linkFields } = mergeStoredCustomFields(null, null)

    expect(scalarFields).toEqual({})
    expect(linkFields).toEqual({})
  })

  it("keeps a bug value for one field while defaulting another", () => {
    const own = { customField2: { kind: "link-single", value: "/api/v3/custom_options/99" } }
    const { scalarFields, linkFields } = mergeStoredCustomFields(defaults, own)

    expect(scalarFields.customField1).toBe("2026.08")
    expect(linkFields.customField2).toBe("/api/v3/custom_options/99")
  })
})
