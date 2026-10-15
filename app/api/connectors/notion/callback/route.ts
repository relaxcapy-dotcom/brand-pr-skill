import { NextRequest, NextResponse } from 'next/server'
import { requireTenantMember } from '@/lib/auth'
import { constantTimeEqual, decryptSecret } from '@/lib/connectors/crypto'
import { saveCredential } from '@/lib/connectors/store'
import { NOTION_OAUTH_COOKIE, exchangeNotionToken, notionCallbackUrl, notionDashboardUrl } from '@/lib/connectors/notion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OAuthState = { state: string, tenantId: string, userId: string, issuedAt: number }

function finish(status: string) {
  const response = NextResponse.redirect(notionDashboardUrl(status))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.cookies.set(NOTION_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: new URL(notionCallbackUrl()).protocol === 'https:',
    sameSite: 'lax',
    path: '/api/connectors/notion/callback',
    maxAge: 0
  })
  return response
}

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get(NOTION_OAUTH_COOKIE)?.value
    const states = request.nextUrl.searchParams.getAll('state')
    if (!cookie || states.length !== 1) return finish('error')
    let saved: OAuthState
    try { saved = JSON.parse(decryptSecret(cookie, 'oauth:notion')) as OAuthState } catch { return finish('error') }
    if (!saved || typeof saved.state !== 'string' || typeof saved.tenantId !== 'string'
      || typeof saved.userId !== 'string' || typeof saved.issuedAt !== 'number'
      || !constantTimeEqual(saved.state, states[0])
      || Date.now() - saved.issuedAt < 0 || Date.now() - saved.issuedAt > 600_000) {
      return finish('error')
    }
    const { user } = await requireTenantMember(saved.tenantId, ['owner', 'admin'])
    if (user.id !== saved.userId) return finish('error')
    if (request.nextUrl.searchParams.has('error')) return finish('cancelled')
    const codes = request.nextUrl.searchParams.getAll('code')
    if (codes.length !== 1 || codes[0].length < 1 || codes[0].length > 2_048) return finish('error')

    const token = await exchangeNotionToken({
      grant_type: 'authorization_code',
      code: codes[0],
      redirect_uri: notionCallbackUrl()
    })
    await saveCredential(saved.tenantId, 'notion', JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token
    }), user.id, {
      workspace_id: typeof token.workspace_id === 'string' ? token.workspace_id.slice(0, 100) : null,
      workspace_name: typeof token.workspace_name === 'string' ? token.workspace_name.slice(0, 100) : null,
      bot_id: typeof token.bot_id === 'string' ? token.bot_id.slice(0, 100) : null
    })
    return finish('connected')
  } catch {
    // Do not expose authorization codes, tokens or upstream response details in URLs or logs.
    return finish('error')
  }
}
