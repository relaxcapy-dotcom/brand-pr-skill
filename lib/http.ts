import { NextResponse } from 'next/server'

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('API request failed', error instanceof Error ? error.name : 'unknown')
  return NextResponse.json({ error: '服务暂时不可用，请稍后重试。', code: 'INTERNAL_ERROR' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function configuredAppOrigin() {
  const configured = process.env.APP_URL
  if (!configured) throw new HttpError(503, 'APP_URL_NOT_CONFIGURED', '应用网址尚未配置。')
  let url: URL
  try { url = new URL(configured) } catch {
    throw new HttpError(503, 'APP_URL_INVALID', '应用网址配置无效。')
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new HttpError(503, 'APP_URL_INVALID', '应用网址必须使用 HTTPS。')
  }
  return url.origin
}

export function assertSameOrigin(request: Request) {
  const expected = configuredAppOrigin()
  const origin = request.headers.get('origin')
  if (!origin || origin !== expected) {
    throw new HttpError(403, 'BAD_ORIGIN', '请求来源无效。')
  }
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'CONTENT_TYPE', '请使用 JSON 请求。')
  }
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过长。')
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过长。')
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求格式无效。')
  }
}
