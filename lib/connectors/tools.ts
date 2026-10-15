import { HttpError } from '@/lib/http'
import { authorizedNotionFetch, authorizedNotionReadBlocks } from '@/lib/connectors/notion'
import { getConnectorStatuses, getCredential } from '@/lib/connectors/store'

type FunctionTool = {
  type: 'function'
  name: string
  description: string
  strict: true
  parameters: {
    type: 'object'
    properties: { query: { type: 'string', description: string } }
    required: ['query']
    additionalProperties: false
  }
}

const QUERY_PARAMETERS: FunctionTool['parameters'] = {
  type: 'object',
  properties: { query: { type: 'string', description: 'Search words; 2 to 240 characters.' } },
  required: ['query'],
  additionalProperties: false
}

/** The caller must verify tenant membership before exposing these tools to an AI request. */
export async function getConnectorTools(tenantId: string): Promise<FunctionTool[]> {
  const statuses = await getConnectorStatuses(tenantId)
  const connected = new Set(statuses.filter(status => status.connected).map(status => status.provider))
  const tools: FunctionTool[] = []
  if (connected.has('tavily')) {
    tools.push({
      type: 'function',
      name: 'tavily_search',
      description: 'Search the public web for current facts and return a few source links. Use only when recent external information is needed.',
      strict: true,
      parameters: QUERY_PARAMETERS
    })
  }
  if (connected.has('notion')) {
    tools.push({
      type: 'function',
      name: 'notion_search',
      description: 'Search titles of pages and data sources that this tenant has explicitly shared with its Notion connection.',
      strict: true,
      parameters: QUERY_PARAMETERS
    })
  }
  return tools
}

function parseQuery(args: unknown): string {
  let value = args
  if (typeof args === 'string') {
    if (args.length > 1_024) throw new HttpError(400, 'TOOL_ARGUMENT_INVALID', '搜索参数过长。')
    try { value = JSON.parse(args) } catch { throw new HttpError(400, 'TOOL_ARGUMENT_INVALID', '搜索参数无效。') }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('query' in value)
    || typeof value.query !== 'string') {
    throw new HttpError(400, 'TOOL_ARGUMENT_INVALID', '搜索参数无效。')
  }
  const query = value.query.trim()
  if (query.length < 2 || query.length > 240 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new HttpError(400, 'TOOL_ARGUMENT_INVALID', '搜索内容长度或字符无效。')
  }
  return query
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().slice(0, 2_000) : null
  } catch { return null }
}

function shortText(value: unknown, max = 900): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

async function tavilySearch(tenantId: string, query: string) {
  const credential = await getCredential(tenantId, 'tavily')
  if (!credential) throw new HttpError(409, 'TAVILY_NOT_CONNECTED', '此团队尚未连接 Tavily。')
  let response: Response
  try {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: 4,
        include_answer: false,
        include_raw_content: false
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000)
    })
  } catch {
    throw new HttpError(502, 'TAVILY_UNAVAILABLE', '暂时无法连接 Tavily。')
  }
  if (!response.ok) throw new HttpError(502, 'TAVILY_SEARCH_FAILED', '网页搜索暂时失败。')
  let data: unknown
  try { data = await response.json() } catch { throw new HttpError(502, 'TAVILY_BAD_RESPONSE', '搜索服务返回了无效响应。') }
  const results = data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)
    ? data.results : []
  return {
    provider: 'tavily',
    results: results.slice(0, 4).map((item: unknown) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        title: shortText(row.title, 180),
        url: safeUrl(row.url),
        summary: shortText(row.content),
        publishedDate: shortText(row.published_date, 40)
      }
    }).filter((item: { url: string | null }) => item.url)
  }
}

function notionTitle(row: Record<string, unknown>): string {
  const properties = row.properties && typeof row.properties === 'object' ? row.properties as Record<string, unknown> : {}
  const titleProperty = Object.values(properties).find(value => value && typeof value === 'object' && 'type' in value && value.type === 'title')
  const fromProperty = titleProperty && typeof titleProperty === 'object' && 'title' in titleProperty ? titleProperty.title : null
  const richText = Array.isArray(row.title) ? row.title : Array.isArray(fromProperty) ? fromProperty : []
  return richText.map((part: unknown) => part && typeof part === 'object' && 'plain_text' in part ? shortText(part.plain_text, 120) : '').join('').slice(0, 180)
}

async function notionSearch(tenantId: string, query: string) {
  const response = await authorizedNotionFetch(tenantId, { query, page_size: 8 })
  if (!response.ok) throw new HttpError(502, 'NOTION_SEARCH_FAILED', 'Notion 搜索暂时失败。')
  let data: unknown
  try { data = await response.json() } catch { throw new HttpError(502, 'NOTION_BAD_RESPONSE', 'Notion 返回了无效响应。') }
  const results = data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)
    ? data.results : []
  const found = results.slice(0, 8).map((item: unknown) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: shortText(row.id, 40),
      type: row.object === 'page' || row.object === 'data_source' ? row.object : 'unknown',
      title: notionTitle(row),
      url: safeUrl(row.url),
      lastEdited: shortText(row.last_edited_time, 40)
    }
  }).filter((item: { url: string | null }) => item.url)
  const excerpts = await Promise.allSettled(found.filter((item: { type: string }) => item.type === 'page').slice(0, 3)
    .map(async (item: { id: string }) => ({ id: item.id, excerpt: await notionPageExcerpt(tenantId, item.id) })))
  const excerptById = new Map(excerpts.filter((item): item is PromiseFulfilledResult<{ id: string, excerpt: string }> => item.status === 'fulfilled')
    .map((item) => [item.value.id, item.value.excerpt]))
  return {
    provider: 'notion',
    results: found.map((item: { id: string }) => ({ ...item, excerpt: excerptById.get(item.id) ?? '' }))
  }
}

async function notionPageExcerpt(tenantId: string, pageId: string): Promise<string> {
  const response = await authorizedNotionReadBlocks(tenantId, pageId)
  if (!response.ok) return ''
  const data: unknown = await response.json()
  const blocks = data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)
    ? data.results : []
  const lines = blocks.map((item: unknown) => {
    if (!item || typeof item !== 'object') return ''
    const row = item as Record<string, unknown>
    const block = typeof row.type === 'string' && row[row.type] && typeof row[row.type] === 'object'
      ? row[row.type] as Record<string, unknown> : {}
    const parts = Array.isArray(block.rich_text) ? block.rich_text : []
    return parts.map((part: unknown) => part && typeof part === 'object' && 'plain_text' in part
      ? shortText(part.plain_text, 500) : '').join('')
  }).filter(Boolean)
  return lines.join('\n').slice(0, 2_500)
}

/** The caller must verify tenant membership and enforce its own chat/tool rate limit first. */
export async function executeConnectorTool(tenantId: string, name: string, args: unknown): Promise<unknown> {
  const query = parseQuery(args)
  switch (name) {
    case 'tavily_search': return tavilySearch(tenantId, query)
    case 'notion_search': return notionSearch(tenantId, query)
    default: throw new HttpError(400, 'TOOL_NOT_ALLOWED', '不支持此工具。')
  }
}
