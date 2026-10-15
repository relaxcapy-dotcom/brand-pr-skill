import { z } from 'zod'
import { HttpError } from '@/lib/http'
import { createClient } from '@/lib/supabase/server'

export const uuidSchema = z.uuid()
export type TenantRole = 'owner' | 'admin' | 'member'

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new HttpError(401, 'UNAUTHENTICATED', '请先登录。')
  return { user, supabase }
}

export async function requireTenantMember(tenantId: string, roles?: TenantRole[]) {
  if (!uuidSchema.safeParse(tenantId).success) throw new HttpError(400, 'INVALID_TENANT', '团队编号无效。')
  const { user, supabase } = await requireUser()
  const { data, error } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new HttpError(503, 'MEMBERSHIP_CHECK_FAILED', '暂时无法验证团队权限。')
  if (!data) throw new HttpError(403, 'FORBIDDEN', '你没有访问此团队的权限。')
  const role = data.role as TenantRole
  if (roles && !roles.includes(role)) throw new HttpError(403, 'FORBIDDEN', '你没有执行此操作的权限。')
  return { user, supabase, role }
}
