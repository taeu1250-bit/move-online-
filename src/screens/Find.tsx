import { useState } from 'react'
import { operationPolicy } from '../domain/operations'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react'
import {
  cardTitle,
  dateKey,
  fmtDate,
  kindLabel,
  shiftDay,
  sports,
  today,
} from '../domain/model'
import type { Kind, Sport } from '../domain/model'
import { Empty, MatchCard } from '../ui/common'
import { useMoov } from '../ui/context'

export function Find({ initialDate }: { initialDate: string | null }) {
  const { data } = useMoov()
  const [date, setDate] = useState(() => {
    if (
      initialDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(initialDate) &&
      Number.isFinite(Date.parse(initialDate + 'T12:00:00+09:00'))
    )
      return initialDate
    const next = [...data.matches]
      .filter((m) => Date.parse(m.start) > Date.now())
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    return next ? dateKey(next.start) : today()
  })
  const [query, setQuery] = useState('')
  const [sport, setSport] = useState<Sport | '전체'>('전체')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [sort, setSort] = useState<'time' | 'new'>('time')
  const keyDay = new Date(date + 'T12:00:00Z').getUTCDay()
  const monday = shiftDay(date, -((keyDay + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
  const sportingDays = new Set(data.matches.map((m) => dateKey(m.start)))
  const lightning = data.matches
    .filter((m) => m.operations?.lightning && !m.operations?.hidden)
    .sort((a, b) => a.start.localeCompare(b.start))
  const matches = data.matches
    .filter(
      (m) =>
        dateKey(m.start) === date &&
        !m.operations?.hidden &&
        !(
          m.cancelledAt &&
          Date.now() >=
            Date.parse(m.cancelledAt) +
              operationPolicy.hideCancelledMinutes * 60000
        ) &&
        (sport === '전체' || sport === m.sport) &&
        (kind === 'all' || m.kind === kind) &&
        [m.title, cardTitle(data, m), m.venue, m.sport, kindLabel[m.kind]]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'time'
        ? a.start.localeCompare(b.start)
        : b.createdAt.localeCompare(a.createdAt),
    )
  return (
    <div className="find-layout">
      <aside className="find-controls">
        <h1>경기 찾기</h1>
        <div className="search-box" role="search">
          <Search size={18} />
          <input
            aria-label="경기 검색"
            placeholder="종목, 팀, 장소, 모집글 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => setQuery('')}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <section className="calendar">
          <div className="row">
            <strong>
              <CalendarDays size={16} />
              {date.slice(0, 4)}년 {Number(date.slice(5, 7))}월
            </strong>
            <div className="week-buttons">
              <button
                aria-label="이전 주"
                onClick={() => setDate(shiftDay(date, -7))}
              >
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setDate(today())}>오늘</button>
              <button
                aria-label="다음 주"
                onClick={() => setDate(shiftDay(date, 7))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="days">
            {days.map((d, i) => (
              <button
                className={d === date ? 'active' : ''}
                key={d}
                aria-label={fmtDate(d)}
                aria-pressed={d === date}
                onClick={() => setDate(d)}
              >
                <span>{'월화수목금토일'[i]}</span>
                <b>{Number(d.slice(8))}</b>
                <i className={sportingDays.has(d) ? 'has' : ''} />
              </button>
            ))}
          </div>
        </section>
        <section className="filters">
          <h2 id="sport-filter-title">운동 종목</h2>
          <div
            className="chips filter-options sport-options"
            role="group"
            aria-labelledby="sport-filter-title"
          >
            {(['전체', ...sports] as const).map((s) => (
              <button
                aria-pressed={s === sport}
                key={s}
                onClick={() => setSport(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
        <section className="filters">
          <h2 id="kind-filter-title">모집 유형</h2>
          <div
            className="chips filter-options"
            role="group"
            aria-labelledby="kind-filter-title"
          >
            {(['all', 'pickup', 'friendly'] as const).map((type) => (
              <button
                aria-pressed={kind === type}
                key={type}
                onClick={() => setKind(type)}
              >
                {type === 'all' ? '전체' : kindLabel[type]}
              </button>
            ))}
          </div>
        </section>
      </aside>
      <section className="feed">
        {!!lightning.length && (
          <section className="lightning-list">
            <h2>⚡ 곧 시작하는 경기</h2>
            <div className="card-list">
              {lightning.map((m) => (
                <MatchCard key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}
        <div className="feed-heading">
          <div>
            <h2>{fmtDate(date)} 경기</h2>
            <span className="count">총 {matches.length}건</span>
          </div>
          <select
            aria-label="경기 정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="time">시간순</option>
            <option value="new">최신순</option>
          </select>
        </div>
        {matches.length ? (
          <div className="card-list">
            {matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <Empty title="선택한 조건의 경기가 없어요">
            <button
              className="secondary"
              onClick={() => {
                setQuery('')
                setKind('all')
                setSport('전체')
              }}
            >
              검색 조건 초기화
            </button>
          </Empty>
        )}
      </section>
    </div>
  )
}
