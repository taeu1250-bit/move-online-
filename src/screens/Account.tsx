import { Manner } from './Conduct'
import { TeamMode } from './Teams'
import { SportLevels } from './SportProfile'
import { PushSettings } from './PushSettings'
import { useState } from 'react'
import { ProfileForm } from './ProfileForm'
import { Bell, ChevronRight, GraduationCap, Smartphone } from 'lucide-react'
import type { User } from '../domain/model'
import { Avatar, BackTitle, Empty } from '../ui/common'
import { go, useMoov } from '../ui/context'
import { updateApp } from '../pwa'

function teamRole(user: User) {
  return user.team
    ? [user.team, user.teamSport, '팀 대표'].filter(Boolean).join(' · ')
    : '개인 참가자'
}

export function Profile() {
  const { data, user, services, run, busy } = useMoov()
  const [editing, setEditing] = useState(false)
  const [install, setInstall] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const joined = data.entries.filter(
    (e) =>
      e.userId === user.id &&
      e.status === 'approved' &&
      data.matches.some(
        (m) => m.id === e.matchId && Date.parse(m.start) > Date.now(),
      ),
  ).length
  const hosted = data.matches.filter((m) => m.hostId === user.id).length
  const pending = data.entries.filter(
    (e) => e.userId === user.id && e.status === 'pending',
  ).length
  const unread = data.notices.filter((n) => n.to === user.id && !n.read).length
  return (
    <div className="narrow">
      <h1>마이페이지</h1>
      <section className="panel">
        <div className="person-line">
          <Avatar name={user.name} />
          <div>
            <h2>
              {user.name} <span className="tag sport">학교 이메일 인증</span>
            </h2>
            <p>
              {user.dept} · {String(user.year).slice(-2)}학번
            </p>
          </div>
        </div>
        <div className="sub-line">
          <GraduationCap size={17} />
          {teamRole(user)}
        </div>
      </section>
      <div className="stats">
        {[
          ['참여 예정', data.activityCounts?.joined ?? joined],
          ['내가 모집', data.activityCounts?.hosted ?? hosted],
          ['승인 대기', data.activityCounts?.pending ?? pending],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <section className="panel menu">
        <h2>내 운동 관리</h2>
        <button onClick={() => go('activity')}>
          내 활동
          <ChevronRight />
        </button>
        <button onClick={() => go('exercise-history')}>
          운동한 기록 보기 <ChevronRight />
        </button>
        <button onClick={() => go('notices')}>
          <span>
            <Bell size={16} />앱 내부 알림
          </span>
          <b>
            {unread}건 <ChevronRight />
          </b>
        </button>
      </section>
      <Manner userId={user.id} />
      <SportLevels />
      <TeamMode />
      {data.pushPublicKey && <PushSettings />}
      <section className="panel menu">
        <h2>내 계정</h2>
        <button onClick={() => setEditing(!editing)}>
          프로필 수정 <ChevronRight />
        </button>
        {editing && (
          <ProfileForm
            initial={user}
            onSave={async (name, year, dept, skillLevel) => {
              await services.session.save(name, year, dept, skillLevel)
              setEditing(false)
            }}
          />
        )}
        <button
          onClick={async () => {
            if (await run(() => services.session.logout())) go('home')
          }}
        >
          로그아웃
          <ChevronRight />
        </button>
      </section>
      <section className="panel menu">
        <h2>앱 설정</h2>
        <button onClick={() => go('rules')}>
          이용 규칙 및 매너 가이드 <ChevronRight />
        </button>
        <button aria-expanded={install} onClick={() => setInstall(!install)}>
          <span>
            <Smartphone size={17} />홈 화면에 추가
          </span>
          <ChevronRight />
        </button>
        {install && (
          <div className="inline-help">
            <b>아이폰 · Safari</b>
            <p>공유 메뉴에서 ‘홈 화면에 추가’를 선택해요.</p>
            <b>안드로이드 · Chrome</b>
            <p>브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해요.</p>
            <p>
              휴대폰에서는 이 앱을 제공하는 신뢰된 HTTPS 주소로 접속해 주세요.
            </p>
            <button className="secondary full" disabled={updating} onClick={async () => {
              setUpdating(true); setUpdateError('')
              try { await updateApp() }
              catch (e) { setUpdateError(e instanceof Error ? e.message : '업데이트하지 못했어요. 연결을 확인해 주세요.'); setUpdating(false) }
            }}>{updating ? '업데이트 확인 중…' : '앱 업데이트'}</button>
            <p className="hint">최신 화면으로 다시 열어요. 로그인과 운동 기록은 유지돼요.</p>
            {updateError && <p role="alert">{updateError}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
export function Notices() {
  const { user, data, act, busy } = useMoov()
  const notes = data.notices.filter((n) => n.to === user.id)
  return (
    <div className="narrow">
      <BackTitle title="내 알림" back="profile" />
      {!!notes.length && <button className="secondary notice-clear" disabled={busy} onClick={() => {
        if (window.confirm('내 알림 내역을 모두 삭제할까요? 경기와 운동 기록은 유지돼요.')) void act({ type: 'clearNotices' }, '알림 내역을 모두 삭제했어요.')
      }}>알림 내역 전체삭제</button>}
      {notes.some((n) => !n.read) && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void act({ type: 'readNotices' }, '모두 읽음으로 표시했어요.')
          }
        >
          모두 읽음
        </button>
      )}
      {notes.length ? (
        notes.map((n) => (
          <a className="notice-item" href={'#/match/' + n.matchId} key={n.id}>
            <Bell size={17} />
            <div>
              <strong>{n.text}</strong>
              <small>
                {new Date(n.at).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })}
              </small>
            </div>
            {!n.read && <i aria-label="읽지 않음" />}
          </a>
        ))
      ) : (
        <Empty title="아직 도착한 알림이 없어요" />
      )}
    </div>
  )
}
