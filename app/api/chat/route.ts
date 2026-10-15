import { z } from 'zod'
import { requireTenantMember } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { answerQuestion } from '@/lib/agent'
import { apiError, assertSameOrigin, HttpError, noStoreJson, readJson } from '@/lib/http'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const chatSchema = z.object({
  tenantId: z.uuid(),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(2).max(4000)
}).strict()

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const parsed = chatSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT', '问题需为 2 到 4000 字。')
    const { tenantId, conversationId, message } = parsed.data
    const { user, supabase } = await requireTenantMember(tenantId)

    const { data: allowed, error: limitError } = await supabase.rpc('consume_rate_limit', {
      p_tenant_id: tenantId,
      p_action: 'chat'
    })
    if (limitError) throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', '暂时无法验证使用额度。')
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED', '提问过于频繁，请稍后再试。')

    let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (conversationError) throw conversationError
      if (!conversation) throw new HttpError(404, 'NOT_FOUND', '没有找到这段会话。')
      const { data: previous, error: historyError } = await supabase
        .from('messages')
        .select('role,content')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12)
      if (historyError) throw historyError
      history = (previous ?? []).reverse().filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content).slice(0, 2000) }))
    }

    await recordAudit({ tenantId, actorUserId: user.id, action: 'chat.request', targetType: 'conversation', targetId: conversationId ?? null })
    const reply = await answerQuestion({ tenantId, userId: user.id, question: message, history })
    if (!reply.trim()) throw new HttpError(502, 'EMPTY_ANSWER', '顾问未能生成回答，请稍后重试。')

    let finalConversationId = conversationId
    if (!finalConversationId) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ tenant_id: tenantId, user_id: user.id, title: message.slice(0, 48) })
        .select('id')
        .single()
      if (error || !data) throw new HttpError(503, 'SAVE_FAILED', '回答已生成，但暂时无法保存会话。')
      finalConversationId = data.id as string
    }
    const { error: saveUserError } = await supabase
      .from('messages')
      .insert({ conversation_id: finalConversationId, tenant_id: tenantId, user_id: user.id, role: 'user', content: message })
    if (saveUserError) throw new HttpError(503, 'SAVE_FAILED', '回答已生成，但暂时无法保存消息。')
    // The assistant role is server-only in RLS. Membership and conversation ownership
    // were checked above before using the service role for this single write.
    const { data: assistant, error: saveAssistantError } = await createAdminClient()
      .from('messages')
      .insert({ conversation_id: finalConversationId, tenant_id: tenantId, user_id: user.id, role: 'assistant', content: reply })
      .select('id,role,content,created_at')
      .single()
    if (saveAssistantError || !assistant) throw new HttpError(503, 'SAVE_FAILED', '回答已生成，但暂时无法保存消息。')
    return noStoreJson({ conversationId: finalConversationId, assistant })
  } catch (error) {
    return apiError(error)
  }
}
