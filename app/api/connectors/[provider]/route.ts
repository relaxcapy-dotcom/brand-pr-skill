import { NextRequest } from 'next/server'
import { requireTenantMember } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { apiError, assertSameOrigin, HttpError, noStoreJson } from '@/lib/http'
import { deleteCredential, isConnectorProvider } from '@/lib/connectors/store'

export const runtime = 'nodejs'

export async function DELETE(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    assertSameOrigin(request)
    const { provider } = await context.params
    if (!isConnectorProvider(provider)) throw new HttpError(404, 'UNKNOWN_CONNECTOR', '不支持此连接器。')
    const tenantId = request.nextUrl.searchParams.get('tenantId') ?? ''
    const { user, supabase } = await requireTenantMember(tenantId, ['owner', 'admin'])
    const { data: allowed, error: limitError } = await supabase.rpc('consume_rate_limit', { p_tenant_id: tenantId, p_action: 'connector_oauth' })
    if (limitError) throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', '暂时无法验证操作频率。')
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED', '连接器操作过于频繁，请稍后再试。')
    await recordAudit({ tenantId, actorUserId: user.id, action: 'connector.disconnect_requested', targetType: 'connector', metadata: { provider } })
    await deleteCredential(tenantId, provider)
    return noStoreJson({ provider, connected: false })
  } catch (error) {
    return apiError(error)
  }
}
