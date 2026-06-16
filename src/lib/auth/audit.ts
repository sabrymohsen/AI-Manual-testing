import { prisma } from "@/lib/db"

export async function createAuditLog(params: {
  action: string
  details: string
  userId: string
  projectId?: string
  credentialId?: string
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      details: params.details,
      userId: params.userId,
      projectId: params.projectId,
      credentialId: params.credentialId,
    },
  })
}
