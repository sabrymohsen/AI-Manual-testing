/**
 * POST /api/test-cases/[testCaseId]/sync/openproject
 *
 * Single test case sync to OpenProject. Direct (not queued).
 * Supports retry for failed syncs.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, canUseProject } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

export async function POST(
  _request: Request,
  { params }: { params: { testCaseId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  // Load test case with project
  const testCase = await prisma.testCase.findUnique({
    where: { id: params.testCaseId },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      project: { select: { name: true } },
    },
  })

  // Signed-in is not enough: the caller must be able to write to this project.
  if (!testCase || !(await canUseProject(testCase.projectId, auth.session!.user.id, "write"))) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  // Resolve from whichever row owns the config (unified ProjectIntegration
  // first, legacy OpenProjectIntegration second).
  const resolved = await resolveOpenProject(testCase.projectId)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { client, integration } = resolved


  const mod = (testCase as any).moduleRelation?.name || "General"
  const feature = (testCase as any).feature?.name
  const component = (testCase as any).component?.name
  const projectName = testCase.project?.name || "Unknown"

  let md = `## Test Case\n\n`
  md += `**Local Test Case ID:** \`${testCase.id}\`\n`
  md += `**Project:** ${projectName}\n`
  md += `**Module:** ${mod}\n`
  if (feature) md += `**Feature:** ${feature}\n`
  if (component) md += `**Component:** ${component}\n`
  md += `**Priority:** ${testCase.priority}\n`
  md += `**Source:** ${testCase.source}\n\n`

  if (testCase.preconditions) {
    md += `## Preconditions\n`
    for (const line of testCase.preconditions.split("\n").filter(Boolean)) {
      md += `- ${line}\n`
    }
    md += "\n"
  }

  if (testCase.steps?.length > 0) {
    md += `## Steps\n\n| Step | Action | Expected Result |\n|---|---|---|\n`
    for (const s of testCase.steps) {
      const action = s.actionDescription.replace(/\|/g, "\\|")
      const expected = (s.expectedResult || "").replace(/\|/g, "\\|")
      md += `| ${s.stepNumber} | ${action} | ${expected} |\n`
    }
    md += "\n"
  }

  md += `## Latest Execution Result\nNot Executed\n\n`
  md += `*Generated from [QA Engine](${APP_URL})*\n\n`
  md += `<!-- AI-Manual-QA-Tester:TestCase:${testCase.id} -->`

  const subject = `[TC] ${testCase.title}`

  try {
    // Check existing mapping
    const existingMapping = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: "OpenProject",
          localEntityType: "TestCase",
          localEntityId: testCase.id,
        },
      },
    })

    const links: Record<string, { href: string }> = {}
    if (integration.testCaseTypeId) links.type = { href: client.typeHref(integration.testCaseTypeId) }
    if (integration.defaultStatusId) links.status = { href: client.statusHref(integration.defaultStatusId) }
    if (integration.parentStrategy === "SingleParent" && integration.defaultParentWorkPackageId) {
      links.parent = { href: client.parentHref(integration.defaultParentWorkPackageId) }
    }

    if (existingMapping) {
      // Update existing WP
      const wp = await client.getWorkPackage(existingMapping.externalId)
      await client.updateWorkPackage(
        existingMapping.externalId,
        {
          subject,
          description: { format: "markdown", raw: md },
          _links: links,
        },
        wp.lockVersion
      )

      await prisma.externalSyncMapping.update({
        where: { id: existingMapping.id },
        data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
      })

      return NextResponse.json({
        action: "updated",
        externalId: existingMapping.externalId,
        externalUrl: existingMapping.externalUrl,
      })
    } else {
      // Check for orphan via marker
      const orphanWp = await client.findWorkPackageByMarker(testCase.id)
      if (orphanWp) {
        const wpUrl = client.workPackageUrl(orphanWp.id)
        await prisma.externalSyncMapping.create({
          data: {
            projectId: testCase.projectId,
            provider: "OpenProject",
            localEntityType: "TestCase",
            localEntityId: testCase.id,
            externalId: String(orphanWp.id),
            externalUrl: wpUrl,
            externalType: "TestCase",
            lastSyncedAt: new Date(),
            lastSyncStatus: "success",
          },
        })
        return NextResponse.json({ action: "re-attached", externalId: String(orphanWp.id), externalUrl: wpUrl })
      }

      // Create new
      const wp = await client.createWorkPackage({
        subject,
        description: { format: "markdown", raw: md },
        _links: links,
      })
      const wpUrl = client.workPackageUrl(wp.id)

      await prisma.externalSyncMapping.create({
        data: {
          projectId: testCase.projectId,
          provider: "OpenProject",
          localEntityType: "TestCase",
          localEntityId: testCase.id,
          externalId: String(wp.id),
          externalUrl: wpUrl,
          externalType: "TestCase",
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
        },
      })

      return NextResponse.json({ action: "created", externalId: String(wp.id), externalUrl: wpUrl })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 })
  }
}
