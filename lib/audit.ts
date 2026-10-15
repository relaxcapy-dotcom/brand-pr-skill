import { HttpError } from '@/lib/http'
import { createAdminClient } from '@/lib/supabase/admin'

type AuditEvent = {
  tenantId: string
  actorUserId: string
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export async function recordAudit(event: AuditEvent) {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_logs').insert({
      tenant_id: event.tenantId,
      actor_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId ?? null,
      metadata: event.metadata ?? {}
    })
    if (error) throw error
  } catch {
    throw new HttpError(503, 'AUDIT_UNAVAILABLE', '审计记录暂时不可用，请稍后重试。')
  }
}
