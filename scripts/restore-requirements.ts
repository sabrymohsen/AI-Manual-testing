import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Status normalizer matching confirm/route.ts
function normalizeStatus(raw: unknown): "Draft" | "ReadyForTesting" | "InTesting" | "Covered" | "PartiallyCovered" | "Failed" | "Blocked" | "Deprecated" {
  const v = String(raw ?? "").trim().toLowerCase()
  if (!v) return "Draft"
  const exact: Record<string, any> = {
    draft: "Draft", readyfortesting: "ReadyForTesting", intesting: "InTesting",
    covered: "Covered", partiallycovered: "PartiallyCovered", failed: "Failed",
    blocked: "Blocked", deprecated: "Deprecated",
  }
  if (exact[v.replace(/[\s_-]/g, "")]) return exact[v.replace(/[\s_-]/g, "")]
  if (/active|approved|ready|open|new|todo|نشط|معتمد|جاهز/.test(v)) return "ReadyForTesting"
  if (/testing|progress|قيد/.test(v)) return "InTesting"
  if (/done|passed|complete|مكتمل|منجز/.test(v)) return "Covered"
  if (/fail|فشل/.test(v)) return "Failed"
  if (/block|hold|معلق|محظور/.test(v)) return "Blocked"
  if (/deprecat|obsolete|cancel|ملغي/.test(v)) return "Deprecated"
  return "Draft"
}

// Priority normalizer matching confirm/route.ts
function normalizePriority(raw: unknown): "Low" | "Medium" | "High" | "Critical" {
  const v = String(raw ?? "").trim().toLowerCase()
  if (!v) return "Medium"
  if (/critical|urgent|highest|p0|p1|حرج|عاجل/.test(v)) return "Critical"
  if (/high|p2|عالي|مرتفع/.test(v)) return "High"
  if (/low|minor|p4|p5|منخفض|ضعيف/.test(v)) return "Low"
  if (/medium|normal|moderate|p3|متوسط|عادي/.test(v)) return "Medium"
  return "Medium"
}

async function main() {
  const projectId = "edbf4c22-752f-4136-a13d-9f309a5bb33e"
  const importId = "8d8499b1-bd14-422e-abb1-dac3950703a8"

  console.log(`Starting recovery of requirements for project ${projectId}...`)

  const imp = await prisma.requirementImport.findUnique({
    where: { id: importId }
  })

  if (!imp || !imp.parsedItems) {
    console.error("Requirement import not found or has no parsed items.")
    return
  }

  const items = imp.parsedItems as any[]
  console.log(`Found ${items.length} items to restore.`)

  let restoredCount = 0
  let skippedCount = 0

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const key = (item.requirementKey || "").trim()
      if (!key) {
        skippedCount++
        continue
      }

      // Check if requirement already exists
      const existing = await tx.requirement.findFirst({
        where: { projectId, requirementKey: key }
      })

      if (existing) {
        skippedCount++
        continue
      }

      // Recreate requirement
      await tx.requirement.create({
        data: {
          projectId,
          requirementKey: key,
          title: (item.title || "").trim().substring(0, 255),
          description: item.description || null,
          acceptanceCriteria: Array.isArray(item.acceptanceCriteria) 
            ? item.acceptanceCriteria.join("\n") 
            : String(item.acceptanceCriteria || ""),
          priority: normalizePriority(item.priority),
          status: normalizeStatus(item.status),
          source: "ExcelImport",
          sourceImportId: importId,
        }
      })
      restoredCount++
    }
  })

  console.log(`Restore completed!`)
  console.log(`- Restored: ${restoredCount}`)
  console.log(`- Skipped (already exist or invalid): ${skippedCount}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
