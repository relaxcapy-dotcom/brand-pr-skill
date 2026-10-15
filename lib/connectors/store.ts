import { HttpError } from '@/lib/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'

export const CONNECTOR_PROVIDERS = ['tavily', 'notion'] as const
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number]

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return (CONNECTOR_PROVIDERS as readonly string[]).includes(value)
}

export type ConnectorStatus = {
  provider: ConnectorProvider
  connected: boolean
  connectedAt: string | null
  workspaceName: string | null
}

type CredentialRow = {
  id: string
  encrypted_secret: string
  metadata: Record<string, unknown> | null
  created_by: string | null
}

export async function getConnectorStatuses(tenantId: string): Promise<ConnectorStatus[]> {
  const { data, error } = await createAdminClient()
    .from('connector_credentials')
    .select('provider,metadata,created_at')
    .eq('tenant_id', tenantId)
  if (error) throw new HttpError(503, 'CONNECTOR_STORE_ERROR', '暂时无法读取连接器状态。')
  const rows = new Map((data ?? []).map(row => [row.provider, row]))
  return CONNECTOR_PROVIDERS.map(provider => {
    const row = rows.get(provider)
    const metadata = row?.metadata as Record<string, unknown> | null
    return {
      provider,
      connected: Boolean(row),
      connectedAt: row?.created_at ?? null,
      workspaceName: provider === 'notion' && typeof metadata?.workspace_name === 'string'
        ? metadata.workspace_name.slice(0, 100)
        : null
    }
  })
}

export async function getCredential(tenantId: string, provider: ConnectorProvider): Promise<{ id: string, secret: string, encryptedSecret: string, createdBy: string | null, metadata: Record<string, unknown> } | null> {
  const { data, error } = await createAdminClient()
    .from('connector_credentials')
    .select('id,encrypted_secret,metadata,created_by')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new HttpError(503, 'CONNECTOR_STORE_ERROR', '暂时无法读取连接器。')
  if (!data) return null
  const row = data as CredentialRow
  return {
    id: row.id,
    secret: decryptSecret(row.encrypted_secret, `${tenantId}:${provider}`),
    encryptedSecret: row.encrypted_secret,
    createdBy: row.created_by,
    metadata: row.metadata ?? {}
  }
}

export async function rotateNotionCredential(tenantId: string, previousEncryptedSecret: string, newSecret: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('connector_credentials')
    .update({
      encrypted_secret: encryptSecret(newSecret, `${tenantId}:notion`),
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'notion')
    .eq('encrypted_secret', previousEncryptedSecret)
    .select('id')
    .maybeSingle()
  if (error) throw new HttpError(503, 'CONNECTOR_STORE_ERROR', '暂时无法更新 Notion 凭证。')
  return Boolean(data)
}

export async function saveCredential(
  tenantId: string,
  provider: ConnectorProvider,
  secret: string,
  actorUserId: string,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from('connector_credentials')
    .upsert({
      tenant_id: tenantId,
      provider,
      encrypted_secret: encryptSecret(secret, `${tenantId}:${provider}`),
      metadata,
      created_by: actorUserId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,provider' })
    .select('id')
    .single()
  if (error || !data) throw new HttpError(503, 'CONNECTOR_STORE_ERROR', '暂时无法保存连接器。')
  return data.id as string
}

export async function deleteCredential(tenantId: string, provider: ConnectorProvider): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('connector_credentials')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .select('id')
    .maybeSingle()
  if (error) throw new HttpError(503, 'CONNECTOR_STORE_ERROR', '暂时无法移除连接器。')
  return (data?.id as string | undefined) ?? null
}
