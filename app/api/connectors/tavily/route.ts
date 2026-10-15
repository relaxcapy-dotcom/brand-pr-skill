import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireTenantMember } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { apiError, assertSameOrigin, HttpError, noStoreJson, readJson } from '@/lib/http'
import { saveCredential } from '@/lib/connectors/store'

export const runtime = 'nodejs'

const payloadSchema = z.strictObject({
  tenantId: z.uuid(),
  apiKey: z.string().min(16).max(512).regex(/^\S+$/)
})

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const parsed = payloadSchema.safeParse(await readJson(request, 2_048))
    if (!parsed.success) throw new HttpError(400, 'INVALID_CONNECTOR_INPUT', 'Tavily 密钥或团队编号无效。')
    const { tenantId, apiKey } = parsed.data
    const { user, supabase } = await requireTenantMember(tenantId, ['owner', 'admin'])
    const { data: allowed, error: limitError } = await supabase.rpc('consume_rate_limit', { p_tenant_id: tenantId, p_action: 'connector_oauth' })
    if (limitError) throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', '暂时无法验证操作频率。')
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED', '连接器操作过于频繁，请稍后再试。')
    await recordAudit({ tenantId, actorUserId: user.id, action: 'connector.connect_requested', targetType: 'connector', metadata: { provider: 'tavily' } })
    await saveCredential(tenantId, 'tavily', apiKey, user.id)
    return noStoreJson({ provider: 'tavily', connected: true })
  } catch (error) {
    return apiError(error)
  }
}
