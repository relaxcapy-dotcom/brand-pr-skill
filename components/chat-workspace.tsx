'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { apiError, formatShortDate } from '@/components/api-client'
import { useWorkspace, WorkspaceShell } from '@/components/workspace-shell'

type Conversation = { id: string; title: string; updated_at: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

const suggestions = [
  { eyebrow: '传播策略', text: '我们准备发布新产品，怎样找到有新闻价值的传播角度？' },
  { eyebrow: '危机应对', text: '品牌受到负面质疑，前 24 小时应该先做什么？' },
  { eyebrow: '媒体沟通', text: '请帮我评估这条消息是否值得向媒体提案。' },
]

function RichText({ content }: { content: string }) {
  const blocks = content.trim().split(/\n\s*\n/)
  return <div className="answer-text">{blocks.map((block, index) => {
    const lines = block.split('\n')
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>)}</ul>
    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return <ol key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>)}</ol>
    if (lines.length === 1 && /^#{1,3}\s+/.test(block)) return <h3 key={index}>{inline(block.replace(/^#{1,3}\s+/, ''))}</h3>
    return <p key={index}>{lines.map((line, i) => <span key={i}>{i > 0 && <br />}{inline(line)}</span>)}</p>
  })}</div>
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)
}

export function ChatWorkspace() {
  const workspace = useWorkspace()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workspace.tenantId) return
    const controller = new AbortController()
    setConversationId('')
    setMessages([])
    setConversations([])
    setLoadError('')
    fetch(`/api/conversations?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<{ conversations?: Conversation[] }>
      })
      .then((body) => setConversations(body.conversations ?? []))
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : '无法加载历史咨询。') })
    return () => controller.abort()
  }, [workspace.tenantId])

  useEffect(() => {
    if (!workspace.tenantId || !conversationId) return
    const controller = new AbortController()
    setLoadingConversation(true)
    setLoadError('')
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response))
        return response.json() as Promise<{ messages?: Message[] }>
      })
      .then((body) => setMessages(body.messages ?? []))
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : '无法加载这次咨询。') })
      .finally(() => { if (!controller.signal.aborted) setLoadingConversation(false) })
    return () => controller.abort()
  }, [workspace.tenantId, conversationId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  function newConversation() {
    if (busy) return
    setConversationId('')
    setMessages([])
    setDraft('')
    setLoadError('')
    setSendError('')
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const message = draft.trim()
    if (!message || busy || !workspace.tenantId) return
    if (message.length < 2) {
      setSendError('请至少输入 2 个字，再发送问题。')
      return
    }
    setDraft('')
    setSendError('')
    const tempId = `pending-${crypto.randomUUID()}`
    setMessages((current) => [...current, { id: tempId, role: 'user', content: message, created_at: new Date().toISOString() }])
    setBusy(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: workspace.tenantId, ...(conversationId ? { conversationId } : {}), message }),
      })
      if (!response.ok) throw new Error(await apiError(response))
      const body = await response.json() as { conversationId?: string; assistant?: Message }
      if (!body.conversationId || !body.assistant?.content) throw new Error('服务返回的咨询结果不完整，请稍后重试。')
      setMessages((current) => [...current, body.assistant!])
      if (!conversationId) setConversationId(body.conversationId)
      try {
        const listResponse = await fetch(`/api/conversations?tenantId=${encodeURIComponent(workspace.tenantId)}`, { cache: 'no-store' })
        if (listResponse.ok) {
          const list = await listResponse.json() as { conversations?: Conversation[] }
          setConversations(list.conversations ?? [])
        }
      } catch {
        // The saved reply is still visible even when history refresh fails.
      }
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== tempId))
      setDraft(message)
      setSendError(cause instanceof Error ? cause.message : '咨询未完成，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return <WorkspaceShell workspace={workspace} onNew={newConversation}>
    <div className="chat-layout">
      <aside className="history-panel"><div className="history-heading"><span>咨询记录</span><button onClick={newConversation} disabled={busy} aria-label="发起新咨询">＋</button></div><div className="history-list">{conversations.length ? conversations.map((conversation) => <button key={conversation.id} className={`history-item ${conversation.id === conversationId ? 'selected' : ''}`} disabled={busy} onClick={() => { setConversationId(conversation.id); setSendError('') }}><span>{conversation.title || '新咨询'}</span><small>{formatShortDate(conversation.updated_at)}</small></button>) : <p className="history-empty">你的咨询记录会显示在这里。</p>}</div></aside>
      <div className="chat-main">
        <div className="chat-header"><div><span className="chat-header-kicker">YOUR PR ADVISOR</span><h1>{conversationId ? conversations.find((item) => item.id === conversationId)?.title || '咨询对话' : '新的咨询'}</h1></div><span className="chat-header-status"><i /> 顾问在线</span><select className="mobile-history" aria-label="选择咨询记录" value={conversationId} disabled={busy} onChange={(event) => { if (event.target.value) setConversationId(event.target.value); else newConversation() }}><option value="">新咨询</option>{conversations.map((item) => <option value={item.id} key={item.id}>{item.title || '咨询对话'}</option>)}</select></div>
        <div className="chat-scroll">
          {loadError && <div className="inline-alert" role="alert">{loadError}</div>}
          {loadingConversation ? <div className="conversation-loading">正在读取咨询记录…</div> : messages.length === 0 && !busy ? <div className="chat-welcome"><div className="welcome-symbol">✳</div><span className="section-kicker">GOOD STRATEGY STARTS HERE</span><h2>你好，今天想解决什么传播问题？</h2><p>描述你的目标、背景和已知事实。我会根据品牌公关工作流，帮你分析局面并给出可执行的建议。</p><div className="suggestion-grid">{suggestions.map((suggestion) => <button key={suggestion.eyebrow} onClick={() => setDraft(suggestion.text)}><span>{suggestion.eyebrow}</span><strong>{suggestion.text}</strong><b aria-hidden="true">↗</b></button>)}</div></div> : <div className="message-list">{messages.map((message) => <article className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`} key={message.id}><div className="message-avatar">{message.role === 'user' ? '我' : 'B'}</div><div className="message-content"><div className="message-author">{message.role === 'user' ? '你' : 'Brand PR 顾问'}</div>{message.role === 'user' ? <p>{message.content}</p> : <RichText content={message.content} />}</div></article>)}{busy && <div className="thinking-row"><span className="thinking-dots"><i /><i /><i /></span>顾问正在分析你的问题…</div>}<div ref={endRef} /></div>}
        </div>
        <div className="composer-wrap">{sendError && <div className="inline-alert" role="alert">{sendError}</div>}<form className="composer" onSubmit={(event) => void submit(event)}><label className="sr-only" htmlFor="chat-message">输入你的公关问题</label><textarea id="chat-message" placeholder="描述你的传播问题、目标与已知事实…" rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} disabled={busy || !workspace.tenantId} /><div className="composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><button type="submit" disabled={!draft.trim() || busy}>{busy ? '分析中…' : '发送问题'} <span aria-hidden="true">↗</span></button></div></form><p className="composer-note">AI 可能出错。对外发布前，请核对事实、来源和专业判断。</p></div>
      </div>
    </div>
  </WorkspaceShell>
}
