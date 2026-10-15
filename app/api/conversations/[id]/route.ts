import { z } from 'zod'
import { requireTenantMember } from '@/lib/auth'
import { apiError, HttpError, noStoreJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = new URL(request.url).searchParams.get('tenantId')
    const { id } = await context.params
    if (!tenantId || !z.uuid().safeParse(id).success) throw new HttpError(400, 'INVALID_INPUT', '会话或团队编号无效。')
    const { user, supabase } = await requireTenantMember(tenantId)
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id,tenant_id,user_id,title,created_at,updated_at')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (conversationError) throw conversationError
    if (!conversation) throw new HttpError(404, 'NOT_FOUND', '没有找到这段会话。')
    const { data: messages, error: messageError } = await supabase
      .from('messages')
      .select('id,role,content,created_at')
      .eq('conversation_id', id)
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100)
    if (messageError) throw messageError
    return noStoreJson({ conversation, messages: messages ?? [] })
  } catch (error) {
    return apiError(error)
  }
}
