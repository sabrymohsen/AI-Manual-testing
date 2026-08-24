/**
 * The pure halves of mirroring the tracker's board: reading a tracker status
 * back to an app status, and parsing/verifying an OpenProject webhook.
 *
 * These are the two places the old behaviour went wrong — the reverse mapping
 * did not exist (so every non-closed tracker status collapsed to "Open"), and
 * the OpenProject webhook methods were stubs that rejected every delivery.
 */
import { describe, it, expect } from "vitest"
import crypto from "crypto"
import {
  appStatusForTrackerStatus,
  readBugStatusMapping,
  suggestBugStatusMapping,
  trackerStatusIdFor,
} from "@/lib/integrations/core/bug-status-mapping"
import { OpenProjectProvider } from "@/lib/integrations/providers/openproject.provider"

const conn = (webhookSecret: string | null) => ({
  provider: "OpenProject" as const,
  baseUrl: "https://openproject.example.test",
  externalProjectKey: "shd",
  username: "",
  apiToken: "token",
  webhookSecret,
})

describe("appStatusForTrackerStatus", () => {
  const mapping = { Open: "1", InProgress: "7", ReadyForRetest: "11", Closed: "12" }

  it("reads a tracker status back to the app status the user mapped it to", () => {
    expect(appStatusForTrackerStatus(mapping, "7")).toBe("InProgress")
    expect(appStatusForTrackerStatus(mapping, "12")).toBe("Closed")
  })

  it("returns null for a tracker status with no app meaning", () => {
    // "Specified" / "To be scheduled" / "Developed" — real OpenProject statuses
    // with no equivalent in the app's eight. Null is the correct answer, and is
    // what stops the app inventing a status and syncing it back out.
    expect(appStatusForTrackerStatus(mapping, "9")).toBeNull()
  })

  it("returns null rather than guessing when nothing is mapped", () => {
    expect(appStatusForTrackerStatus({}, "7")).toBeNull()
    expect(appStatusForTrackerStatus(mapping, null)).toBeNull()
    expect(appStatusForTrackerStatus(mapping, undefined)).toBeNull()
  })

  it("round-trips with trackerStatusIdFor", () => {
    for (const [appStatus, statusId] of Object.entries(mapping)) {
      expect(trackerStatusIdFor(mapping, appStatus)).toBe(statusId)
      expect(appStatusForTrackerStatus(mapping, statusId)).toBe(appStatus)
    }
  })

  it("tolerates whitespace on the incoming id", () => {
    expect(appStatusForTrackerStatus(mapping, " 7 ")).toBe("InProgress")
  })
})

describe("readBugStatusMapping / suggestBugStatusMapping", () => {
  it("reads the saved mapping off the integration JSON", () => {
    const stored = { bug: { Open: "1", Closed: "12", Bogus: "99" } }
    expect(readBugStatusMapping(stored)).toEqual({ Open: "1", Closed: "12" })
  })

  it("never suggests one tracker status for two app statuses", () => {
    const suggestion = suggestBugStatusMapping([
      { id: "1", name: "New" },
      { id: "7", name: "In progress" },
      { id: "12", name: "Closed" },
    ])
    const ids = Object.values(suggestion)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("OpenProjectProvider webhooks", () => {
  const payload = {
    action: "work_package:updated",
    work_package: {
      id: 25809,
      subject: "[BUG] Request Submission Form",
      updatedAt: "2026-08-24T11:05:00Z",
      _links: {
        status: { href: "/api/v3/statuses/7", title: "In progress" },
        assignee: { href: "/api/v3/users/12", title: "O G" },
        priority: { href: "/api/v3/priorities/8", title: "Normal" },
      },
    },
  }

  it("parses a work-package update into a normalized event", () => {
    const events = new OpenProjectProvider(conn(null)).parseWebhook(payload)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      externalId: "25809",
      action: "updated",
      changed: {
        statusId: "7",
        statusName: "In progress",
        title: "[BUG] Request Submission Form",
        assigneeId: "12",
        priorityId: "8",
      },
    })
    // The tracker's own timestamp, not "now" — last-writer-wins depends on it.
    expect(events[0].occurredAt?.toISOString()).toBe("2026-08-24T11:05:00.000Z")
  })

  it("ignores events that map to no local record", () => {
    const provider = new OpenProjectProvider(conn(null))
    expect(provider.parseWebhook({ action: "project:created", project: { id: 3 } })).toEqual([])
    expect(provider.parseWebhook({ action: "work_package:updated" })).toEqual([])
    expect(provider.parseWebhook(null)).toEqual([])
  })

  it("accepts the secret carried on the callback URL", () => {
    const provider = new OpenProjectProvider(conn("s3cret"))
    expect(provider.verifyWebhook({ "x-webhook-secret": "s3cret" }, "{}")).toBe(true)
    expect(provider.verifyWebhook({ "x-webhook-secret": "wrong" }, "{}")).toBe(false)
  })

  it("accepts OpenProject's HMAC signature over the raw body", () => {
    const body = JSON.stringify(payload)
    const signature =
      "sha1=" + crypto.createHmac("sha1", "s3cret").update(body, "utf8").digest("hex")
    const provider = new OpenProjectProvider(conn("s3cret"))
    expect(provider.verifyWebhook({ "x-op-signature": signature }, body)).toBe(true)
    // A signature over a different body must not pass.
    expect(provider.verifyWebhook({ "x-op-signature": signature }, "{}")).toBe(false)
  })

  it("rejects an unsigned delivery when a secret is configured", () => {
    expect(new OpenProjectProvider(conn("s3cret")).verifyWebhook({}, "{}")).toBe(false)
  })

  it("has nothing to verify when no secret is configured", () => {
    expect(new OpenProjectProvider(conn(null)).verifyWebhook({}, "{}")).toBe(true)
  })
})
