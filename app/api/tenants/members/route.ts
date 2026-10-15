import { z } from 'zod'
import { requireTenantMember } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { apiError, assertSameOrigin, HttpError, noStoreJson, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

const addMemberSchema = z.object({
  tenantId: z.uuid(),
  email: z.email().max(254),
  role: z.enum(['admin', 'member'])
}).strict()

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const parsed = addMemberSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT', '请填写有效的团队、邮箱和角色。')
    const { tenantId, email, role } = parsed.data
    const { user, supabase } = await requireTenantMember(tenantId, role === 'admin' ? ['owner'] : ['owner', 'admin'])
    const { data: allowed, error: limitError } = await supabase.rpc('consume_rate_limit', {
      p_tenant_id: tenantId,
      p_action: 'membership_change'
    })
    if (limitError) throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', '暂时无法验证使用额度。')
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED', '成员操作过于频繁，请稍后再试。')
    await recordAudit({ tenantId, actorUserId: user.id, action: 'membership.change_requested', targetType: 'membership', metadata: { role } })
    const { error } = await supabase.rpc('add_existing_member_by_email', {
      p_tenant_id: tenantId,
      p_email: email.toLowerCase(),
      p_role: role
    })
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'ALREADY_MEMBER', '此用户已在团队中。')
      if (error.code === '42501') throw new HttpError(403, 'FORBIDDEN', '你没有添加此成员的权限。')
      throw new HttpError(400, 'ADD_MEMBER_FAILED', '无法添加成员，请确认对方已注册。')
    }
    return noStoreJson({ ok: true }, 201)
  } catch (error) {
    return apiError(error)
  }
}
