import { ArrowLeft, Check, Clock3, MapPin, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  cardTitle,
  fmtDate,
  fmtTime,
  kindLabel,
  matchStatus,
  seats,
} from '../domain/model'
import type { Match, Sport } from '../domain/model'
import { go, useMoov } from './context'

export function Wordmark() {
  return (
    <span className="wordmark" aria-label="moov.">
      moov.
    </span>
  )
}
export function BackTitle({ title, back }: { title: string; back: string }) {
  return (
    <div className="page-title">
      <button className="icon-btn" aria-label="뒤로" onClick={() => go(back)}>
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
    </div>
  )
}
export function Empty({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <SearchX size={25} />
      <strong>{title}</strong>
      {children}
    </div>
  )
}
export function Tags({ m }: { m: Match }) {
  const { data } = useMoov()
  const status = matchStatus(data, m)
  return (
    <div className="tags">
      {m.operations?.lightning && (
        <span className="tag lightning">⚡ 번개 모집</span>
      )}
      <span className="tag sport">{m.sport}</span>
      <span className="tag">{kindLabel[m.kind]}</span>
      <span
        className={
          'status ' +
          (status === '모집 중'
            ? 'open'
            : status === '매칭 확정'
              ? 'matched'
              : '')
        }
      >
        {status === '모집 중' && <i />}
        {status}
      </span>
    </div>
  )
}
export function SportMark({ sport }: { sport: Sport }) {
  const symbols: Record<Sport, ReactNode> = {
    풋살: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4.7 3.4-1.8 5.5H9.1l-1.8-5.5L12 7Zm0 0V3m4.7 7.4 3.9-1.3m-5.7 6.8 2.5 3.4m-8.3-3.4-2.5 3.4m.7-8.9L3.4 9" />
      </>
    ),
    축구: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
        <path d="M12 5v14M3 9h3v6H3m18-6h-3v6h3" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    농구: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m5.5 5.5 13 13m-13 0 13-13M4 9c6 1 10-2 11-5m-6 16c1-6 5-10 11-11" />
      </>
    ),
    러닝: (
      <>
        <circle cx="16" cy="4.5" r="2" />
        <path d="m5 11 4-4 4 1 3 5h4M13 9l-3 6 4 3-1 4m-4-8-3 4H2" />
      </>
    ),
    헬스: (
      <>
        <path d="m8 16 8-8M6 18l-3-3m6 6-6-6m18-6-6-6m3 3 2-2m-16 16 2-2" />
        <path d="m4 12 8 8m0-16 8 8" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {symbols[sport]}
    </svg>
  )
}
export function MatchCard({ m, extra }: { m: Match; extra?: string }) {
  const { data } = useMoov()
  const origin = extra
    ? extra === '내 모집글'
      ? '?from=hosted'
      : '?from=activity'
    : ''
  const state = matchStatus(data, m)
  const open = ['모집 중', '경기 진행 가능'].includes(state)
  const showState = !open || m.kind === 'pickup'
  const availability = open ? m.capacity - seats(data, m) + '자리 남음' : state
  return (
    <a href={'#/match/' + m.id + origin} className="match-card">
      <div className="card-top">
        <span className="card-category">
          <SportMark sport={m.sport} />
          {m.sport}
          <span aria-hidden>·</span>
          {kindLabel[m.kind]}
        </span>
        {showState && (
          <span
            className={
              'status ' +
              (open ? 'open' : state === '매칭 확정' ? 'matched' : '')
            }
          >
            {availability}
          </span>
        )}
      </div>
      <h3>{cardTitle(data, m)}</h3>
      <div className="card-meta">
        <span>
          <Clock3 size={14} />
          {extra && fmtDate(m.start) + ' '}
          {fmtTime(m.start)}
        </span>
        <span>
          <MapPin size={14} />
          {m.venue}
        </span>
      </div>
      {extra && (
        <div className="mine-state">
          <Check size={13} />
          {extra}
        </div>
      )}
    </a>
  )
}
export function Avatar({ name }: { name: string }) {
  return <span className="avatar">{name.slice(-2)}</span>
}
