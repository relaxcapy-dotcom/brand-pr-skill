'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { apiError } from '@/components/api-client'

export type WorkspaceTenant = { id: string; name: string; role: string }

export function useWorkspace() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [tenants, setTenants] = useState<WorkspaceTenant[]>([])
  const [tenantId, setTenantId] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error: authError } = await createClient().auth.getUser()
        if (authError || !data.user) {
          router.replace('/login')
          return
        }
        if (!active) return
        setEmail(data.user.email ?? '')
        const response = await fetch('/api/tenants', { cache: 'no-store' })
        if (!response.ok) throw new Error(await apiError(response))
        const body = await response.json() as { tenants?: WorkspaceTenant[] }
        if (!active) return
        const list = body.tenants ?? []
        setTenants(list)
        const saved = window.localStorage.getItem('brand-pr-tenant')
        setTenantId(list.find((tenant) => tenant.id === saved)?.id ?? list[0]?.id ?? '')
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '无法加载工作空间。')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [router])

  function selectTenant(id: string) {
    if (id === tenantId || !tenants.some((tenant) => tenant.id === id)) return
    window.localStorage.setItem('brand-pr-tenant', id)
    window.location.reload()
  }

  async function signOut() {
    const { error: authError } = await createClient().auth.signOut()
    if (authError) {
      setError(authError.message)
      return
    }
    router.replace('/login')
    router.refresh()
  }

  return { loading, error, email, tenants, tenantId, selectTenant, signOut, role: tenants.find((item) => item.id === tenantId)?.role ?? '' }
}

type Workspace = ReturnType<typeof useWorkspace>

export function WorkspaceShell({ workspace, children, onNew }: { workspace: Workspace; children: ReactNode; onNew?: () => void }) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (workspace.loading) return <div className="workspace-loading"><span className="brand-glyph" aria-hidden="true">B<span>.</span></span><p>正在打开工作空间…</p></div>
  if (workspace.error) return <div className="workspace-loading"><span className="brand-glyph" aria-hidden="true">B<span>.</span></span><h1>工作空间暂时不可用</h1><p>{workspace.error}</p><button className="button button-dark" onClick={() => window.location.reload()}>重新尝试</button></div>
  if (!workspace.tenantId) return <div className="workspace-loading"><span className="brand-glyph" aria-hidden="true">B<span>.</span></span><h1>还没有工作空间</h1><p>你的账号尚未加入任何团队。请联系管理员，或重新注册以创建个人工作空间。</p><button className="text-button" onClick={() => void workspace.signOut()}>退出登录</button></div>

  return (
    <div className="workspace">
      <aside className={`workspace-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="sidebar-top"><Link className="brand-mark brand-mark-light" href="/"><span className="brand-glyph" aria-hidden="true">B<span>.</span></span><span>Brand PR Agent</span></Link><button className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="关闭菜单">×</button></div>
        <div className="sidebar-group-label">工作空间</div>
        <label className="tenant-picker-label" htmlFor="tenant-picker">当前团队</label>
        <select id="tenant-picker" className="tenant-picker" value={workspace.tenantId} onChange={(event) => workspace.selectTenant(event.target.value)}>{workspace.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>
        <nav className="sidebar-nav" aria-label="工作空间导航">
          <Link className={pathname === '/dashboard' ? 'active' : ''} href="/dashboard" onClick={() => setMobileNavOpen(false)}><span aria-hidden="true">◫</span> 咨询对话</Link>
          <Link className={pathname?.startsWith('/dashboard/connectors') ? 'active' : ''} href="/dashboard/connectors" onClick={() => setMobileNavOpen(false)}><span aria-hidden="true">◇</span> 服务连接</Link>
        </nav>
        {onNew && <button className="sidebar-new" onClick={() => { onNew(); setMobileNavOpen(false) }}><span aria-hidden="true">＋</span> 发起新咨询</button>}
        <div className="sidebar-spacer" />
        <div className="sidebar-method"><span>方法论提示</span><p>事实 → 影响 → 行动 → 沟通</p><small>处理敏感议题时，先核实事实。</small></div>
        <div className="sidebar-account"><div className="account-avatar">{workspace.email.slice(0, 1).toUpperCase() || 'U'}</div><div><strong title={workspace.email}>{workspace.email}</strong><span>{workspace.role === 'owner' ? '所有者' : workspace.role === 'admin' ? '管理员' : '成员'}</span></div><button onClick={() => void workspace.signOut()} title="退出登录" aria-label="退出登录">↗</button></div>
      </aside>
      {mobileNavOpen && <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setMobileNavOpen(false)} />}
      <div className="workspace-main"><div className="mobile-topbar"><button onClick={() => setMobileNavOpen(true)} aria-label="打开菜单">☰</button><span>Brand PR Agent</span><span /></div>{children}</div>
    </div>
  )
}
