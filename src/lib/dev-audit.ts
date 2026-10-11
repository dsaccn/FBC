import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function logDevAction(options: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SQL_QUERY' | 'SEED' | 'RESET' | 'SYNC'
  targetTable: string
  recordId?: string
  previousState?: any
  newState?: any
  reason?: string
  ipAddress?: string
}) {
  try {
    const session = await getSession()
    const developerUsername = session?.username || 'SYSTEM_DEV'
    
    await prisma.devAuditLog.create({
      data: {
        developerUsername,
        action: options.action,
        targetTable: options.targetTable,
        recordId: options.recordId || null,
        previousState: options.previousState !== undefined ? JSON.stringify(options.previousState) : null,
        newState: options.newState !== undefined ? JSON.stringify(options.newState) : null,
        reason: options.reason || 'Developer portal action',
        ipAddress: options.ipAddress || null,
      }
    })
  } catch (err) {
    console.error('[DEV_AUDIT_LOG_ERROR]', err)
  }
}
