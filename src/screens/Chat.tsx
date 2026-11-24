import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Megaphone, RefreshCw, Send, Flag } from 'lucide-react'
import { chatPolicy as P, chatReportReasons } from '../domain/chat'
import type { ChatAction, ChatRoom } from '../domain/chat'
import type { Match } from '../domain/model'
import { useMoov } from '../ui/context'
import { BackTitle } from '../ui/common'
import './chat.css'
import { createLivePoll } from '../data/live'

export function ChatLink({ m }: { m: Match }) {
  const { user, data, services } = useMoov()
  const permitted = m.hostId === user.id || (m.operations
    ? m.operations.participants.some(p => p.userId === user.id && p.approved && p.consent === 'accepted')
    : data.entries.some(e => e.matchId === m.id && e.status === 'approved' && (e.userId === user.id || e.memberIds?.includes(user.id))))
  const start = m.operations ? m.operations.startedAt : Date.parse(m.start)
  if (!services.chat || !permitted || m.cancelledAt || (start && Date.now() >= start + P.hoursAfterStart * 3600000)) return null
  return <a className="secondary full chat-entry" href={'#/chat/' + m.id}><MessageCircle size={20} /> 경기 채팅 <span>모집자 · 확정 참가자</span></a>
}

export function Chat({ matchId }: { matchId: string }) {
  const { services, user } = useMoov()
  const chat = services.chat
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [reason, setReason] = useState<string>(chatReportReasons[0])
  const [editing, setEditing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const nonce = useRef({ body: '', id: '' })
  const refresh = useRef<() => Promise<void>>(async () => {})
  const alive = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const actionLock = useRef(false)

  useEffect(() => {
    const root = document.documentElement, viewport = window.visualViewport
    const fit = () => {
      root.style.setProperty('--chat-viewport-height', (viewport?.height || window.innerHeight) + 'px')
      root.dataset.chatKeyboard = String(!!viewport && window.innerHeight - viewport.height > 120)
    }
    fit(); viewport?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)
    return () => { viewport?.removeEventListener('resize', fit); window.removeEventListener('resize', fit); root.style.removeProperty('--chat-viewport-height'); delete root.dataset.chatKeyboard }
  }, [])

  useEffect(() => {
    alive.current = true
    let version = 0, current: ChatRoom | null = null
    let disposed = false, blocked = false
    const clearContent = () => { current = null; setRoom(null) }
    const poll = createLivePoll(async () => {
      const mine = version
      if (!chat || blocked) return
      if (!current) setLoading(true)
      try {
        const next = await chat.read(matchId, current?.messages.at(-1)?.seq || 0)
        if (disposed || version !== mine || document.hidden) return
        const changed = !current || next.messages.length > 0 || next.announcement !== current.announcement || next.hostId !== current.hostId || next.closesAt !== current.closesAt
        const merged = new Map((current?.messages || []).map(m => [m.seq, m]))
        next.messages.forEach(m => merged.set(m.seq, m))
        current = { ...next, messages: next.closed ? [] : [...merged.values()].sort((a, b) => a.seq - b.seq).slice(-P.recentMessages) }
        setRoom(current); setError('')
        if (next.closed) {
          blocked = true; poll.pause()
          setDraft(''); setAnnouncement(''); setEditing(false); setReporting(false)
          nonce.current = { body: '', id: '' }
        }
        return changed
      } catch (e) {
        if (disposed || version !== mine) return
        const status = (e as { status?: number }).status
        if (status && [401, 403, 404].includes(status)) {
          clearContent(); blocked = true; poll.pause()
          setDraft(''); setAnnouncement(''); setEditing(false); setReporting(false)
        }
        setError(status && [401, 403, 404].includes(status) && e instanceof Error ? e.message : '연결을 다시 시도하고 있어요. 작성 중인 메시지는 유지돼요.')
        throw e
      } finally { if (!disposed && version === mine) setLoading(false) }
    }, P.refreshMs)
    const pause = () => { ++version; poll.pause() }
    const resume = () => {
      if (document.hidden || !navigator.onLine) pause()
      else if (!blocked) poll.resume()
    }
    const offline = () => { pause(); setError('인터넷 연결이 끊겼어요. 연결되면 자동으로 다시 받아요.') }
    refresh.current = async () => { if (!document.hidden && navigator.onLine && !blocked) await poll.refresh() }
    resume()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pagehide', pause)
    window.addEventListener('pageshow', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', offline)
    return () => {
      disposed = true; alive.current = false; ++version; poll.dispose()
      current = null; nonce.current = { body: '', id: '' }
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', offline)
    }
  }, [chat, matchId])

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [room?.messages.at(-1)?.seq])
  useEffect(() => {
    if (!room?.closesAt || room.closed) return
    const timer = window.setTimeout(() => {
      setRoom(r => r && {...r, closed:true, messages:[], announcement:null, canPost:false, canManage:false, canReport:false})
      setDraft(''); setAnnouncement(''); setEditing(false); setReporting(false)
      void refresh.current()
    }, Math.min(2147483647, Math.max(0, room.closesAt - Date.now())))
    return () => clearTimeout(timer)
  }, [room?.closesAt, room?.closed])

  async function send(action: ChatAction, success?: string) {
    if (!chat || actionLock.current) return
    actionLock.current = true; setSending(true); setError(''); setNotice('')
    try {
      await chat.send(action)
      if (!alive.current) return
      if (action.type === 'send') { setDraft(''); nonce.current = { body: '', id: '' } }
      if (action.type === 'announce') { setEditing(false); setAnnouncement('') }
      if (action.type === 'report') setReporting(false)
      if (success) setNotice(success)
      await refresh.current()
    } catch (e) {
      if (alive.current) {
        await refresh.current()
        setError(e instanceof Error ? e.message : '다시 시도해 주세요.')
      }
    } finally { actionLock.current = false; if (alive.current) setSending(false) }
  }
  function sendMessage() {
    const body = draft.trim()
    if (!body) return
    if (nonce.current.body !== body) nonce.current = { body, id: crypto.randomUUID() }
    void send({ type: 'send', matchId, body, nonce: nonce.current.id })
  }
  if (!chat) return <div className="narrow"><BackTitle title="경기 채팅" back={'match/' + matchId} /><p>이 환경에서는 채팅을 사용할 수 없어요.</p></div>
  return <div className="narrow chat-page">
    <div className="chat-top">
    <BackTitle title="경기 채팅" back={'match/' + matchId} />
    <div className="chat-heading"><div><h2>{room?.title || '함께 운동하기 전'}</h2><p className="hint">모집자와 확정 참가자만 대화해요.</p></div>
      <button className="icon-btn" aria-label="채팅 새로고침" disabled={loading || sending} onClick={() => void refresh.current()}><RefreshCw size={20} /></button>
    </div>
    <p className="info-note chat-policy">실제 경기 시작 {P.hoursAfterStart}시간 뒤 채팅이 종료돼요. 경기 취소 시에는 바로 닫혀요.</p>
    {room?.closesAt && !room.closed && <p className="hint chat-deadline">채팅 종료: {new Date(room.closesAt).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p>}
    {error && <p role="alert" className="info-note">{error}</p>}
    {notice && <p role="status" className="info-note">{notice}</p>}
    </div>
    {room?.closed ? <section className="panel chat-closed"><MessageCircle size={36} /><h2>채팅이 종료됐어요</h2><p>대화와 공지는 삭제되어 다시 볼 수 없어요.</p><a className="secondary" href={'#/match/' + matchId}>경기로 돌아가기</a></section> : room ? <>
      <div className="chat-options">
      {room.moderation && <p className="info-note">운영자 신고 검토 · 읽기 전용</p>}
      {room.announcement && <section className="panel chat-pin"><strong><Megaphone size={18} /> 모집자 공지</strong><p>{room.announcement}</p></section>}
      <div className="chat-actions">
        {room.canManage && <button className="secondary" onClick={() => { setAnnouncement(room.announcement || ''); setEditing(v => !v); setReporting(false) }}>공지 {room.announcement ? '수정' : '작성'}</button>}
        {room.canReport && <button className="secondary" onClick={() => { setReporting(v => !v); setEditing(false) }}><Flag size={16} /> 채팅방 신고</button>}
        {room.reported && <span className="hint">신고 접수 완료</span>}
      </div>
      {editing && room.canManage && <form className="panel stack" onSubmit={e => { e.preventDefault(); void send({ type: 'announce', matchId, body: announcement }, '공지를 저장했어요.') }}><label>모집자 공지<textarea maxLength={P.maxLength} value={announcement} onChange={e => setAnnouncement(e.target.value)} /></label><small>내용을 비워 저장하면 공지가 삭제돼요.</small><button className="primary" disabled={sending}>공지 저장</button></form>}
      {reporting && room.canReport && <form className="panel stack" onSubmit={e => { e.preventDefault(); void send({ type: 'report', matchId, reason }, '운영자에게 신고를 접수했어요.') }}><label>신고 사유<select value={reason} onChange={e => setReason(e.target.value)}>{chatReportReasons.map(r => <option key={r}>{r}</option>)}</select></label><p className="hint">대화 원문은 신고에 저장하지 않아요. 채팅 종료 후에는 원문 확인이 어려워요. 신고만으로 제재하지 않고 운영자가 검토해요.</p><button className="primary" disabled={sending}>신고 접수</button></form>}
      </div>
      <div className="chat-messages" ref={list} role="log" aria-label="경기 채팅 메시지" aria-live="polite" aria-relevant="additions">
        {!room.messages.length && <p className="chat-empty">만날 장소나 준비물을 이야기해 보세요.</p>}
        {room.messages.map(m => <article key={m.seq} className={'chat-message ' + (m.senderId === user.id ? 'mine' : '')}><div className="chat-sender">{m.name}{m.senderId === room.hostId && <span>모집자</span>}</div><p>{m.body}</p><time dateTime={new Date(m.at).toISOString()}>{new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></article>)}
      </div>
      {room.canPost && <form className="chat-compose" onSubmit={e => { e.preventDefault(); sendMessage() }}><label className="sr-only" htmlFor="chat-message">메시지</label><textarea id="chat-message" rows={3} maxLength={P.maxLength} placeholder="메시지를 입력해 주세요" value={draft} disabled={sending} onChange={e => setDraft(e.target.value)} /><button className="primary" aria-label="메시지 보내기" disabled={sending || !draft.trim()}><Send size={20} /></button><small>{draft.length}/{P.maxLength} · 텍스트만 보낼 수 있어요</small></form>}
    </> : <p className="hint">{loading ? '채팅을 불러오고 있어요…' : '새로고침으로 다시 확인할 수 있어요.'}</p>}
  </div>
}
