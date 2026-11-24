import { useState } from 'react'
import { operationPolicy } from '../domain/operations'
import { fromKoreanInput, toKoreanInput, shiftEndInput } from '../domain/schedule'
import { SportPicker } from '../ui/SportPicker'
import { Check, Plus, Minus, Trophy, UserRound } from 'lucide-react'
import {
  canRepresentSport,
  dateKey,
  seats,
  shiftDay,
  sports,
  today,
  venues,
  validVenue,
  kindLabel,
} from '../domain/model'
import type { Kind, Match, Sport } from '../domain/model'
import {
  formats,
  rosterError,
  validEndAt,
  validMatchInfo,
} from '../domain/feedback'
import type { MatchInfo } from '../domain/feedback'
import { MatchInfoFields, RosterFields, useRoster } from './MatchFields'
import { uid } from '../domain/matching'
import { BackTitle } from '../ui/common'
import { useMoov, go } from '../ui/context'

function Stepper({
  label,
  value,
  min,
  max,
  change,
}: {
  label: string
  value: number
  min: number
  max: number
  change: (n: number) => void
}) {
  return (
    <div className="form-row">
      <span>{label}</span>
      <div className="stepper">
        <button
          type="button"
          aria-label={label + ' 줄이기'}
          disabled={value <= min}
          onClick={() => change(value - 1)}
        >
          <Minus size={16} />
        </button>
        <strong>{value}명</strong>
        <button
          type="button"
          aria-label={label + ' 늘리기'}
          disabled={value >= max}
          onClick={() => change(value + 1)}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}
export function Create({ match }: { match?: Match }) {
  const { data, user, act, busy } = useMoov()
  const [kind, setKind] = useState<Kind>(match?.kind ?? 'pickup')
  const [sport, setSport] = useState<Sport>(match?.sport ?? '풋살')
  const roster = useRoster(match?.homeRoster?.slice(1), match?.homeMemberIds)
  const representative = match?.homeRoster?.[0] || user.name
  const [info, setInfo] = useState<MatchInfo>(match?.info || {})
  const [end, setEnd] = useState(
    match?.endAt
      ? new Date(Date.parse(match.endAt) + 9 * 3600000)
          .toISOString()
          .slice(0, 16)
      : shiftDay(today(), 1) + 'T20:00',
  )
  const [title, setTitle] = useState(match?.title ?? '')
  const [venue, setVenue] = useState(match?.venue ?? '')
  const [customVenue, setCustomVenue] = useState(!!match?.venue && !venues.some(v => v === match.venue))
  const [date, setDate] = useState(
    match ? dateKey(match.start) : shiftDay(today(), 1),
  )
  const [time, setTime] = useState(
    match
      ? new Date(Date.parse(match.start) + 9 * 3600000)
          .toISOString()
          .slice(11, 16)
      : '18:00',
  )
  const [capacity, setCapacity] = useState(match?.capacity ?? 12)
  const [minimum, setMinimum] = useState(match?.operations?.min ?? 10)
  const [minFormat, setMinFormat] = useState(
    match?.operations?.minFormat || '5vs5',
  )
  const [maxFormat, setMaxFormat] = useState(
    match?.operations?.maxFormat || '6vs6',
  )
  const existing = 1 + roster.rows.length
  const [paid, setPaid] = useState(!!match?.fee)
  const [fee, setFee] = useState(match?.fee ? String(match.fee) : '')
  const [level, setLevel] = useState(match?.level ?? '')
  const [description, setDescription] = useState(match?.description ?? '')
  const approvedSeats =
    match?.kind === 'pickup' ? seats(data, match) - match.existing : 0
  const friendly = kind === 'friendly'
  const start = date && time ? fromKoreanInput(date + 'T' + time) : ''
  const endAt = end ? fromKoreanInput(end) : null
  function changeStart(nextDate: string, nextTime: string) {
    setEnd(previous => shiftEndInput(date + 'T' + time, nextDate + 'T' + nextTime, previous))
    setDate(nextDate); setTime(nextTime)
  }
  const rosterIssue = rosterError(representative, roster.names, roster.ids)
  const valid =
    validVenue(venue) &&
    !rosterIssue &&
    !!endAt &&
    minimum <= capacity &&
    roster.ids.every(Boolean) &&
    validEndAt(start, endAt) &&
    validMatchInfo(sport, info) &&
    existing + approvedSeats <= capacity
  function selectSport(next: Sport) {
    setSport(next)
    setMinFormat(formats[next]?.[0] || '')
    setMaxFormat(formats[next]?.at(-1) || '')
    if (!match) {
      setMinimum(
        formats[next] ? Number(formats[next]![0].split('vs')[0]) * 2 : 2,
      )
      setCapacity(
        formats[next] ? Number(formats[next]!.at(-1)!.split('vs')[0]) * 2 : 6,
      )
    }
    if (next !== sport) setInfo(({ gender, venueAddress, venueMapUrl, venueMeeting }) => ({
      ...(gender ? { gender } : {}),
      ...(venueAddress ? { venueAddress } : {}),
      ...(venueMapUrl ? { venueMapUrl } : {}),
      ...(venueMeeting ? { venueMeeting } : {}),
    }))
  }
  if (
    match &&
    (match.hostId !== user.id ||
      match.cancelledAt ||
      Date.parse(match.start) <= Date.now())
  ) {
    return (
      <div className="narrow">
        <BackTitle title="모집글 수정" back={'match/' + match.id} />
        <p className="panel">모집자가 경기 시작 전에 수정할 수 있어요.</p>
      </div>
    )
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const id = match?.id ?? uid()
    const fields = {
      kind,
      sport,
      title,
      venue: venue.trim(),
      start,
      endAt,
      info,
      capacity,
      minCapacity: minimum,
      minFormat,
      maxFormat,
      members: roster.names,
      memberIds: roster.ids,
      existing,
      fee: paid ? Number(fee) : 0,
      level,
      description,
    }
    if (
      await act(
        match
          ? { type: 'editMatch', matchId: id, fields }
          : { type: 'create', id, fields },
        match ? '모집글을 수정했어요.' : '모집글을 등록했어요.',
      )
    )
      go('match/' + id)
  }
  return (
    <div className="narrow">
      {match ? (
        <BackTitle title="모집글 수정" back={'match/' + match.id} />
      ) : (
        <h1>경기 모집하기</h1>
      )}
      <form className="stack" onSubmit={submit}>
        {match ? (
          <section className="panel compact">
            {kindLabel[kind]} · {sport}
          </section>
        ) : (
          <>
            <section className="panel">
              <h2>모집 유형</h2>
              <div className="segmented">
                <button
                  type="button"
                  className={!friendly ? 'sel' : ''}
                  onClick={() => setKind('pickup')}
                >
                  <UserRound size={16} /> {kindLabel.pickup}
                </button>
                <button
                  type="button"
                  disabled={user.role !== 'leader' || !user.teamSport}
                  className={friendly ? 'sel' : ''}
                  onClick={() => {
                    setKind('friendly')
                    if (
                      !canRepresentSport(user.teamSport, sport) &&
                      user.teamSport
                    )
                      selectSport(user.teamSport)
                  }}
                >
                  <Trophy size={16} /> {kindLabel.friendly}
                </button>
              </div>
              <p className="hint">
                {user.role === 'student'
                  ? '친선경기는 팀 대표 계정에서 개설할 수 있어요.'
                  : friendly
                    ? user.team + ' 이름으로 친선경기를 모집해요.'
                    : '혼자 또는 함께 운동할 참가자를 모집해요.'}
              </p>
            </section>
            <section className="panel">
              <h2>운동 종목</h2>
              <SportPicker value={sport} onChange={s => { if (s !== '전체') selectSport(s) }}
                allowed={friendly ? sports.filter(s => canRepresentSport(user.teamSport, s)) : undefined} />
            </section>
          </>
        )}
        <section className="panel">
          <label>
            모집 제목 <small>{title.length} / 40</small>
            <input
              required
              maxLength={40}
              placeholder="예: 저녁 풋살 같이 하실 분"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        </section>
        <section className="panel">
          <h2>일시 및 시간</h2>
          <div className="two">
            <label>
              날짜
              <input
                required
                type="date"
                min={today()}
                value={date}
                onInput={(e) => changeStart(e.currentTarget.value, time)}
                onChange={(e) => changeStart(e.target.value, time)}
              />
            </label>
            <label>
              시작 시간
              <input
                required
                type="time"
                value={time}
                onInput={(e) => changeStart(date, e.currentTarget.value)}
                onChange={(e) => changeStart(date, e.target.value)}
              />
            </label>
          </div>
          <label>
            종료 일시
            <input
              type="datetime-local"
              required
              value={end}
              min={date && time ? date + 'T' + time : undefined}
              max={start ? toKoreanInput(Date.parse(start) + operationPolicy.maxPlayHours * 3600000) : undefined}
              onInput={(e) => setEnd(e.currentTarget.value)}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {!validEndAt(start, endAt) && (
            <p className="hint" role="status">
              종료 일시는 시작 후 {operationPolicy.maxPlayHours}시간 이내로 설정해 주세요.
            </p>
          )}
        </section>
        <section className="panel">
          <h2 id="venue-title">운동 장소</h2>
          <div
            className="venue-grid"
            role="radiogroup"
            aria-labelledby="venue-title"
          >
            {venues.map((place) => (
              <label className="venue-option" key={place}>
                <input
                  type="radio"
                  name="venue"
                  required
                  value={place}
                  checked={!customVenue && venue === place}
                  onChange={() => {
                    setCustomVenue(false); setVenue(place)
                    setInfo(({venueAddress: _a, venueMapUrl: _u, venueMeeting: _m, ...rest}) => rest)
                  }}
                />
                <span>{place}</span>
              </label>
            ))}
            <label className="venue-option custom-venue">
              <input type="radio" name="venue" required checked={customVenue}
                onChange={() => { setCustomVenue(true); setVenue('') }} />
              <span>다른 장소 직접 입력</span>
            </label>
          </div>
          {customVenue && <div className="custom-venue-fields">
            <label>장소 이름<input required maxLength={80} value={venue}
              placeholder="예: 원주 테니스장" onChange={e => setVenue(e.target.value)} /></label>
            {([
              ['venueAddress', '주소 (선택)', 200],
              ['venueMapUrl', '지도 링크 (선택)', 1000],
              ['venueMeeting', '만나는 위치·안내 (선택)', 300],
            ] as const).map(([key, label, max]) => <label key={key}>{label}
              <input type={key === 'venueMapUrl' ? 'url' : 'text'} maxLength={max}
                placeholder={key === 'venueMapUrl' ? 'https://로 시작하는 지도 링크' : undefined}
                value={info[key] || ''} onChange={e => setInfo(previous => {
                  const next = { ...previous }
                  if (e.target.value.trim()) next[key] = e.target.value
                  else delete next[key]
                  return next
                })} />
            </label>)}
            {info.venueMapUrl && !validMatchInfo(sport, info) &&
              <p className="hint">지도 링크는 https://로 시작하는 주소를 입력해 주세요.</p>}
          </div>}
        </section>
        <section className="panel">
          <h2>인원 및 참가비</h2>
          <Stepper
            label="최소 인원"
            value={minimum}
            min={2}
            max={capacity}
            change={setMinimum}
          />
          <Stepper
            label="최대 인원"
            value={capacity}
            min={Math.max(minimum, existing + approvedSeats)}
            max={30}
            change={setCapacity}
          />
          {formats[sport] && (
            <div className="two">
              <label>
                최소 경기 방식
                <select
                  value={minFormat}
                  onChange={(e) => setMinFormat(e.target.value)}
                >
                  {formats[sport]!.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                최대 경기 방식
                <select
                  value={maxFormat}
                  onChange={(e) => setMaxFormat(e.target.value)}
                >
                  {formats[sport]!.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {friendly && (
            <p className="hint">
              인원은 홈팀과 상대팀을 합한 전체 경기 인원이에요.
            </p>
          )}
          {start && Date.parse(start) - Date.now() < 3600000 && (
            <p className="info-note">
              시작까지 1시간 미만이에요. 번개 모집으로 등록되며, 실제 경기 진행
              가능 여부를 확인해 주세요.
            </p>
          )}
          <RosterFields
            roster={roster}
            representative={representative}
            maxExtra={capacity - approvedSeats - 1}
            teamId={match?.hostTeamId}
          />
          {rosterIssue && (
            <p className="hint" role="status">
              {rosterIssue}
            </p>
          )}
          {!friendly && existing + approvedSeats > capacity && (
            <p className="hint">확정 인원이 들어가도록 정원을 늘려 주세요.</p>
          )}
          <div className="chips">
            <button
              type="button"
              aria-pressed={!paid}
              onClick={() => setPaid(false)}
            >
              무료
            </button>
            <button
              type="button"
              aria-pressed={paid}
              onClick={() => setPaid(true)}
            >
              현장 분담금
            </button>
          </div>
          {paid && (
            <label>
              1인당 분담금 (원)
              <input
                required
                inputMode="numeric"
                type="number"
                min="1"
                max="1000000"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
          )}
        </section>
        <details className="panel optional-fields">
          <summary>
            매치 정보 및 추가 안내 <small>선택</small>
          </summary>
          <MatchInfoFields
            sport={sport}
            level={level}
            onLevel={setLevel}
            info={info}
            onInfo={setInfo}
          />
          <label>
            상세 안내 <small>선택 · {description.length}/500</small>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="준비물과 경기 방식을 알려주세요."
            />
          </label>
        </details>
        <button className="primary full" disabled={busy || !valid}>
          <Check size={17} /> {match ? '수정 저장' : '모집글 등록하기'}
        </button>
      </form>
    </div>
  )
}
