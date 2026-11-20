import { useState } from 'react'
import { useMoov } from '../ui/context'
import { sports } from '../domain/model'
import type { User, Sport } from '../domain/model'
import { skillLevels } from '../domain/feedback'
import { BackTitle } from '../ui/common'
import { Manner, ReportButton } from './Conduct'
export function SportLevels() {
  const { user, act, busy } = useMoov()
  const [levels, setLevels] = useState<NonNullable<User['levels']>>({
    ...user.levels,
  })
  function change(sport: Sport, value: string) {
    const next = { ...levels }
    if (value) next[sport] = value as (typeof skillLevels)[number]
    else delete next[sport]
    setLevels(next)
  }
  return (
    <details className="panel optional-fields">
      <summary>나의 운동 레벨</summary>
      <p className="hint">
        종목별 자기평가예요. 필요할 때 다시 수정할 수 있어요.
      </p>
      {sports.map((s) => (
        <label key={s}>
          {s}
          <select
            value={levels[s] || ''}
            onChange={(e) => change(s, e.target.value)}
          >
            <option value="">미설정</option>
            {skillLevels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      ))}
      <button
        className="secondary full"
        disabled={busy}
        onClick={() =>
          void act({ type: 'setLevels', levels }, '운동 레벨을 저장했어요.')
        }
      >
        저장하기
      </button>
    </details>
  )
}
export function PublicProfile({ id }: { id: string }) {
  const { data, user } = useMoov()
  const p = data.users.find((u) => u.id === id)
  return (
    <div className="narrow">
      <BackTitle title="모집자 프로필" back="home" />
      {p && data.matches.some((m) => m.hostId === id) ? (
        <>
          <section className="panel">
            <h2>{p.name}</h2>
            <p>
              {p.dept} · {String(p.year).slice(-2)}학번
            </p>
            <Manner userId={p.id} />
          </section>
          <section className="panel">
            <h2>종목별 운동 레벨</h2>
            <p className="hint">회원이 직접 설정한 레벨이에요.</p>
            {sports.map((s) => (
              <p className="form-row" key={s}>
                {s}
                <strong>{p.levels?.[s] || '미설정'}</strong>
              </p>
            ))}
          </section>
          {id !== user.id && <ReportButton targetType="user" targetId={id} />}
        </>
      ) : (
        <p className="panel">모집자 정보를 찾을 수 없어요.</p>
      )}
    </div>
  )
}
