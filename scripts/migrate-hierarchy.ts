#!/usr/bin/env tsx
/**
 * CLI script to migrate legacy test cases (with module string but no moduleId)
 * to the new ProjectModule hierarchy.
 *
 * Usage:
 *   npx tsx scripts/migrate-hierarchy.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateHierarchy() {
  try {
    console.log("[migration] Checking if legacy test cases need hierarchy migration...")

    // Find test cases that have a module string but no moduleId
    const testCases = await prisma.testCase.findMany({
      where: {
        moduleId: null,
        module: { not: null }
      },
      select: {
        id: true,
        projectId: true,
        module: true
      }
    })

    if (testCases.length === 0) {
      console.log("[migration] No legacy test cases found to migrate.")
      return
    }

    console.log(`[migration] Found ${testCases.length} test cases to migrate. Mapping unique modules...`)

    // Group unique modules by projectId
    const projectModulesMap: Record<string, Set<string>> = {}
    testCases.forEach((tc) => {
      if (tc.module) {
        if (!projectModulesMap[tc.projectId]) {
          projectModulesMap[tc.projectId] = new Set()
        }
        projectModulesMap[tc.projectId].add(tc.module)
      }
    })

    // Create ProjectModule records for unique modules
    for (const projectId of Object.keys(projectModulesMap)) {
      const uniqueModules = Array.from(projectModulesMap[projectId])
      for (const moduleName of uniqueModules) {
        // Find or create ProjectModule
        let projectModule = await prisma.projectModule.findFirst({
          where: {
            projectId,
            name: { equals: moduleName, mode: "insensitive" }
          }
        })

        if (!projectModule) {
          console.log(`[migration] Creating module "${moduleName}" for project ${projectId}`)
          projectModule = await prisma.projectModule.create({
            data: {
              projectId,
              name: moduleName,
              description: `Auto-migrated from legacy test cases`
            }
          })
        }

        // Link test cases with matching module string
        const updateRes = await prisma.testCase.updateMany({
          where: {
            projectId,
            module: moduleName,
            moduleId: null
          },
          data: {
            moduleId: projectModule.id
          }
        })
        console.log(`[migration] Linked ${updateRes.count} test cases to module "${moduleName}"`)
      }
    }
    console.log("[migration] Legacy hierarchy migration completed successfully.")
  } catch (error) {
    console.error("[migration] Error during legacy hierarchy migration:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrateHierarchy()
