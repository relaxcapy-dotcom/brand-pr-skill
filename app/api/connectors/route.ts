import { NextRequest } from 'next/server'
import { requireTenantMember } from '@/lib/auth'
import { apiError, noStoreJson } from '@/lib/http'
import { getConnectorStatuses } from '@/lib/connectors/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') ?? ''
    await requireTenantMember(tenantId)
    return noStoreJson({ connectors: await getConnectorStatuses(tenantId) })
  } catch (error) {
    return apiError(error)
  }
}
