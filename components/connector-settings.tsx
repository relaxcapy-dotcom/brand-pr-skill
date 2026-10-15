'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { apiError } from '@/components/api-client'
import { useWorkspace, WorkspaceShell } from '@/components/workspace-shell'

type Connector = { provider: string; connected: boolean; connected_at?: string | null }
type AuditEvent = { id: string; action: string; target_type: string; created_at: string }

export function ConnectorSettings() {
  const workspace = useWorkspace()
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'member' | 'admin'>('member')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const canManage = workspace.role === 'owner' || workspace.role === 'admin'

  useEffect(() => {
    if (!workspace.tenantId) return
    const controller = new AbortController()
    setLoading(true)
    setConnectors([])
    setError('')
    fetch(`/api/connectors?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<{ connectors?: Connector[] }>
      })
      .then((body) => setConnectors(body.connectors ?? []))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '无法加载连接状态。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [workspace.tenantId])

  useEffect(() => {
    if (!workspace.tenantId || !canManage) return
    const controller = new AbortController()
    fetch(`/api/audit?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ events?: AuditEvent[] }> : { events: [] })
      .then((body) => { if (!controller.signal.aborted) setAuditEvents(body.events ?? []) })
      .catch(() => { /* Audit history remains unavailable if the server is temporarily offline. */ })
    return () => controller.abort()
  }, [workspace.tenantId, canManage])

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const oauthError = query.get('error')
    if (oauthError) setError(oauthError)
    const notion = query.get('notion')
    if (notion === 'connected') setNotice('Notion 已连接。')
    if (notion === 'unconfigured') setError('Notion OAuth 尚未配置，请联系管理员。')
    if (notion === 'cancelled') setNotice('已取消 Notion 授权。')
    if (notion === 'error') setError('Notion 授权未完成，请重试。')
  }, [])

  function isConnected(provider: string) {
    return connectors.some((item) => item.provider === provider && item.connected)
  }

  async function refreshConnectors() {
    const response = await fetch(`/api/connectors?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(await apiError(response))
    const body = await response.json() as { connectors?: Connector[] }
    setConnectors(body.connectors ?? [])
  }

  async function refreshAudit() {
    if (!canManage) return
    try {
      const response = await fetch(`/api/audit?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store' })
      if (!response.ok) return
      const body = await response.json() as { events?: AuditEvent[] }
      setAuditEvents(body.events ?? [])
    } catch {
      // A failed audit refresh does not reverse a completed connector/member action.
    }
  }

  async function connectTavily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiKey.trim() || busy || !canManage) return
    setBusy('tavily')
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/connectors/tavily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: workspace.tenantId, apiKey: apiKey.trim() }) })
      if (!response.ok) throw new Error(await apiError(response))
      setApiKey('')
      setNotice('Tavily 已连接。密钥仅在服务端保存。')
      await refreshConnectors()
      await refreshAudit()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '连接失败，请重试。')
    } finally {
      setBusy('')
    }
  }

  async function disconnect(provider: string) {
    if (busy || !canManage) return
    setBusy(provider)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/connectors/${encodeURIComponent(provider)}?tenantId=${encodeURIComponent(workspace.tenantId)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await apiError(response))
      await refreshConnectors()
      await refreshAudit()
      setNotice(`${provider === 'notion' ? 'Notion' : provider === 'tavily' ? 'Tavily' : provider} 已断开。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '断开连接失败，请重试。')
    } finally {
      setBusy('')
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memberEmail.trim() || busy || !canManage) return
    setBusy('member')
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/tenants/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: workspace.tenantId, email: memberEmail.trim(), role: memberRole }) })
      if (!response.ok) throw new Error(await apiError(response))
      setMemberEmail('')
      setNotice('成员已添加。')
      await refreshAudit()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加成员失败，请重试。')
    } finally {
      setBusy('')
    }
  }

  return <WorkspaceShell workspace={workspace}>
    <div className="settings-page">
      <div className="settings-header"><div><span className="section-kicker">WORKSPACE SETTINGS</span><h1>让你的顾问连接更多信息。</h1><p>按团队授权外部服务。连接由工作空间管理员管理，成员只能使用已获授权的能力。</p></div><div className="settings-header-icon" aria-hidden="true">◇</div></div>
      {(error || notice) && <div className={`settings-notice ${error ? 'settings-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
      <div className="settings-section-heading"><div><span className="section-kicker">01 / INTEGRATIONS</span><h2>服务连接</h2></div><p>外部服务由团队单独授权，状态仅对当前工作空间有效。</p></div>
      {loading ? <div className="settings-loading">正在读取连接状态…</div> : <div className="integration-grid">
        <section className="integration-card"><div className="integration-card-top"><div className="integration-logo notion-logo">N</div><span className={`connection-pill ${isConnected('notion') ? 'connected' : ''}`}>{isConnected('notion') ? '已连接' : '未连接'}</span></div><h3>Notion</h3><p>通过 OAuth 授权指定的知识页面，让顾问在工作空间权限范围内参考团队资料。</p><div className="integration-footer">{isConnected('notion') ? <button className="text-button danger-text" disabled={!canManage || !!busy} onClick={() => void disconnect('notion')}>{busy === 'notion' ? '处理中…' : '断开连接'}</button> : <button className="outline-button" disabled={!canManage || !!busy} onClick={() => { window.location.assign(`/api/connectors/notion/start?tenantId=${encodeURIComponent(workspace.tenantId)}`) }}>授权 Notion <span aria-hidden="true">↗</span></button>}</div></section>
        <section className="integration-card"><div className="integration-card-top"><div className="integration-logo tavily-logo">T</div><span className={`connection-pill ${isConnected('tavily') ? 'connected' : ''}`}>{isConnected('tavily') ? '已连接' : '未连接'}</span></div><h3>Tavily</h3><p>为需要最新公开信息的研究与舆情问题提供网页检索能力。密钥通过服务端加密保存。</p><form onSubmit={(event) => void connectTavily(event)} className="integration-form"><label htmlFor="tavily-key">团队 API Key</label><div><input id="tavily-key" type="password" autoComplete="off" placeholder={isConnected('tavily') ? '输入新密钥以更换' : '输入 Tavily API Key'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={!canManage || !!busy} /><button className="outline-button" type="submit" disabled={!canManage || !!busy || !apiKey.trim()}>{busy === 'tavily' ? '保存中…' : isConnected('tavily') ? '更换密钥' : '连接'}</button></div></form>{isConnected('tavily') && <button className="text-button danger-text integration-disconnect" disabled={!canManage || !!busy} onClick={() => void disconnect('tavily')}>断开连接</button>}</section>
      </div>}
      {!canManage && <p className="permission-note">只有工作空间所有者或管理员可以添加、更新或断开服务连接。</p>}
      <div className="settings-section-heading team-heading"><div><span className="section-kicker">02 / PEOPLE & ACCESS</span><h2>团队权限</h2></div><p>把已注册的同事加入当前工作空间，按角色管理访问权限。</p></div>
      <div className="team-card"><div><h3>添加已注册成员</h3><p>同事需先注册账号。成员可使用咨询和已授权的连接器；所有者可以指定管理员。</p></div><form onSubmit={(event) => void addMember(event)} className="team-form"><label className="sr-only" htmlFor="member-email">成员邮箱</label><input id="member-email" type="email" autoComplete="off" placeholder="同事的注册邮箱" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} disabled={!canManage || !!busy} required /><label className="sr-only" htmlFor="member-role">成员角色</label><select id="member-role" value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'member' | 'admin')} disabled={!canManage || !!busy}><option value="member">成员</option>{workspace.role === 'owner' && <option value="admin">管理员</option>}</select><button className="button button-dark" type="submit" disabled={!canManage || !!busy || !memberEmail.trim()}>{busy === 'member' ? '处理中…' : '添加成员'}</button></form></div>
      {canManage && <><div className="settings-section-heading team-heading"><div><span className="section-kicker">03 / AUDIT</span><h2>最近操作</h2></div><p>仅所有者与管理员可查看。</p></div><div className="team-card" style={{ display: 'block' }}><ul>{auditEvents.length ? auditEvents.map((event) => <li key={event.id}><strong>{event.action}</strong> · {event.target_type} · {new Date(event.created_at).toLocaleString('zh-CN')}</li>) : <li>暂无可显示的审计记录。</li>}</ul></div></>}
      <div className="settings-security-note"><span aria-hidden="true">✳</span><p>所有连接都绑定当前工作空间。请只授权业务必需的数据。使用 Notion 资料回答时，相关页面摘录会发送给 AI 服务。</p></div>
    </div>
  </WorkspaceShell>
}
