import { configuredAppOrigin, HttpError } from '@/lib/http'
import { getCredential, rotateNotionCredential } from '@/lib/connectors/store'

const NOTION_OAUTH_TOKEN_URL = 'https://api.notion.com/v1/oauth/token'
export const NOTION_VERSION = '2026-03-11'
export const NOTION_OAUTH_COOKIE = 'brand_pr_notion_oauth'

export type NotionTokens = { access_token: string, refresh_token: string }
type NotionTokenResponse = NotionTokens & {
  bot_id?: string
  workspace_id?: string
  workspace_name?: string | null
}

function notionCredentials() {
  const id = process.env.NOTION_CLIENT_ID
  const secret = process.env.NOTION_CLIENT_SECRET
  if (!id || !secret) throw new HttpError(503, 'NOTION_NOT_CONFIGURED', 'Notion 授权尚未配置。')
  return { id, secret }
}

export function notionClientId(): string {
  return notionCredentials().id
}

export function notionCallbackUrl(): string {
  return new URL('/api/connectors/notion/callback', configuredAppOrigin()).toString()
}

export function notionDashboardUrl(status?: string): URL {
  const url = new URL('/dashboard/connectors', notionCallbackUrl())
  if (status) url.searchParams.set('notion', status)
  return url
}

export async function exchangeNotionToken(payload: Record<string, string>): Promise<NotionTokenResponse> {
  const { id, secret } = notionCredentials()
  let response: Response
  try {
    response = await fetch(NOTION_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    throw new HttpError(502, 'NOTION_UNAVAILABLE', '暂时无法连接 Notion。')
  }
  if (!response.ok) throw new HttpError(502, 'NOTION_TOKEN_FAILED', 'Notion 授权失败，请重试。')
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new HttpError(502, 'NOTION_TOKEN_INVALID', 'Notion 返回了无效的授权响应。')
  }
  if (!data || typeof data !== 'object' || !('access_token' in data) || !('refresh_token' in data)
    || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string'
    || !data.access_token || !data.refresh_token) {
    throw new HttpError(502, 'NOTION_TOKEN_INVALID', 'Notion 返回了无效的授权响应。')
  }
  return data as NotionTokenResponse
}

async function authorizedNotionRequest(tenantId: string, url: string, body?: Record<string, unknown>): Promise<Response> {
  const credential = await getCredential(tenantId, 'notion')
  if (!credential) throw new HttpError(409, 'NOTION_NOT_CONNECTED', '此团队尚未连接 Notion。')
  let tokens: NotionTokens
  try {
    tokens = JSON.parse(credential.secret) as NotionTokens
  } catch {
    throw new HttpError(503, 'NOTION_CREDENTIAL_INVALID', 'Notion 凭证无法读取。')
  }
  if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
    throw new HttpError(503, 'NOTION_CREDENTIAL_INVALID', 'Notion 凭证无法读取。')
  }
  const request = (accessToken: string) => fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000)
  })

  try {
    let response = await request(tokens.access_token)
    if (response.status !== 401) return response

    // Another request may have already rotated this refresh token. Re-read first.
    const current = await getCredential(tenantId, 'notion')
    if (!current) throw new HttpError(409, 'NOTION_NOT_CONNECTED', '此团队尚未连接 Notion。')
    if (current.secret !== credential.secret) {
      const latest = JSON.parse(current.secret) as NotionTokens
      return await request(latest.access_token)
    }
    const refreshed = await exchangeNotionToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
    const rotated = await rotateNotionCredential(tenantId, credential.encryptedSecret, JSON.stringify({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token
    }))
    const token = rotated ? refreshed.access_token : (JSON.parse((await getCredential(tenantId, 'notion'))?.secret ?? '{}') as NotionTokens).access_token
    if (!token) throw new HttpError(503, 'NOTION_CREDENTIAL_INVALID', 'Notion 凭证无法读取。')
    response = await request(token)
    return response
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'NOTION_UNAVAILABLE', '暂时无法连接 Notion。')
  }
}

export function authorizedNotionFetch(tenantId: string, body: Record<string, unknown>): Promise<Response> {
  return authorizedNotionRequest(tenantId, 'https://api.notion.com/v1/search', body)
}

export function authorizedNotionReadBlocks(tenantId: string, blockId: string): Promise<Response> {
  if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(blockId)) {
    throw new HttpError(400, 'INVALID_NOTION_PAGE', 'Notion 页面编号无效。')
  }
  return authorizedNotionRequest(
    tenantId,
    `https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children?page_size=20`
  )
}
