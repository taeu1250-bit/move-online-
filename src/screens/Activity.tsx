import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { mergeMatchData, type ActivityPage } from '../data/contracts'
import { statusLabel } from '../domain/model'
import { BackTitle, Empty, MatchCard } from '../ui/common'
import { Context, go, useMoov } from '../ui/context'
import { ConductActivity } from './Conduct'
import { useLivePoll } from '../ui/useLivePoll'

export function Activity({ hosted = false, history = false }: { hosted?: boolean; history?: boolean }) {
  const context = useMoov()
  const { data, user, services } = context
  const [tab, setTab] = useState<'joined' | 'hosted'>(hosted ? 'hosted' : 'joined')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [page, setPage] = useState<ActivityPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0), lock = useRef(false), pages = useRef(1)
  const fetchPage = useCallback(async (cursor?: string, preservePages = false, quiet = false) => {
    if (!services.activity || lock.current) return
    const ticket = ++requestId.current
    lock.current = true; if (!quiet) setLoading(true)
    try {
      let next = await services.activity(tab, tab === 'hosted' ? 'all' : filter, cursor, history ? 'history' : 'current')
      if (preservePages) {
        for (let i = 1; i < pages.current && next.nextCursor; i++) {
          const part = await services.activity(tab, tab === 'hosted' ? 'all' : filter, next.nextCursor, history ? 'history' : 'current')
          next = { data: mergeMatchData(next.data, part.data), items: [...next.items, ...part.items], nextCursor: part.nextCursor }
        }
      }
      if (ticket !== requestId.current) return
      setPage(previous => cursor && previous ? {
        data: mergeMatchData(previous.data, next.data),
        items: [...new Map([...previous.items, ...next.items].map(item => [item.id, item])).values()],
        nextCursor: next.nextCursor,
      } : next)
      if (cursor) pages.current++
      setError('')
    } catch (e) {
      if (ticket === requestId.current) setError(e instanceof Error ? e.message : '기록을 불러올 수 없어요.')
    } finally {
      if (ticket === requestId.current) { setLoading(false); lock.current = false }
    }
  }, [services, tab, filter, history])
  useEffect(() => {
    requestId.current++; lock.current = false; pages.current = 1
    setPage(null); setLoading(true)
    return () => { requestId.current++; lock.current = false }
  }, [fetchPage, user.id])
  const refreshActivity = useCallback(async () => { await fetchPage(undefined, true, true) }, [fetchPage])
  useLivePoll(refreshActivity, history ? 60_000 : 15_000)
  // Whole-app data updates must not reset pagination, scroll, or the loading UI.
  const activityData = page ? mergeMatchData(data, page.data) : data
  const rows = page?.items.flatMap(item => {
    const m = page.data.matches.find(m => m.id === item.id)
    return m ? [{ m, state: item.status }] : []
  }) || []
  return <div className="narrow">
    {history ? <BackTitle title="운동한 기록" back="profile" /> : <h1>내 활동</h1>}
    <div className="segmented">
      {(['joined', 'hosted'] as const).map(t => <button key={t} className={t === tab ? 'sel' : ''} onClick={() => setTab(t)}>
        {history ? (t === 'hosted' ? '모집한 경기' : '신청한 경기') : (t === 'hosted' ? '내가 모집' : '내가 신청')}
      </button>)}
    </div>
    <div className="activity-tools">
      <p className="hint">{history ? '지난 경기와 취소·신청 기록을 확인해요.' : '예정·진행 중 경기와 종료 후 24시간 이내 활동이에요.'}</p>
      <button className="icon-btn" aria-label="활동 새로고침" disabled={loading} onClick={() => void fetchPage(undefined, true)}><RefreshCw size={20} /></button>
    </div>
    {tab === 'joined' && !history && <div className="chips small">
      {(['all','pending','approved'] as const).map(f => <button key={f} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : statusLabel[f]}</button>)}
    </div>}
    <Context.Provider value={{ ...context, data: activityData }}><div className="card-list">
      {rows.map(({m,state}) => <MatchCard key={m.id} m={m} extra={tab === 'hosted' ? '내 모집글' : state ? statusLabel[state] : undefined} origin={history ? 'history-' + tab : undefined} />)}
    </div></Context.Provider>
    {loading && <p role="status">활동 기록을 불러오고 있어요.</p>}
    {error && <p role="alert">{error}</p>}
    {(page?.nextCursor || error) && <button className="secondary activity-more" disabled={loading} onClick={() => void fetchPage(page?.nextCursor || undefined)}>
      {loading ? '불러오는 중…' : error ? '다시 불러오기' : history ? '지난 기록 더보기' : '활동 더보기'}
    </button>}
    {!rows.length && !loading && !error && <Empty title={history ? '아직 지난 기록이 없어요' : tab === 'hosted' ? '예정된 모집 경기가 없어요' : '예정된 참가 활동이 없어요'}>
      {!history && <button className="secondary" onClick={() => go(tab === 'hosted' ? 'create' : 'home')}>{tab === 'hosted' ? '경기 모집하기' : '경기 찾기'}</button>}
    </Empty>}
    {!history && <><a className="secondary full activity-more" href="#/exercise-history">운동한 기록 보기</a><Context.Provider value={{...context, data: activityData}}><ConductActivity /></Context.Provider></>}
  </div>
}
