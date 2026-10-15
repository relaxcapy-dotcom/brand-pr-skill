'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/browser'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const isSignup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      const supabase = createClient()
      if (isSignup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (authError) throw authError
        if (!data.session) {
          setSuccess('账号已创建。请查看邮箱中的验证链接，验证后即可登录。')
          return
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      }
      router.replace('/dashboard')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作未完成，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-side">
        <Link className="brand-mark brand-mark-light" href="/"><span className="brand-glyph" aria-hidden="true">B<span>.</span></span><span>Brand PR Agent</span></Link>
        <div className="auth-side-copy"><span className="section-kicker">A BETTER QUESTION, A BETTER STRATEGY.</span><h1>让专业判断，<br />成为团队的日常。</h1><p>从事实到洞察，从策略到行动。把复杂的传播问题，变成清晰的下一步。</p></div>
        <div className="auth-side-bottom">品牌传播 · 媒体沟通 · 声誉管理</div>
      </div>
      <div className="auth-main">
        <div className="auth-top-link">{isSignup ? '已有账号？' : '还没有账号？'} <Link href={isSignup ? '/login' : '/signup'}>{isSignup ? '登录' : '创建账号'} ↗</Link></div>
        <div className="auth-form-wrap"><div className="auth-form-heading"><span className="section-kicker">{isSignup ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span><h2>{isSignup ? '开始一次更清晰的咨询。' : '欢迎回来。'}</h2><p>{isSignup ? '创建账号，即可在你的工作空间里开始提问。' : '登录后继续你的 PR 咨询和团队协作。'}</p></div>
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">工作邮箱</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 12 : undefined} required placeholder={isSignup ? '至少 12 位字符' : '输入密码'} value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {success && <p className="form-message form-success" role="status">{success}</p>}
            <button className="button button-accent auth-submit" type="submit" disabled={busy}>{busy ? '请稍候…' : isSignup ? '创建账号' : '登录'} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="auth-disclaimer">使用工作空间时，请仅分享已获授权的信息。AI 建议应由团队核实后用于对外沟通。</p>
        </div>
      </div>
    </main>
  )
}
