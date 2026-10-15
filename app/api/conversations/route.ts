import { requireTenantMember } from '@/lib/auth'
import { apiError, HttpError, noStoreJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const tenantId = new URL(request.url).searchParams.get('tenantId')
    if (!tenantId) throw new HttpError(400, 'MISSING_TENANT', '请选择团队。')
    const { user, supabase } = await requireTenantMember(tenantId)
    const { data, error } = await supabase
      .from('conversations')
      .select('id,title,updated_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return noStoreJson({ conversations: data ?? [] })
  } catch (error) {
    return apiError(error)
  }
}
