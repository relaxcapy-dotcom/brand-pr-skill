export async function apiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string }
    if (typeof body.error === 'string' && body.error) return body.error
    if (typeof body.message === 'string' && body.message) return body.message
  } catch {
    // Fall back to a stable message when a gateway does not return JSON.
  }
  if (response.status === 401) return '登录已失效，请重新登录。'
  if (response.status === 403) return '你没有访问此工作空间的权限。'
  if (response.status === 429) return '请求过于频繁，请稍后再试。'
  return `请求未完成（${response.status}），请稍后重试。`
}

export function formatShortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}
