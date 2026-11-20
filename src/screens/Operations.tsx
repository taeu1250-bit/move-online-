import { useState, useEffect } from 'react'
import type { Match } from '../domain/model'
import {
  operationPolicy as P,
  cancelReasons,
  postReasons,
  participantReasons,
} from '../domain/operations'
import { conductPolicy as C } from '../domain/conduct'
import { formats } from '../domain/feedback'
import { useMoov, go } from '../ui/context'
import { BackTitle } from '../ui/common'
import './operations.css'
const clock = (n: number) =>
  new Date(n).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
export function ShareTeamInvite({ teamId }: { teamId: string }) {
  const { services, run, busy } = useMoov(),
    [link, setLink] = useState<{
      url: string
      expiresAt: number
      id: string
    } | null>(null),
    [copied, setCopied] = useState(false)
  return (
    <div className="stack">
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const r = await services.inviteLink!({ teamId })
            setLink({
              url: location.origin + '/#/join/' + r.token,
              expiresAt: r.expiresAt!,
              id: r.id!,
            })
            setCopied(false)
          })
        }
      >
        1회용 팀 초대 링크 만들기
      </button>
      {link && (
        <>
          <label>
            공유할 초대 링크
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <p className="hint">
            {clock(link.expiresAt)}까지 한 명이 사용할 수 있어요. 학교 이메일
            로그인 후 본인이 수락해야 가입돼요.
          </p>
          <div className="action-pair">
            <button
              className="secondary"
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(link.url)
                  setCopied(true)
                })
              }
            >
              {copied ? '복사했어요' : '링크 복사'}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await services.inviteLink!({ revokeId: link.id })
                  setLink(null)
                })
              }
            >
              링크 폐기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
export function JoinTeam({ token }: { token: string }) {
  const { services, run, busy } = useMoov(),
    [invite, setInvite] = useState<{
      name?: string
      sport?: string
      expiresAt?: number
    } | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    services.inviteLink!({ token }, true)
      .then((r) => {
        if (active) setInvite(r)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [services, token])
  return (
    <div className="narrow">
      <BackTitle title="팀 초대" back="teams" />
      {error ? (
        <p className="panel">{error}</p>
      ) : invite ? (
        <section className="panel stack">
          <h2>{invite.name}</h2>
          <p>
            {invite.sport} · {clock(invite.expiresAt!)}까지
          </p>
          <p>
            이 팀의 회원으로 가입하시겠어요? 경기 참가는 매 경기마다 별도로
            동의해요.
          </p>
          <div className="action-pair">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await services.inviteLink!({ token, accept: true })
                  await services.refresh()
                  go('teams')
                }, '팀 초대를 수락했어요.')
              }
            >
              수락하기
            </button>
            <button className="secondary" onClick={() => go('teams')}>
              나중에
            </button>
          </div>
        </section>
      ) : (
        <p>초대를 확인하고 있어요.</p>
      )}
    </div>
  )
}

export function OperationPanel({ m }: { m: Match }) {
  const { user, act, busy } = useMoov(),
    o = m.operations
  const [ack, setAck] = useState(false),
    [reason, setReason] = useState(''),
    [format, setFormat] = useState(o?.finalFormat || '')
  if (!o) return null
  const mine = m.hostId === user.id,
    before =
      !m.cancelledAt &&
      !o.startedAt &&
      !o.endedAt &&
      Date.parse(m.start) > Date.now(),
    locked = !!o.delegation
  const late = Date.now() >= Date.parse(m.start) - P.lateCancelHours * 3600000
  return (
    <section className="panel stack operations-panel">
      <div className="section-head">
        <h2>경기 진행</h2>
        {o.lightning && <span className="tag lightning">⚡ 번개 모집</span>}
      </div>
      <p className="operation-count">
        <strong>{o.count}명</strong> 확정{' '}
        <span>
          최소 {o.min} · 최대 {o.max}
        </span>
      </p>
      <p className="hint">
        {o.count >= o.min ? '경기 진행 가능' : '최소 인원을 모집하고 있어요.'}
        {o.finalFormat
          ? ' · ' + o.finalFormat
          : o.minFormat
            ? ' · ' + o.minFormat + ' ~ ' + o.maxFormat
            : ''}
      </p>
      {o.lightningSource === 'new' && before && (
        <p className="hint">
          시작 1시간 이내 등록한 번개 모집이에요. 모집자가 실제 진행 가능 여부를
          결정해요.
        </p>
      )}
      {o.ownConsent === 'pending' && before && (
        <div className="stack">
          <b>이 경기에 참가하시겠어요?</b>
          <p className="hint">
            팀 가입과 별개예요. 동의와 모집자 승인이 모두 완료되어야 확정돼요.
          </p>
          <div className="action-pair">
            <button
              disabled={busy || locked}
              className="primary"
              onClick={() =>
                void act(
                  { type: 'ops.consent', matchId: m.id, accept: true },
                  '참가 동의를 저장했어요.',
                )
              }
            >
              참가 동의
            </button>
            <button
              disabled={busy || locked}
              className="secondary"
              onClick={() =>
                void act({ type: 'ops.consent', matchId: m.id, accept: false })
              }
            >
              거절
            </button>
          </div>
        </div>
      )}
      {!!o.participants.length && (
        <details>
          <summary>참가 동의 상태</summary>
          {o.participants.map((p, i) => (
            <div className="form-row" key={p.userId + ':' + i}>
              <span>{p.name}</span>
              <small>
                {p.consent === 'cancelled'
                  ? '취소'
                  : p.consent === 'rejected'
                    ? '거절'
                    : p.consent === 'pending'
                      ? '본인 동의 대기'
                      : p.approved
                        ? '참가 확정'
                        : '모집자 승인 대기'}
              </small>
            </div>
          ))}
        </details>
      )}
      {o.delegation && (
        <div className="info-note stack">
          <b>모집자 권한 위임 중</b>
          <p>
            응답 기한 {clock(o.delegation.expiresAt)}. 위임 완료 전에는 기존
            모집자의 개인 취소가 확정되지 않아요.
          </p>
          {o.delegation.target === user.id && (
            <>
              <p>해당 경기의 새로운 모집자로 활동하시겠습니까?</p>
              <div className="action-pair">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      type: 'ops.delegate',
                      matchId: m.id,
                      accept: true,
                    })
                  }
                >
                  수락하기
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      type: 'ops.delegate',
                      matchId: m.id,
                      accept: false,
                    })
                  }
                >
                  거절하기
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {mine && before && !locked && (
        <details>
          <summary>모집 및 경기 방식 설정</summary>
          <button className="secondary" onClick={() => go('edit/' + m.id)}>
            모집글 수정
          </button>
          {formats[m.sport] && (
            <label>
              최종 경기 방식
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="">선택</option>
                {formats[m.sport]!.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act({
                type: 'ops.close',
                matchId: m.id,
                closed: !o.closed,
                finalFormat: format || undefined,
              })
            }
          >
            {o.closed ? '추가 모집 재개' : '추가 모집 종료'}
          </button>
        </details>
      )}
      {mine &&
        !m.cancelledAt &&
        !o.startedAt &&
        !o.endedAt &&
        Date.now() >= Date.parse(m.start) && (
          <div className="stack">
            {o.count < o.min && (
              <>
                <b>최소 인원 미달 안내</b>
                <p>
                  현재 참가 인원이 설정한 최소 인원보다 적습니다. 실제로 경기를
                  진행할 수 있는 상황인지 확인해 주세요. 진행되지 않은 경기를
                  허위로 시작 처리하는 행위는 신고 대상이 될 수 있습니다.
                </p>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  실제 경기 진행이 가능함을 확인했습니다.
                </label>
              </>
            )}
            <button
              className="primary"
              disabled={busy || locked || (o.count < o.min && !ack)}
              onClick={() =>
                void act({
                  type: 'ops.start',
                  matchId: m.id,
                  acknowledged: ack,
                })
              }
            >
              경기 시작하기
            </button>
          </div>
        )}
      {mine && o.startedAt && !o.endedAt && !m.cancelledAt && (
        <button
          className="primary"
          disabled={
            busy || Date.now() < o.startedAt + P.manualEndMinutes * 60000
          }
          onClick={() => void act({ type: 'ops.end', matchId: m.id })}
        >
          경기 종료하기
          {Date.now() < o.startedAt + P.manualEndMinutes * 60000
            ? ' · 시작 후 1시간부터'
            : ''}
        </button>
      )}
      {o.endedAt && !m.cancelledAt && o.joined && (
        <button className="primary" onClick={() => go('conduct/' + m.id)}>
          출석 확인 · 칭찬 및 신고
        </button>
      )}
      {before && o.ownConsent === 'accepted' && (
        <details>
          <summary>내 참가 취소{mine ? ' · 모집자 위임' : ''}</summary>
          <p className="hint">
            {late
              ? '지금 확정 참가를 취소하면 매너온도 -1°C가 적용돼요.'
              : '지금 취소하면 매너온도 변화가 없어요.'}
            {mine
              ? ' 다른 확정 회원에게 순서대로 위임을 요청하고, 모두 거절하면 경기가 취소돼요.'
              : ''}
          </p>
          <button
            className="secondary"
            disabled={busy || locked}
            onClick={() => void act({ type: 'ops.leave', matchId: m.id })}
          >
            {mine ? '개인 취소 및 위임 요청' : '내 참가 취소'}
          </button>
        </details>
      )}
      {mine &&
        !m.cancelledAt &&
        !o.startedAt &&
        !o.endedAt &&
        Date.now() < Date.parse(m.endAt || m.start) && (
          <details>
            <summary>경기 전체 취소</summary>
            <label>
              취소 사유
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">선택</option>
                {cancelReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              {late
                ? '모집자 책임의 취소는 -1°C입니다. 기상악화·경기장 이용 불가는 제외되며, 취소 이력은 운영자가 검토할 수 있어요.'
                : '모든 참가자에게 취소를 알리고 기록을 보관해요.'}{' '}
              위험한 기상 상황에서는 안전을 우선해 주세요.
            </p>
            <button
              className="secondary"
              disabled={busy || !reason}
              onClick={() =>
                void act({ type: 'ops.cancel', matchId: m.id, reason })
              }
            >
              경기 전체 취소 확정
            </button>
          </details>
        )}
      {m.cancelledAt && <p className="hint">취소 사유 · {o.cancelledReason}</p>}
    </section>
  )
}
export function ContextReport({
  matchId,
  category,
  targetId,
}: {
  matchId: string
  category: 'post' | 'user' | 'operation'
  targetId?: string
}) {
  const { act, busy } = useMoov(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState('')
  const options =
    category === 'post'
      ? postReasons
      : category === 'user'
        ? participantReasons
        : ['실제로 진행되지 않은 경기']
  return (
    <div className="stack">
      <button
        className="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {category === 'post'
          ? '게시글 신고하기'
          : category === 'user'
            ? '참가자 신고하기'
            : '경기 운영 신고'}
      </button>
      {open && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await act(
                { type: 'ops.report', matchId, targetId, category, reason },
                '접수했어요. 신고만으로 제재되지는 않아요.',
              )
            )
              setOpen(false)
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
              {options.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button disabled={busy || !reason} className="primary">
            신고 제출
          </button>
        </form>
      )}
    </div>
  )
}
export function MatchMore({ m }: { m: Match }) {
  const { user } = useMoov()
  return (
    <details className="match-more">
      <summary aria-label="경기 더보기">⋯</summary>
      <div className="panel stack">
        {m.hostId !== user.id && (
          <ContextReport matchId={m.id} category="post" />
        )}
        {m.operations?.joined && m.hostId !== user.id && (
          <ContextReport matchId={m.id} category="operation" />
        )}
      </div>
    </details>
  )
}
const auditLabels: Record<string, string> = {
  automatic: '예약 상태 처리',
  'ops.start': '경기 직접 시작',
  'ops.end': '경기 직접 종료',
  'ops.leave': '개인 참가 취소 요청',
  'ops.delegate': '권한 위임 응답',
  'ops.cancel': '경기 전체 취소',
  'ops.close': '추가 모집 설정',
  review: '참가 신청 검토',
  reviewRoster: '변경 명단 검토',
  'ops.consent': '경기 참가 동의 응답',
  editEntry: '신청 명단 수정',
  editMatch: '경기 정보 수정',
  apply: '참가 신청',
  'report.confirm': '신고 사실 확인',
  'report.dismiss': '신고 기각',
  'report.correct': '신고 제재 정정',
}
export function ReportCases() {
  const { data, user, act, busy } = useMoov(),
    [reason, setReason] = useState<Record<string, string>>({})
  const rows = data.reportCases || [],
    admin = data.conduct?.isAdmin
  if (!rows.length) return null
  return (
    <div className="stack">
      <h3>{admin ? '경기 신고 검토' : '내 신고 처리 결과'}</h3>
      {rows.map((r) => (
        <article className="panel compact stack" key={r.id}>
          <b>
            {r.title} · {r.targetName}
          </b>
          <span className="tag">
            {r.category === 'user'
              ? '참가자'
              : r.category === 'post'
                ? '게시글'
                : '경기 운영'}{' '}
            ·{' '}
            {r.state === 'pending'
              ? '검토 대기'
              : r.state === 'confirmed'
                ? '확정'
                : r.state === 'corrected'
                  ? '정정'
                  : '기각'}
            {r.priority ? ' · 우선 검토' : ''}
          </span>
          <p>
            {[...new Set(r.reasons)].join(' · ')}
            {admin ? ' · ' + r.reporters + '명 신고' : ''}
          </p>
          {admin && r.audit && (
            <details>
              <summary>경기 운영 기록 · {r.audit.length}건</summary>
              <div className="stack">
                {r.audit.map((a) => (
                  <div key={a.id} className="info-note">
                    <small>
                      {clock(a.at)} · {a.actorName || '서버 자동 처리'}
                    </small>
                    <p>
                      {auditLabels[a.action] || a.action}
                      {a.detail.count !== undefined
                        ? ' · 확정 ' +
                          a.detail.count +
                          '명 / 최소 ' +
                          a.detail.min +
                          '명'
                        : ''}
                      {a.detail.manualBelowMinimum
                        ? ' · 최소 미달 확인 후 시작'
                        : ''}
                    </p>
                    {(a.detail.cancelledReason || a.detail.reason) && (
                      <p>{a.detail.cancelledReason || a.detail.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {r.reason && <p>처리 결과 · {r.reason}</p>}
          {r.appeal && <p>이의제기 · {r.appeal}</p>}
          {((admin && ['pending', 'confirmed'].includes(r.state)) ||
            (!admin &&
              r.targetId === user.id &&
              r.state === 'confirmed' &&
              !r.appeal)) && (
            <>
              <label>
                {admin ? '처리 근거' : '이의제기 내용'}
                <textarea
                  maxLength={500}
                  value={reason[r.id] || ''}
                  onChange={(e) =>
                    setReason({ ...reason, [r.id]: e.target.value })
                  }
                />
              </label>
              <div className="action-pair">
                {admin ? (
                  (r.state === 'pending'
                    ? (['confirm', 'dismiss'] as const)
                    : (['correct'] as const)
                  ).map((decision) => (
                    <button
                      className={
                        decision === 'confirm' ? 'primary' : 'secondary'
                      }
                      key={decision}
                      disabled={busy || !reason[r.id]?.trim()}
                      onClick={() =>
                        void act({
                          type: 'ops.reportDecision',
                          caseId: r.id,
                          decision,
                          reason: reason[r.id],
                        })
                      }
                    >
                      {decision === 'confirm'
                        ? '사실 확인 및 확정'
                        : decision === 'dismiss'
                          ? '기각'
                          : '제재 정정'}
                    </button>
                  ))
                ) : (
                  <button
                    className="secondary"
                    disabled={busy || !reason[r.id]?.trim()}
                    onClick={() =>
                      void act({
                        type: 'ops.reportAppeal',
                        caseId: r.id,
                        message: reason[r.id],
                      })
                    }
                  >
                    이의제기 제출
                  </button>
                )}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  )
}
export function MannerHistory() {
  const { data } = useMoov()
  const labels: Record<string, string> = {
    present: '경기 참가 완료',
    unmark: '출석 정정',
    praise: '칭찬받음',
    confirmed: '노쇼 확정',
    dismissed: '노쇼 제재 정정',
    late_cancel: '경기 직전 취소',
    report_penalty: '운영자 신고 제재',
    report_correction: '운영자 제재 정정',
    invalid_attendance: '허위 출석 정정',
    invalid_praise: '허위 경기 칭찬 정정',
    invalid_noshow: '미진행 경기 노쇼 정정',
  }
  return (
    <div className="narrow">
      <BackTitle title="내 매너 기록" back="profile" />
      <p className="hint">
        본인의 온도 변동 이력이에요. 정정 내역도 함께 보관해요.
      </p>
      {data.mannerHistory?.length ? (
        data.mannerHistory.map((e) => (
          <article className="panel compact" key={e.id}>
            <small>{clock(e.at)}</small>
            <div className="section-head">
              <b>{labels[e.action] || e.action}</b>
              <strong className="accent">
                {e.delta > 0 ? '+' : ''}
                {(e.delta / 10).toFixed(1)}°C
              </strong>
            </div>
            <p className="hint">{e.title}</p>
          </article>
        ))
      ) : (
        <p className="panel">아직 온도 변동 기록이 없어요.</p>
      )}
    </div>
  )
}
export function Rules() {
  const groups: [string, [string, string][]][] = [
    [
      '매너온도',
      [
        ['기본 매너온도', `${C.baseTenths / 10}°C`],
        ['참가 완료', `+${C.completedTenths / 10}°C`],
        ['칭찬받음', `+${C.praiseTenths / 10}°C`],
        ['직전 참가 취소', `${P.lateCancelTenths / 10}°C`],
        ['노쇼 확정', `${C.noShowTenths / 10}°C`],
        ['운영자 일반 신고 확정', `${P.reportTenths / 10}°C`],
      ],
    ],
    [
      '참가 취소 및 경기 취소',
      [
        [`시작 ${P.lateCancelHours}시간 이전`, '패널티 없음'],
        [`시작 ${P.lateCancelHours}시간 이내`, `${P.lateCancelTenths / 10}°C`],
        ['시작 시각 이후', '일반 취소 불가 · 출석 및 노쇼 절차'],
        ['기상악화·경기장 이용 불가', '패널티 없음 · 사유 기록'],
        ['모집자 개인 취소', '다음 확정 회원의 동의 후 위임'],
        [
          '모집자 위임 응답',
          `${P.delegationMinutes}분 또는 시작 시각까지 · 모두 거절하면 전체 취소`,
        ],
      ],
    ],
    [
      '신고 및 노쇼 패널티',
      [
        [
          `최근 ${C.lookbackDays}일 내 노쇼 1회`,
          `${C.noShowTenths / 10}°C 및 경고`,
        ],
        [
          '노쇼 2회',
          `${C.noShowTenths / 10}°C 및 ${C.secondBanDays}일 신청 제한`,
        ],
        [
          '노쇼 3회 이상',
          `${C.noShowTenths / 10}°C 및 ${C.repeatedBanDays}일 신청 제한`,
        ],
        ['노쇼 이의제기', `신고 후 ${C.appealHours}시간 이내`],
        [
          `${P.priorityReports}명 이상 참가자 신고`,
          '운영자 우선 검토 · 자동 제재 없음',
        ],
        ['일반 신고 제재', '신고 인원과 별개로 운영자가 사실 확인 후 결정'],
      ],
    ],
    [
      '경기 모집 및 운영 규칙',
      [
        [`시작 ${P.lightningHours}시간 전 최소 미달`, '번개 모집 전환'],
        [
          `시작 ${P.autoCancelHours}시간 전 최소 미달`,
          '전환 경기 자동 취소 · 한 번이라도 최소를 채웠으면 모집자 결정',
        ],
        [
          `시작 ${P.autoStartMinutes}분 후`,
          '최소 충족 시 자동 시작 · 출석 인정 아님',
        ],
        ['최소 미달 직접 시작', '실제 진행 가능 확인 후 시작'],
        ['예정 종료 시각', '진행 중 경기 자동 종료'],
        [`실제 시작 ${P.manualEndMinutes}분 후`, '모집자 직접 종료 가능'],
        [
          `취소 ${P.hideCancelledMinutes}분 후`,
          '경기 찾기에서 숨김 · 내 활동 보관',
        ],
        [
          '칭찬 기한',
          `실제 종료 후 ${C.praiseHours}시간 · 실제 출석 회원 간 1회`,
        ],
      ],
    ],
  ]
  return (
    <div className="narrow">
      <BackTitle title="이용 규칙 및 매너 가이드" back="profile" />
      {groups.map(([title, rows]) => (
        <details open className="panel" key={title}>
          <summary>{title}</summary>
          <dl className="rules-table">
            {rows.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      <p className="info-note">
        시작 1시간 이내에 새로 등록한 번개 모집은 과거 시각을 기준으로 취소하지
        않아요. 최소 미달이면 자동 시작하지 않으며 모집자가 실제 진행 여부를
        확인해요.
      </p>
      <p className="hint">
        학교 이메일 인증은 이메일 소유 확인입니다. 실명이나 재학 여부 인증을
        의미하지 않아요.
      </p>
    </div>
  )
}
