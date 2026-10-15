import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantMember } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { apiError, HttpError } from '@/lib/http'
import { encryptSecret } from '@/lib/connectors/crypto'
import { NOTION_OAUTH_COOKIE, notionCallbackUrl, notionClientId, notionDashboardUrl } from '@/lib/connectors/notion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') ?? ''
    const { user, supabase } = await requireTenantMember(tenantId, ['owner', 'admin'])
    const { data: allowed, error: limitError } = await supabase.rpc('consume_rate_limit', { p_tenant_id: tenantId, p_action: 'connector_oauth' })
    if (limitError) throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', '暂时无法验证操作频率。')
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED', '连接器操作过于频繁，请稍后再试。')
    let clientId: string
    try { clientId = notionClientId() } catch (error) {
      if (error instanceof HttpError && error.code === 'NOTION_NOT_CONFIGURED') {
        return NextResponse.redirect(notionDashboardUrl('unconfigured'))
      }
      throw error
    }
    const callback = notionCallbackUrl()
    await recordAudit({ tenantId, actorUserId: user.id, action: 'connector.oauth_started', targetType: 'connector', metadata: { provider: 'notion' } })
    const state = randomBytes(32).toString('base64url')
    const cookieValue = encryptSecret(JSON.stringify({
      state,
      tenantId,
      userId: user.id,
      issuedAt: Date.now()
    }), 'oauth:notion')

    const authorizationUrl = new URL('https://api.notion.com/v1/oauth/authorize')
    authorizationUrl.searchParams.set('owner', 'user')
    authorizationUrl.searchParams.set('client_id', clientId)
    authorizationUrl.searchParams.set('redirect_uri', callback)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('state', state)

    const response = NextResponse.redirect(authorizationUrl)
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.cookies.set(NOTION_OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      secure: new URL(callback).protocol === 'https:',
      sameSite: 'lax',
      path: '/api/connectors/notion/callback',
      maxAge: 600
    })
    return response
  } catch (error) {
    return apiError(error)
  }
}
