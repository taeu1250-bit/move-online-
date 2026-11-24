import { ContextReport, ReportCases } from './Operations'
import { go } from '../ui/context'
import { useState } from 'react'
import { useMoov } from '../ui/context'
import { conductPolicy, praiseOptions, reportOptions } from '../domain/conduct'
import type {
  CaseStatus,
  ConductCase,
  ConductState,
  Person,
} from '../domain/conduct'

const clock = (value: number) =>
  new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
const label: Record<CaseStatus, string> = {
  pending: '이의제기 가능',
  appealed: '운영자 검토 중',
  confirmed: '노쇼 확정',
  dismissed: '신고 취소',
  guest_warning: '단체 경고',
}
export function Manner({
  userId,
  compact = false,
}: {
  userId: string
  compact?: boolean
}) {
  const { data, user } = useMoov()
  const score = data.conduct?.scores[userId]
  if (!score) return null
  const temperature = score.temperature.toFixed(1) + '°C'
  if (compact)
    return (
      <span className="tag" aria-label={'매너온도 ' + temperature}>
        매너 {temperature}
      </span>
    )
  return (
    <section className="panel compact">
      <div className="section-head">
        <h2>매너온도</h2>
        <strong className="accent">{temperature}</strong>
      </div>
      {user.id === userId && (
        <button className="secondary" onClick={() => go('manner-history')}>
          내 매너 기록
        </button>
      )}
      <progress aria-label="매너온도" max={99} value={score.temperature} />
      <small className="hint">
        참가 완료 {score.completions}회 · 받은 칭찬 {score.praises}회
      </small>
    </section>
  )
}
export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'match' | 'user'
  targetId: string
}) {
  const { act, busy } = useMoov()
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState('')
  if (targetType === 'user') return null
  return (
    <div className="stack">
      <button
        className="secondary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {targetType === 'match' ? '모집글 신고하기' : '사용자 신고하기'}
      </button>
      {open && (
        <form
          className="panel stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await act(
                { type: 'conductReport', targetType, targetId, reason },
                '신고를 접수했어요. 운영자가 검토할 예정이에요.',
              )
            ) {
              setOpen(false)
              setReason('')
            }
          }}
        >
          <label>
            신고 사유
            <select
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">선택</option>
              {reportOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={!reason || busy}>
            신고 접수
          </button>
        </form>
      )}
    </div>
  )
}
function PersonActions({
  person,
  matchId,
  host,
}: {
  person: Person
  matchId: string
  host: boolean
}) {
  const { act, busy, user } = useMoov()
  const [report, setReport] = useState(false),
    [ack, setAck] = useState(false),
    [praise, setPraise] = useState(false),
    [reason, setReason] = useState('')
  const mark = (status: 'present' | 'unknown') =>
    act(
      {
        type: 'conductAttendance',
        matchId,
        personKey: person.personKey,
        status,
      },
      '출석 상태를 저장했어요.',
    )
  const editable =
    host && (!person.caseStatus || person.caseStatus === 'dismissed')
  return (
    <article className="panel compact stack">
      <div className="section-head">
        <strong>{person.name}</strong>
        <span className="tag">
          {
            { unknown: '미확인', present: '참가 완료', absent: '미참여' }[
              person.status
            ]
          }
        </span>
      </div>
      {person.caseStatus && host && (
        <span className="hint">{label[person.caseStatus]}</span>
      )}
      {person.canReport && person.userId && (
        <ContextReport
          matchId={matchId}
          category="user"
          targetId={person.userId}
        />
      )}
      {editable && (
        <div className="chips">
          <button
            type="button"
            disabled={busy || person.status === 'present'}
            onClick={() => void mark('present')}
          >
            참가 완료
          </button>
          <button
            type="button"
            disabled={busy || person.status === 'unknown'}
            onClick={() => void mark('unknown')}
          >
            미확인
          </button>
          {person.userId !== user.id && !person.caseStatus && (
            <button
              type="button"
              disabled={busy || person.status === 'present'}
              onClick={() => {
                setReport(!report)
                setAck(false)
              }}
              aria-expanded={report}
            >
              미참여
            </button>
          )}
        </div>
      )}
      {editable && report && (
        <section className="stack">
          <h3>노쇼 신고 안내</h3>
          <p>해당 참가자가 실제로 경기에 참여하지 않았는지 확인해 주세요.</p>
          <p>
            노쇼 신고가 확정되면 참가자의 매너온도가 하락하고, 누적 횟수에 따라
            경기 참가 신청이 제한될 수 있습니다.
          </p>
          <p>
            허위 신고는 다른 사용자에게 불이익을 줄 수 있으므로 신중하게 신고해
            주세요.
          </p>
          {!person.userId && (
            <small>비회원의 미참여는 대표자에게 단체 경고로 기록돼요.</small>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />{' '}
            실제 불참 사실을 확인했으며 신고 안내를 읽었습니다.
          </label>
          <button
            type="button"
            className="primary"
            disabled={!ack || busy}
            onClick={async () => {
              if (
                await act(
                  {
                    type: 'conductNoShow',
                    matchId,
                    personKey: person.personKey,
                    acknowledged: ack,
                  },
                  '미참여 신고를 접수했어요.',
                )
              ) {
                setReport(false)
                setAck(false)
              }
            }}
          >
            노쇼 신고하기
          </button>
        </section>
      )}
      {person.userId &&
        person.userId !== user.id &&
        person.status === 'present' && (
          <button
            type="button"
            className="secondary"
            disabled={busy || !person.canPraise || person.praised}
            onClick={() => setPraise(!praise)}
          >
            {person.praised ? '칭찬 전달 완료' : '칭찬하기'}
          </button>
        )}
      {praise && person.canPraise && !person.praised && person.userId && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              person.userId &&
              (await act(
                {
                  type: 'conductPraise',
                  targetId: person.userId,
                  matchId,
                  reason,
                },
                '칭찬을 전했어요.',
              ))
            )
              setPraise(false)
          }}
        >
          <label>
            칭찬 항목
            <select
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">선택</option>
              {praiseOptions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy || !reason}>
            칭찬 전달
          </button>
        </form>
      )}
    </article>
  )
}
export function MatchConduct({ matchId }: { matchId: string }) {
  const { data } = useMoov()
  const room = data.conduct?.rooms.find((r) => r.matchId === matchId)
  if (!room) return null
  return (
    <section className="panel stack" id="attendance">
      <h2>{room.canManage ? '출석 확인' : '경기 후 활동'}</h2>
      <p className="hint">
        참가 완료를 확인한 회원은 경기 종료 후 {conductPolicy.praiseHours}시간
        동안 서로 칭찬할 수 있어요.
      </p>
      {room.participants.map((p) => (
        <PersonActions
          key={p.personKey}
          person={p}
          matchId={matchId}
          host={room.canManage}
        />
      ))}
    </section>
  )
}
function CaseItem({
  item,
  review = false,
}: {
  item: ConductCase
  review?: boolean
}) {
  const { act, busy, user } = useMoov()
  const [message, setMessage] = useState('')
  const canAppeal =
    user.id === item.subjectId &&
    item.state === 'pending' &&
    Date.now() < item.deadline
  const decision = async (action: 'confirm' | 'dismiss') => {
    if (
      await act(
        {
          type: 'conductDecide',
          caseId: item.id,
          decision: action,
          reason: message,
        },
        '검토 결과를 저장했어요.',
      )
    )
      setMessage('')
  }
  return (
    <article className="panel compact stack">
      <strong>
        {item.title} · {item.name}
      </strong>
      <span>{label[item.state]}</span>
      {item.state === 'pending' && (
        <small>이의제기 기한 {clock(item.deadline)}</small>
      )}
      {item.appeal && <p>이의제기 · {item.appeal}</p>}
      {item.reason && <p>처리 사유 · {item.reason}</p>}
      {item.state === 'guest_warning' && (
        <small>대표자의 매너온도에는 반영되지 않아요.</small>
      )}
      {canAppeal && !review && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await act(
                { type: 'conductAppeal', caseId: item.id, message },
                '이의제기를 접수했어요.',
              )
            )
              setMessage('')
          }}
        >
          <label>
            이의제기 사유
            <textarea
              maxLength={500}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy || !message.trim()}>
            이의제기
          </button>
        </form>
      )}
      {review && item.state !== 'dismissed' && (
        <div className="stack">
          <label>
            처리 사유
            <textarea
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div className="action-pair">
            <button
              className="secondary"
              disabled={busy || !message.trim()}
              onClick={() => void decision('dismiss')}
            >
              {item.state === 'confirmed' ? '확정 취소·제재 정정' : '신고 취소'}
            </button>
            {item.state === 'appealed' && (
              <button
                className="primary"
                disabled={busy || !message.trim()}
                onClick={() => void decision('confirm')}
              >
                노쇼 확정
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
function ReviewReport({ report }: { report: ConductState['reports'][number] }) {
  const { act, busy } = useMoov()
  const [reason, setReason] = useState('')
  return (
    <article className="panel compact stack">
      <strong>
        {report.targetType === 'chat' && '채팅방 신고 · '}
        {report.label} · {report.reason}
      </strong>
      <small>
        {clock(report.at)} ·{' '}
        {
          { pending: '검토 대기', reviewed: '처리 완료', dismissed: '기각' }[
            report.state
          ]
        }
      </small>
      {report.result && <p>{report.result}</p>}
      {report.targetType === 'chat' && <>
        <p className="hint">채팅 종료 후 원문은 삭제됩니다. 신고 사유만으로 사실을 확정하거나 제재하지 마세요. 처리 기록에 대화 원문을 복사하지 마세요.</p>
        {report.state === 'pending' && <a className="secondary" href={'#/chat/' + report.targetId}>채팅방 확인</a>}
      </>}
      {report.state === 'pending' && (
        <>
          <label>
            처리 결과
            <textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="action-pair">
            {(['reviewed', 'dismissed'] as const).map((d) => (
              <button
                className="secondary"
                disabled={busy || !reason.trim()}
                key={d}
                onClick={() =>
                  void act(
                    {
                      type: 'conductResolveReport',
                      reportId: report.id,
                      decision: d,
                      reason,
                    },
                    '신고 검토 결과를 저장했어요.',
                  )
                }
              >
                {d === 'reviewed' ? '처리 완료' : '기각'}
              </button>
            ))}
          </div>
        </>
      )}
    </article>
  )
}
export function ConductActivity() {
  const { data, user } = useMoov(),
    state = data.conduct
  if (!state) return null
  const mine = state.cases.filter(
    (item) =>
      item.subjectId === user.id ||
      (!item.subjectId && item.representativeId === user.id),
  )
  return (
    <div className="stack">
      {!!state.restrictionUntil && (
        <p className="info-note">
          확정된 노쇼 누적으로 {clock(state.restrictionUntil)}까지 신규 경기
          참가 신청이 제한돼요.
        </p>
      )}
      {state.rooms.length > 0 && (
        <details className="panel">
          <summary>경기 후 출석·칭찬</summary>
          <div className="stack">
            {state.rooms.map((r) => (
              <a
                className="secondary"
                key={r.matchId}
                href={'#/conduct/' + r.matchId}
              >
                {r.title} · {r.canManage ? '출석 확인' : '참가 내역'}
              </a>
            ))}
          </div>
        </details>
      )}
      {mine.length > 0 && (
        <section className="panel stack">
          <h2>나의 미참여 신고·이의제기</h2>
          {mine.map((i) => (
            <CaseItem key={i.id} item={i} />
          ))}
        </section>
      )}
      {!state.isAdmin && <ReportCases />}
      {state.isAdmin && (
        <details className="panel admin-zone">
          <summary>운영자 전용 · 신고 관리</summary>
          <p className="admin-count">
            검토 대기{' '}
            {(data.reportCases || []).filter((r) => r.state === 'pending')
              .length +
              state.reports.filter((r) => r.state === 'pending').length +
              state.cases.filter((r) =>
                ['pending', 'appealed'].includes(r.state),
              ).length}
            건 · 처리 완료{' '}
            {(data.reportCases || []).filter((r) => r.state !== 'pending')
              .length +
              state.reports.filter((r) => r.state !== 'pending').length +
              state.cases.filter(
                (r) => !['pending', 'appealed'].includes(r.state),
              ).length}
            건
          </p>
          <ReportCases />
          <div className="stack">
            <h3>노쇼 신고</h3>
            {state.cases.length ? (
              state.cases.map((i) => <CaseItem key={i.id} item={i} review />)
            ) : (
              <p>검토할 신고가 없어요.</p>
            )}
            <h3>일반 신고</h3>
            {state.reports.length ? (
              state.reports.map((r) => <ReviewReport key={r.id} report={r} />)
            ) : (
              <p>접수된 신고가 없어요.</p>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
