import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { MatchInfo } from '../domain/feedback'
import { formats, genders, matchLevels } from '../domain/feedback'
import type { Sport } from '../domain/model'
import { useMoov } from '../ui/context'
import './match-feedback.css'

type RosterRow = { key: string; name: string; userId: string | null }

export function useRoster(names: string[] = [], ids: (string | null)[] = []) {
  const [rows, setRows] = useState<RosterRow[]>(() =>
    names.map((name, i) => ({
      key: crypto.randomUUID(),
      name,
      userId: ids[i] ?? null,
    })),
  )
  return {
    rows,
    names: rows.map((row) => row.name.trim()),
    ids: rows.map((row) => row.userId),
    append: (name = '', userId: string | null = null) =>
      setRows((old) => [...old, { key: crypto.randomUUID(), name, userId }]),
    rename: (key: string, name: string) =>
      setRows((old) =>
        old.map((row) =>
          row.key === key && !row.userId ? { ...row, name } : row,
        ),
      ),
    remove: (key: string) =>
      setRows((old) => old.filter((row) => row.key !== key)),
  }
}

export function RosterFields({
  roster,
  representative,
  maxExtra,
  teamId,
}: {
  roster: ReturnType<typeof useRoster>
  representative: string
  maxExtra: number
  teamId?: string | null
}) {
  const { data } = useMoov(),
    team = data.teamHub?.owned.find(
      (t) => t.id === (teamId || data.teamHub?.activeTeamId),
    )
  const members =
    team?.members.filter(
      (m) =>
        m.status === 'accepted' && m.userId && !roster.ids.includes(m.userId),
    ) || []
  return (
    <fieldset className="roster-fields">
      <legend>
        함께 참가할 팀원 <span>{roster.rows.length + 1}명 요청</span>
      </legend>
      <div className="roster-fixed">
        {representative} <small>본인</small>
      </div>
      {roster.rows.map((row) => (
        <div className="roster-row" key={row.key}>
          <span>
            {row.name}
            {!row.userId ? ' · 과거 이름 기록' : ''}
          </span>
          <button
            className="roster-remove"
            type="button"
            onClick={() => roster.remove(row.key)}
          >
            <Trash2 size={17} />
            선택 해제
          </button>
        </div>
      ))}
      {team ? (
        <label>
          가입한 팀원 선택
          <select
            value=""
            disabled={roster.rows.length >= maxExtra}
            onChange={(e) => {
              const m = members.find((m) => m.userId === e.target.value)
              if (m?.userId) roster.append(m.name, m.userId)
            }}
          >
            <option value="">팀원 선택</option>
            {members.map((m) => (
              <option key={m.id} value={m.userId!}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="hint">
          개인회원은 본인만 신청해요. 팀 대표는 팀 설정에서 회원을 초대한 뒤
          선택할 수 있어요.
        </p>
      )}
      <p className="hint">
        팀원 본인의 경기 참가 동의와 모집자 승인이 모두 완료되면 확정돼요.
      </p>
    </fieldset>
  )
}

export function MatchInfoFields({
  sport,
  level,
  onLevel,
  info,
  onInfo,
}: {
  sport: Sport
  level: string
  onLevel: (level: string) => void
  info: MatchInfo
  onInfo: (info: MatchInfo) => void
}) {
  function set(key: keyof MatchInfo, value: string | number | undefined) {
    const next = { ...info }
    if (value === '' || value === undefined) delete next[key]
    else Object.assign(next, { [key]: value })
    onInfo(next)
  }
  const options = formats[sport]
  return (
    <>
      <div className="two">
        <label>
          참가 가능 성별
          <select
            value={info.gender ?? ''}
            onChange={(e) => set('gender', e.target.value)}
          >
            <option value="">미설정</option>
            {genders.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          운동 레벨
          <select value={level} onChange={(e) => onLevel(e.target.value)}>
            <option value="">미설정</option>
            {level && !matchLevels.some((v) => v === level) && (
              <option>{level}</option>
            )}
            {matchLevels.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {options && (
        <label>
          경기 방식
          <select
            value={info.format ?? ''}
            onChange={(e) => set('format', e.target.value)}
          >
            <option value="">미설정</option>
            {options.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      {sport === '풋살' && (
        <label>
          권장 신발
          <input
            value={info.shoes ?? ''}
            maxLength={40}
            placeholder="예: 풋살화·운동화"
            onChange={(e) => set('shoes', e.target.value)}
          />
        </label>
      )}
      {sport === '러닝' && (
        <div className="two">
          <label>
            러닝 거리 (km)
            <input
              type="number"
              min="0.01"
              max="1000"
              step="0.01"
              inputMode="decimal"
              value={info.distanceKm ?? ''}
              placeholder="예: 5"
              onChange={(e) =>
                set(
                  'distanceKm',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <label>
            목표 페이스 (분:초/km)
            <input
              maxLength={5}
              value={info.pace ?? ''}
              placeholder="예: 6:30"
              pattern="[0-9]{1,2}:[0-5][0-9]"
              onChange={(e) => set('pace', e.target.value)}
            />
          </label>
        </div>
      )}
      {sport === '헬스' && (
        <label>
          운동 목적 또는 부위
          <input
            value={info.goal ?? ''}
            maxLength={60}
            placeholder="예: 상체 근력 운동"
            onChange={(e) => set('goal', e.target.value)}
          />
        </label>
      )}
    </>
  )
}
