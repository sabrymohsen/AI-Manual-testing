import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { chromium, Page } from "playwright"

function getPlaywrightLocator(page: Page, type: string, value: string) {
  switch (type) {
    case "test_id":
      return page.getByTestId(value)
    case "text":
      return page.getByText(value, { exact: false })
    case "label":
      return page.getByLabel(value)
    case "placeholder":
      return page.getByPlaceholder(value)
    case "role": {
      // Format: "button, name: \"Submit\""
      const commaIdx = value.indexOf(",")
      if (commaIdx !== -1) {
        const role = value.substring(0, commaIdx).trim()
        const namePart = value.substring(commaIdx + 1).trim()
        const match = namePart.match(/name:\s*["'](.*)["']/)
        const name = match ? match[1] : ""
        return page.getByRole(role as any, { name })
      }
      return page.getByRole(value as any)
    }
    case "css":
    case "xpath":
    default:
      return page.locator(value)
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const validateSchema = z.object({
    pageUrl: z.string().url("Invalid URL"),
    locatorType: z.string().min(1, "Locator type is required"),
    locatorValue: z.string().min(1, "Locator value is required"),
    locatorId: z.string().optional(),
  })
  const parsed = validateSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { pageUrl, locatorType, locatorValue, locatorId } = parsed.data

  let browser: any = null
  let context: any = null
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()

    await page.goto(pageUrl, { waitUntil: "load", timeout: 15000 })

    const plLocator = getPlaywrightLocator(page, locatorType, locatorValue)
    const count = await plLocator.count()

    const valid = count === 1
    const message = count === 1
      ? "Selector matched exactly one element."
      : count > 1
      ? `This selector matches multiple elements (${count}).`
      : "Selector matched zero elements."

    // Optionally update the DB status if checking an existing locator
    if (locatorId) {
      await prisma.elementLocator.update({
        where: { id: locatorId },
        data: {
          isValidated: true,
          matchCount: count,
          lastValidatedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      valid,
      matchCount: count,
      message,
    })
  } catch (err: any) {
    console.error("Locator validation error:", err)
    return NextResponse.json({
      valid: false,
      matchCount: 0,
      message: `Failed to load page or query selector: ${err.message || err}`,
    })
  } finally {
    if (context) await context.close()
    if (browser) await browser.close()
  }
}
