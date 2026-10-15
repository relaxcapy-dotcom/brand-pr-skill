import { requireTenantMember } from '@/lib/auth'
import { apiError, HttpError, noStoreJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const tenantId = new URL(request.url).searchParams.get('tenantId')
    if (!tenantId) throw new HttpError(400, 'MISSING_TENANT', '请选择团队。')
    const { supabase } = await requireTenantMember(tenantId, ['owner', 'admin'])
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id,action,target_type,target_id,metadata,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error
    return noStoreJson({ events: data ?? [] })
  } catch (error) {
    return apiError(error)
  }
}
