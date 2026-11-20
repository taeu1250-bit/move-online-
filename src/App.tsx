import { Rules, MannerHistory, JoinTeam } from './screens/Operations'
import { Teams } from './screens/Teams'
import { MatchConduct } from './screens/Conduct'
import { PublicProfile } from './screens/SportProfile'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Bell,
  CalendarCheck2,
  CirclePlus,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import type { OnlineCommand as Command } from './data/contracts'
import type { Services } from './data/contracts'

import { Find } from './screens/Find'
import { Create } from './screens/Create'
import { Apply, Detail, Manage } from './screens/Match'
import { Activity, Notices, Profile } from './screens/Account'
import { Context, go } from './ui/context'
import { Empty, Wordmark } from './ui/common'
const nav = [
  { path: 'home', label: '경기 찾기', Icon: Search },
  { path: 'create', label: '모집하기', Icon: CirclePlus },
  { path: 'activity', label: '내 활동', Icon: CalendarCheck2 },
  { path: 'profile', label: '마이페이지', Icon: UserRound },
]
const route = () => window.location.hash.replace(/^#\/?/, '') || 'home'
function onRoute(fn: () => void) {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function App({ services }: { services: Services }) {
  const snapshot = useSyncExternalStore(
    services.matches.subscribe,
    services.matches.snapshot,
  )
  const path = useSyncExternalStore(onRoute, route)
  const [pathname, query] = path.split('?')
  const [view, id] = pathname.split('/')
  const params = new URLSearchParams(query)
  const [toast, setToast] = useState<{
    message: string
    error: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [, tick] = useState(0)
  const [splash, setSplash] = useState(!snapshot.data?.currentId)
  useEffect(() => {
    const timer = window.setTimeout(() => setSplash(false), 600)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path, snapshot.data?.currentId])
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(
        () => setToast(null),
        toast.error ? 7200 : 3200,
      )
      return () => clearTimeout(timer)
    }
  }, [toast])
  const run = useCallback(async (fn: () => Promise<void>, message?: string) => {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    try {
      await fn()
      if (message) setToast({ message, error: false })
      return true
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : '다시 시도해 주세요.',
        error: true,
      })
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }, [])
  const feedback = toast && (
    <div
      className={'toast ' + (toast.error ? 'error' : '')}
      role={toast.error ? 'alert' : 'status'}
    >
      {toast.message}
      <button aria-label="닫기" onClick={() => setToast(null)}>
        <X size={15} />
      </button>
    </div>
  )
  if (!snapshot.data) return null
  const data = snapshot.data
  const user = data.users.find((u) => u.id === data.currentId) ?? data.users[0]
  const act = (command: Command, message?: string) =>
    run(() => services.matches.execute(user.id, command), message)
  const m = data.matches.find((m) => m.id === id)
  const unread = data.notices.some((n) => n.to === user.id && !n.read)
  const detail = ['match', 'apply', 'manage', 'edit'].includes(view)
  function render() {
    if (detail && !m)
      return (
        <Empty title="이 경기를 찾을 수 없어요">
          <a className="secondary" href="#/home">
            경기 찾기
          </a>
        </Empty>
      )
    switch (view) {
      case 'join':
        return <JoinTeam token={id} />
      case 'rules':
        return <Rules />
      case 'manner-history':
        return <MannerHistory />
      case 'public':
        return <PublicProfile id={id} />
      case 'conduct':
        return <MatchConduct matchId={id} />
      case 'teams':
        return <Teams />
      case 'home':
        return <Find initialDate={params.get('day')} />
      case 'create':
        return <Create />
      case 'edit':
        return <Create match={m!} />
      case 'activity':
        return <Activity hosted={params.get('tab') === 'hosted'} />
      case 'profile':
        return <Profile />
      case 'notices':
        return <Notices />
      case 'match':
        return <Detail m={m!} origin={params.get('from')} />
      case 'apply':
        return <Apply m={m!} />
      case 'manage':
        return <Manage m={m!} />
      default:
        return (
          <Empty title="화면을 찾을 수 없어요">
            <a className="secondary" href="#/home">
              경기 찾기
            </a>
          </Empty>
        )
    }
  }
  const active = detail
    ? view === 'manage'
      ? 'activity'
      : 'home'
    : view === 'notices'
      ? 'profile'
      : view
  return (
    <Context.Provider value={{ data, user, services, busy, run, act }}>
      {splash ? (
        <div className="splash">
          <div className="brand-center">
            <Wordmark />
            <span>MOVE TOGETHER</span>
          </div>
        </div>
      ) : (
        <>
          <header className="topbar">
            <div className="bar-inner">
              <a className="brand-link" aria-label="뭅 경기 찾기" href="#/home">
                <Wordmark />
              </a>
              <span className="campus">미래캠퍼스</span>
              <div className="tools">
                <button
                  aria-label="내 알림"
                  className="icon-btn bell"
                  onClick={() => go('notices')}
                >
                  <Bell size={20} />
                  {unread && <i />}
                </button>
                <button
                  className="header-profile"
                  aria-label="내 프로필"
                  onClick={() => go('profile')}
                >
                  <UserRound size={16} />
                  <span>{user.name}</span>
                </button>
              </div>
            </div>
          </header>
          <main key={user.id + '-' + path} className="app-main">
            {render()}
          </main>
          <nav className="bottom-nav" aria-label="주요 메뉴">
            <div>
              {nav.map(({ path: p, label, Icon }) => (
                <a
                  key={p}
                  href={'#/' + p}
                  aria-current={active === p ? 'page' : undefined}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </nav>
        </>
      )}
      {feedback}
    </Context.Provider>
  )
}
