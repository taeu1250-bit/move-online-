import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
} from 'react'
import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
} from 'firebase/auth'
import type { ActionCodeSettings, Auth, User } from 'firebase/auth'
import { ProfileForm } from './ProfileForm'
import { App } from '../App'
import { onlineServices } from '../data/online'
import { Wordmark } from '../ui/common'
import { schoolEmail } from '../domain/matching'
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-brand">
        <div className="brand-center">
          <Wordmark />
          <span>MOVE TOGETHER</span>
        </div>
      </div>
      <section className="auth-form">
        <div className="campus-line">연세대학교 미래캠퍼스</div>
        {children}
      </section>
    </main>
  )
}
function errorText(error: unknown) {
  const code = (error as { code?: string })?.code
  if (!code)
    return error instanceof Error ? error.message : '연결을 확인해 주세요.'
  const messages: Record<string, string> = {
    'auth/invalid-credential': '이메일과 비밀번호를 확인해 주세요.',
    'auth/wrong-password': '이메일과 비밀번호를 확인해 주세요.',
    'auth/user-not-found': '이메일과 비밀번호를 확인해 주세요.',
    'auth/invalid-email': '학교 이메일 주소를 확인해 주세요.',
    'auth/user-disabled': '이 계정의 이용이 중지됐어요.',
    'auth/user-token-expired': '로그인이 만료됐어요. 다시 로그인해 주세요.',
    'auth/invalid-user-token': '로그인이 만료됐어요. 다시 로그인해 주세요.',
    'auth/unauthorized-continue-uri':
      '학교 메일 연결 설정을 확인하고 있어요. 잠시 뒤 다시 시도해 주세요.',
    'auth/operation-not-allowed':
      '학교 이메일 로그인을 사용할 수 없어요. 관리자에게 알려주세요.',
    'auth/password-does-not-meet-requirements':
      '비밀번호가 계정의 보안 조건을 충족하지 않아요. 길이와 문자 조합을 확인해 주세요.',
    'auth/email-already-in-use':
      '이미 사용 중인 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.',
    'auth/weak-password': '비밀번호를 조금 더 길게 입력해 주세요.',
    'auth/too-many-requests': '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  }
  return (
    messages[code] || '인증을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  )
}
function mailSettings(): ActionCodeSettings {
  const developmentSite =
    'https://moov-mirae-online-dev.jj04020985.chatgpt.site'
  const local =
    import.meta.env.MODE === 'emulator' &&
    location.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(location.hostname)
  return {
    url: (local ? location.origin : developmentSite) + '/',
    handleCodeInApp: false,
  }
}
function SignedIn({ auth, user }: { auth: Auth; user: User }) {
  const services = useMemo(
    () => onlineServices(user, () => signOut(auth)),
    [user, auth],
  )
  const state = useSyncExternalStore(
    services.matches.subscribe,
    services.matches.snapshot,
  )
  useEffect(() => {
    let active = true
    const refresh = () => {
      if (active && !document.hidden) void services.refresh()
    }
    refresh()
    const timer = setInterval(refresh, 20000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [services])
  const self = state.data?.users.find(
    (person) => person.id === state.data?.currentId,
  )
  if (!state.data || !self?.dept)
    return (
      <Frame>
        {state.needsProfile || (self && !self.dept) ? (
          <>
            <h1>내 프로필</h1>
            <ProfileForm initial={self} onSave={services.session.save} />
          </>
        ) : (
          <>
            <p role="status">
              {state.error || '내 프로필을 불러올 수 없어요.'}
            </p>
            <button
              className="secondary"
              onClick={() => void services.refresh()}
            >
              다시 불러오기
            </button>
          </>
        )}
        <button className="secondary" onClick={() => void signOut(auth)}>
          {state.error ? '다시 로그인' : '로그아웃'}
        </button>
      </Frame>
    )
  return <App services={services} />
}
function AccountGate({ auth }: { auth: Auth }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [mail, setMail] = useState(''),
    [pass, setPass] = useState(''),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const check = useRef<{ uid: string; result: Promise<boolean> } | null>(null)
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setVerified(!!u?.emailVerified)
        setPass('')
        setMsg('')
        if (!u) setMode('login')
      }),
    [auth],
  )
  const checkEmail = useCallback(
    async (account: User) => {
      if (auth.currentUser?.uid !== account.uid) return false
      const pending = check.current
      if (pending?.uid === account.uid) return pending.result
      const result = (async () => {
        await reload(account)
        if (auth.currentUser?.uid !== account.uid || !account.emailVerified)
          return false
        const token = await account.getIdTokenResult(true)
        if (
          auth.currentUser?.uid !== account.uid ||
          token.claims.email_verified !== true
        )
          return false
        setVerified(true)
        return true
      })()
      check.current = { uid: account.uid, result }
      try {
        return await result
      } finally {
        if (check.current?.result === result) check.current = null
      }
    },
    [auth],
  )
  useEffect(() => {
    if (!user || !schoolEmail(user.email || '') || verified) return
    let active = true
    const refresh = () => {
      if (document.hidden || auth.currentUser?.uid !== user.uid) return
      void checkEmail(user).catch((err) => {
        if (active && auth.currentUser?.uid === user.uid) setMsg(errorText(err))
      })
    }
    refresh()
    // Also catch mail verification that completes during an in-flight focus check.
    const verificationTimer = window.setInterval(refresh, 5000)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(verificationTimer)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [auth, user, verified, checkEmail])
  async function task(fn: () => Promise<void>) {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  if (user === undefined)
    return (
      <Frame>
        <p>로그인 상태를 확인하고 있어요.</p>
      </Frame>
    )
  if (user && !schoolEmail(user.email || ''))
    return (
      <Frame>
        <h1>학교 이메일 로그인</h1>
        <p>@yonsei.ac.kr 학교 계정으로 로그인해 주세요.</p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void task(() => signOut(auth))}
        >
          다른 계정으로 로그인
        </button>
        <p role="status">{msg}</p>
      </Frame>
    )
  if (user && verified)
    return <SignedIn key={user.uid} user={user} auth={auth} />
  if (user)
    return (
      <Frame>
        <h1>학교 메일을 확인해 주세요</h1>
        <p>{user.email}로 받은 메일의 인증 링크를 누른 뒤 돌아오세요.</p>
        <button
          className="primary full"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              if (
                !(await checkEmail(user)) &&
                auth.currentUser?.uid === user.uid
              )
                setMsg('아직 메일 확인 전이에요.')
            })
          }
        >
          인증 완료 확인
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              await sendEmailVerification(user, mailSettings())
              setMsg('인증 메일을 다시 보냈어요.')
            })
          }
        >
          인증 메일 다시 받기
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void task(() => signOut(auth))}
        >
          로그아웃
        </button>
        <p role="status">{msg}</p>
      </Frame>
    )
  const title =
    mode === 'login'
      ? '로그인'
      : mode === 'signup'
        ? '회원가입'
        : '비밀번호 재설정'
  return (
    <Frame>
      <h1>{title}</h1>
      <div className="segmented">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            className={m === mode ? 'sel' : ''}
            onClick={() => {
              setMode(m)
              setMsg('')
              setPass('')
            }}
          >
            {m === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void task(async () => {
            const email = mail.trim().toLowerCase()
            if (!schoolEmail(email))
              throw new Error('@yonsei.ac.kr 학교 이메일을 입력해 주세요.')
            if (mode === 'reset') {
              await sendPasswordResetEmail(auth, email, mailSettings())
              setMsg('등록된 계정이면 비밀번호 재설정 메일을 받을 수 있어요.')
              return
            }
            if (mode === 'login') {
              await signInWithEmailAndPassword(auth, email, pass)
              return
            }
            const { user: newUser } = await createUserWithEmailAndPassword(
              auth,
              email,
              pass,
            )
            await sendEmailVerification(newUser, mailSettings())
            setMsg('인증 메일을 보냈어요.')
          })
        }}
      >
        <label>
          학교 이메일
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="아이디@yonsei.ac.kr"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
          />
        </label>
        {mode !== 'reset' && (
          <label>
            비밀번호
            <input
              required
              type="password"
              minLength={mode === 'signup' ? 8 : 1}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
        )}
        <button className="primary full" disabled={busy}>
          {title}
        </button>
      </form>
      <button
        className="secondary"
        onClick={() => {
          setMode('reset')
          setPass('')
          setMsg('')
        }}
      >
        비밀번호 재설정
      </button>
      <p role="status">{msg}</p>
    </Frame>
  )
}
export function OnlineRoot() {
  const [auth, setAuth] = useState<Auth | null>(null),
    [msg, setMsg] = useState('인증 설정을 확인하고 있어요.')
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/config', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const { firebase } = await response.json()
        if (!firebase) {
          setMsg(
            '개발용 학교 이메일 인증을 준비 중이에요. 설정이 끝나면 로그인할 수 있어요.',
          )
          return
        }
        const apps = getApps()
        const app =
          apps.find(
            (candidate) =>
              candidate.options.projectId === firebase.projectId &&
              candidate.options.apiKey === firebase.apiKey &&
              candidate.options.appId === firebase.appId,
          ) ||
          initializeApp(
            firebase,
            apps.length ? 'moov-' + firebase.projectId : '[DEFAULT]',
          )
        const instance = initializeAuth(app, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        })
        if (
          import.meta.env.MODE === 'emulator' &&
          location.hostname === '127.0.0.1' &&
          firebase.projectId === 'demo-moov-dev' &&
          !instance.emulatorConfig
        ) {
          connectAuthEmulator(instance, 'http://127.0.0.1:9099', {
            disableWarnings: true,
          })
        }
        instance.languageCode = 'ko'
        setAuth(instance)
      } catch {
        setMsg(
          '서버에 연결할 수 없어요. 인터넷 연결을 확인한 뒤 다시 열어 주세요.',
        )
      }
    })()
  }, [])
  return auth ? (
    <AccountGate auth={auth} />
  ) : (
    <Frame>
      <h1>학교 이메일 로그인</h1>
      <p role="status">{msg}</p>
      <button className="secondary" onClick={() => location.reload()}>
        다시 확인
      </button>
    </Frame>
  )
}
