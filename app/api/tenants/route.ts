import { requireUser } from '@/lib/auth'
import { apiError, noStoreJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, supabase } = await requireUser()
    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select('tenant_id,role')
      .eq('user_id', user.id)
    if (membershipError) throw membershipError
    const ids = (memberships ?? []).map((item) => item.tenant_id as string)
    if (ids.length === 0) return noStoreJson({ tenants: [] })
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id,name,created_at')
      .in('id', ids)
      .order('created_at', { ascending: true })
    if (tenantError) throw tenantError
    const roles = new Map((memberships ?? []).map((item) => [item.tenant_id, item.role]))
    return noStoreJson({ tenants: (tenants ?? []).map((tenant) => ({ ...tenant, role: roles.get(tenant.id) })) })
  } catch (error) {
    return apiError(error)
  }
}
