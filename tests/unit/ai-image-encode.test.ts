import { describe, it, expect } from "vitest"
import { fitWithin, AI_IMAGE_MAX_DIM } from "@/lib/images/encode-for-ai"

/**
 * The pixel maths behind shrinking a screenshot for the trip to a model. The
 * canvas half is browser-only; this is the part that decides how many megabytes
 * of base64 the draft has to upload inside its own timeout.
 */
describe("fitting a screenshot into the model's budget", () => {
  it("leaves a picture that already fits alone", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 })
  })

  it("scales a Retina screenshot down by its longest edge", () => {
    // A 2880x1800 capture — the common case, and ~11 MB of base64 untouched.
    expect(fitWithin(2880, 1800)).toEqual({ width: 1600, height: 1000 })
  })

  it("keeps the aspect ratio of a tall, narrow capture", () => {
    const { width, height } = fitWithin(800, 4000)
    expect(height).toBe(AI_IMAGE_MAX_DIM)
    expect(width / height).toBeCloseTo(800 / 4000, 3)
  })

  it("never rounds an extreme panorama down to zero pixels", () => {
    expect(fitWithin(10000, 3).width).toBe(AI_IMAGE_MAX_DIM)
    expect(fitWithin(10000, 3).height).toBe(1)
  })

  it("passes a degenerate size through rather than dividing by zero", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 })
  })
})
