import { OperationPanel, MatchMore } from './Operations'
import { useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Coins,
  Flag,
  MapPin,
  ShieldCheck,
  ChevronRight,
  UsersRound,
} from 'lucide-react'
import {
  activeEntry,
  canRepresentSport,
  confirmed,
  dateKey,
  entriesFor,
  fmtDate,
  fmtTime,
  matchStatus,
  money,
  seats,
  statusLabel,
} from '../domain/model'
import type { Match } from '../domain/model'
import {
  levelMismatch,
  mannerGuidelines,
  matchInfoTags,
  rosterError,
} from '../domain/feedback'
import { RosterFields, useRoster } from './MatchFields'
import { Manner } from './Conduct'
import { Avatar, BackTitle, Tags } from '../ui/common'
import { useMoov, go } from '../ui/context'

export function Detail({ m, origin }: { m: Match; origin: string | null }) {
  const { data, user, act, busy } = useMoov()
  const host = data.users.find((u) => u.id === m.hostId)!
  const mine = m.hostId === user.id,
    team = m.kind === 'friendly'
  const entry = activeEntry(data, m, user.id)
  const state = matchStatus(data, m)
  const picked = confirmed(data, m)
  const count = seats(data, m)
  const entries = entriesFor(data, m)
  const teammate = m.hostTeamId
    ? data.teamHub?.activeTeamId === m.hostTeamId
    : user.team === (m.homeTeam || host.team)
  const locked =
    team &&
    (user.role !== 'leader' ||
      !canRepresentSport(user.teamSport, m.sport) ||
      teammate)
  const active = !m.cancelledAt && Date.parse(m.start) > Date.now()
  const latest = entries.find((e) => e.userId === user.id)
  const back =
    origin === 'hosted'
      ? 'activity?tab=hosted'
      : origin === 'activity'
        ? 'activity'
        : 'home?day=' + dateKey(m.start)
  return (
    <div className="narrow">
      <BackTitle title="경기 상세" back={back} />
      <MatchMore m={m} />
      <div className="detail-summary">
        <Tags m={m} />
        <h1>{m.title}</h1>
        <span className="meta">
          <MapPin size={15} />
          {m.venue}
        </span>
        <div className="metrics">
          <div>
            <CalendarDays />
            <small>일시</small>
            <b>
              {fmtDate(m.start)} {fmtTime(m.start)}
            </b>
          </div>
          <div>
            <Coins />
            <small>1인 참가비</small>
            <b>{money(m.fee)}</b>
          </div>
        </div>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>모집자</h2>
          {(m.homeTeam || host.team) && (
            <span className="tag">{m.homeTeam || host.team}</span>
          )}
        </div>
        <button
          className="person-line host-profile-link"
          onClick={() => go('public/' + m.hostId)}
          aria-label={host.name + ' 모집자 프로필 보기'}
        >
          <Avatar name={host.name} />
          <div>
            <strong>{host.name}</strong>
            <p>{mine ? '내 모집글' : '모집자 프로필 보기'}</p>
          </div>
          <ChevronRight size={18} />
        </button>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>{team ? '상대팀 매칭' : '참가 현황'}</h2>
          <b className="accent">
            {team
              ? m.opponent || picked[0]?.team || '상대팀 모집 중'
              : count + ' / ' + m.capacity + '명'}
          </b>
        </div>
        {team ? (
          <p className="hint">
            홈팀 {m.homeTeam || host.team} · {m.existing}명 · 친선경기 상대 1팀
          </p>
        ) : (
          <>
            <progress value={count} max={m.capacity} />
            <div className="member-strip">
              <span className="member filled">{host.name.slice(-2)}</span>
              {m.existing > 1 && (
                <span className="member">+{m.existing - 1}</span>
              )}
              {picked.slice(0, 4).map((e) => (
                <span className="member filled" key={e.id}>
                  {data.users.find((u) => u.id === e.userId)?.name.slice(-2)}
                </span>
              ))}
              {count < m.capacity && (
                <span className="member empty-slot">+{m.capacity - count}</span>
              )}
            </div>
          </>
        )}
        <p className="sub-line">
          <UsersRound size={15} />
          승인 대기{' '}
          {m.pendingCount ??
            entries.filter((e) => e.status === 'pending').length}
          {team ? '팀' : '건'}
        </p>
      </section>
      <section className="panel">
        <h2>매치 정보</h2>
        <div className="match-info-tags">
          {matchInfoTags(m).map((tag, i) => (
            <span className="tag" key={i}>
              {tag}
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>경기 안내</h2>
        </div>
        <p className="description">
          {m.description || '별도로 등록된 안내가 없어요.'}
        </p>
      </section>
      <OperationPanel m={m} />
      {!m.cancelledAt &&
        m.endAt &&
        Date.parse(m.endAt) <= Date.now() &&
        !mine && (
          <button
            className="secondary full"
            onClick={() => go('conduct/' + m.id)}
          >
            경기 후 출석·칭찬
          </button>
        )}
      {latest && !entry && !mine && (
        <p className="info-note">
          <ClipboardList size={17} />내 신청 상태 · {statusLabel[latest.status]}
        </p>
      )}
      {entry && active && (
        <button className="secondary full" onClick={() => go('apply/' + m.id)}>
          {entry.status === 'approved' ? '참가 명단 변경' : '내 신청 수정'}
        </button>
      )}
      {entry?.roster && (
        <p className="hint">
          {entry.status === 'approved'
            ? '승인된 신청 명단 · 동의 상태 별도 확인'
            : '내 신청 명단'}{' '}
          · {entry.roster.join(', ')}
        </p>
      )}
      {entry?.proposedRoster && (
        <p className="info-note">
          변경 승인 대기 · {entry.proposedRoster.join(', ')}
        </p>
      )}
      <div className="action-bar">
        {mine ? (
          <button className="primary full" onClick={() => go('manage/' + m.id)}>
            신청자 관리 <ArrowRight size={18} />
          </button>
        ) : entry && !m.operations ? (
          <button
            className="secondary full"
            disabled={busy || !active}
            onClick={() =>
              void act(
                { type: 'review', entryId: entry.id, decision: 'cancel' },
                '신청을 취소했어요.',
              )
            }
          >
            {statusLabel[entry.status]} · 신청 취소
          </button>
        ) : (
          <button
            className="primary full"
            disabled={
              locked ||
              !!m.operations?.joined ||
              !['모집 중', '경기 진행 가능'].includes(state)
            }
            onClick={() => go('apply/' + m.id)}
          >
            {locked
              ? teammate
                ? '우리 팀 친선경기'
                : '해당 종목 팀 대표만 신청 가능'
              : !['모집 중', '경기 진행 가능'].includes(state)
                ? state
                : team
                  ? '친선경기 신청하기'
                  : '참가 신청하기'}
            <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

export function Apply({ m }: { m: Match }) {
  const { data, user, act, busy } = useMoov()
  const existingEntry = activeEntry(data, m, user.id)
  const [note, setNote] = useState(
    existingEntry?.proposedNote ?? existingEntry?.note ?? '',
  )
  const [revision] = useState(existingEntry?.rosterRevision)
  const initialRoster =
    existingEntry?.proposedRoster ?? existingEntry?.roster ?? []
  const initialIds = existingEntry?.proposedRoster
    ? existingEntry.proposedMemberIds
    : existingEntry?.memberIds
  const roster = useRoster(initialRoster.slice(1), initialIds)
  const [group, setGroup] = useState(initialRoster.length > 1)
  const [checkedVersion, setCheckedVersion] = useState('')
  const [levelAck, setLevelAck] = useState('')
  const team = m.kind === 'friendly'
  const names = team || group ? roster.names : []
  const ids = team || group ? roster.ids : []
  const representative = initialRoster[0] || user.name
  const rosterIssue =
    rosterError(representative, names, ids) ||
    (group && !team && !names.length
      ? '참가자를 추가하거나 본인만을 선택해 주세요.'
      : '')
  const myLevel = user.levels?.[m.sport]
  const mismatch = levelMismatch(m.level, myLevel)
  const levelKey = JSON.stringify([m.id, m.level, myLevel])
  const levelAcknowledged = !mismatch || levelAck === levelKey
  const policy = data.policy
  const policyAccepted = !!existingEntry || !!policy?.accepted
  const changedElsewhere =
    !!existingEntry && revision !== existingEntry.rosterRevision
  const expiredForm = revision !== undefined && !existingEntry
  const remaining = m.capacity - seats(data, m)
  const restricted =
    !existingEntry && (data.conduct?.restrictionUntil ?? 0) > Date.now()
  const eligible =
    !restricted &&
    (!m.operations?.joined || !!existingEntry) &&
    m.hostId !== user.id &&
    !changedElsewhere &&
    !expiredForm &&
    !m.cancelledAt &&
    Date.parse(m.start) > Date.now() &&
    (!!existingEntry ||
      (['모집 중', '경기 진행 가능'].includes(matchStatus(data, m)) &&
        (!!m.operations || team || 1 + names.length <= remaining))) &&
    (!!existingEntry ||
      !team ||
      (user.role === 'leader' &&
        canRepresentSport(user.teamSport, m.sport) &&
        (m.hostTeamId
          ? data.teamHub?.activeTeamId !== m.hostTeamId
          : user.team !==
            (m.homeTeam || data.users.find((u) => u.id === m.hostId)?.team))))
  return (
    <div className="narrow">
      {restricted && (
        <p className="info-note" role="status">
          확정된 노쇼로 신규 신청이 제한됐어요. 해제 예정일{' '}
          {new Date(data.conduct!.restrictionUntil!).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
          })}
        </p>
      )}
      <BackTitle
        title={
          existingEntry ? '신청 변경' : team ? '친선경기 신청' : '참가 신청'
        }
        back={'match/' + m.id}
      />
      <section className="panel">
        <Tags m={m} />
        <h2 className="large">{m.title}</h2>
        <p className="meta">
          <CalendarDays size={15} />
          {fmtDate(m.start)} {fmtTime(m.start)}
        </p>
        <p className="meta">
          <MapPin size={15} />
          {m.venue}
        </p>
      </section>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault()
          if (
            policyAccepted &&
            levelAcknowledged &&
            eligible &&
            !rosterIssue &&
            (await act(
              existingEntry
                ? {
                    type: 'editEntry',
                    entryId: existingEntry.id,
                    revision,
                    note,
                    members: names,
                    memberIds: ids,
                    levelAcknowledged,
                  }
                : {
                    type: 'apply',
                    matchId: m.id,
                    note,
                    members: names,
                    memberIds: ids,
                    levelAcknowledged,
                  },
              existingEntry
                ? '신청 변경을 접수했어요.'
                : '신청했어요. 모집자 승인 대기 중이에요.',
            ))
          )
            go('match/' + m.id)
        }}
      >
        <section className="panel">
          <h2>{team ? '신청 팀' : '신청자 정보'}</h2>
          <div className="sample-profile">
            <Avatar name={user.name} />
            <div>
              <strong>
                {team ? existingEntry?.team || user.team : user.name}
              </strong>
              <p>
                {team ? '팀 대표 ' + user.name : '신청자 본인 포함'} · {m.sport}{' '}
                {myLevel || '레벨 미설정'}
              </p>
            </div>
          </div>
          {!team && (
            <div className="segmented">
              <button
                className={!group ? 'sel' : ''}
                type="button"
                aria-pressed={!group}
                onClick={() => setGroup(false)}
              >
                본인만
              </button>
              <button
                className={group ? 'sel' : ''}
                type="button"
                aria-pressed={group}
                disabled={user.role !== 'leader'}
                onClick={() => setGroup(true)}
              >
                그룹 신청
              </button>
            </div>
          )}
          {(team || group) && (
            <RosterFields
              roster={roster}
              representative={representative}
              maxExtra={29}
              teamId={existingEntry?.teamId}
            />
          )}
          {existingEntry?.status === 'approved' && (
            <p className="hint">
              각자 본인의 참가를 취소해요. 새 팀원은 본인 동의와 모집자 재승인이
              필요해요.
            </p>
          )}
          {rosterIssue && (
            <p role="status" className="hint">
              {rosterIssue}
            </p>
          )}
          {!team && !existingEntry && 1 + names.length > remaining && (
            <p className="hint">현재 남은 자리는 {remaining}자리예요.</p>
          )}
          {mismatch && (
            <label className="check">
              <input
                type="checkbox"
                checked={levelAcknowledged}
                onChange={(e) => setLevelAck(e.target.checked ? levelKey : '')}
              />
              모집자가 설정한 운동 레벨과 현재 프로필의 운동 레벨이 다릅니다.
              참가 신청은 가능하지만 모집자가 승인 여부를 결정합니다.
            </label>
          )}
          {(changedElsewhere || expiredForm) && (
            <p className="info-note">
              신청 상태가 변경됐어요. 경기 상세에서 명단을 다시 열어 주세요.
            </p>
          )}
          <label>
            신청 한마디 <small>선택 · {note.length}/200</small>
            <textarea
              rows={3}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="모집자에게 전할 말을 남겨 주세요."
            />
          </label>
        </section>
        {!policyAccepted && (
          <section className="panel">
            <h2>
              <ShieldCheck size={18} /> moov. 경기 참가 및 매너 안내
            </h2>
            <p>뭅은 함께 운동할 사람을 연결하는 스포츠 매칭 플랫폼입니다.</p>
            <p>
              원활한 경기 진행과 서로에 대한 배려를 위해 다음 사항을 지켜
              주세요.
            </p>
            <ol className="match-guidelines">
              {mannerGuidelines.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <label className="check">
              <input
                type="checkbox"
                checked={!!policy?.version && checkedVersion === policy.version}
                onChange={(e) =>
                  setCheckedVersion(
                    e.target.checked ? policy?.version || '' : '',
                  )
                }
              />
              위 이용 안내 및 패널티 정책을 확인했습니다.
            </label>
            <button
              className="secondary full"
              type="button"
              disabled={
                busy || !policy?.version || checkedVersion !== policy.version
              }
              onClick={() => {
                if (policy?.version)
                  void act(
                    { type: 'acceptPolicy', version: policy.version },
                    '이용 안내를 확인했어요.',
                  )
              }}
            >
              확인하고 계속하기
            </button>
          </section>
        )}
        <div className="action-bar">
          <div className="row fee-line">
            <span>1인 현장 분담금</span>
            <b>{money(m.fee)}</b>
          </div>
          <button
            className="primary full"
            disabled={
              !eligible ||
              !!rosterIssue ||
              !policyAccepted ||
              !levelAcknowledged ||
              busy
            }
          >
            {eligible ? (
              <>
                <Check size={17} />
                {existingEntry
                  ? '신청 수정 저장'
                  : team
                    ? '팀으로 신청하기'
                    : 1 + names.length + '명 참가 신청하기'}
              </>
            ) : (
              '지금은 신청할 수 없어요'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Manage({ m }: { m: Match }) {
  const { data, user, act, busy } = useMoov()
  const [tab, setTab] = useState<'pending' | 'approved' | 'history'>('pending')
  if (user.id !== m.hostId)
    return (
      <div className="narrow">
        <BackTitle title="신청자 관리" back={'match/' + m.id} />
        <OperationPanel m={m} />
        <div className="panel">이 화면은 경기 모집자만 열 수 있어요.</div>
      </div>
    )
  const entries = entriesFor(data, m),
    team = m.kind === 'friendly'
  const groups = {
    pending: entries.filter(
      (e) =>
        e.status === 'pending' || (e.status === 'approved' && e.proposedRoster),
    ),
    approved: entries.filter((e) => e.status === 'approved'),
    history: entries.filter((e) => !['pending', 'approved'].includes(e.status)),
  }
  const remaining = m.capacity - seats(data, m)
  const opponent = confirmed(data, m)[0]?.team
  const isOver = !!m.cancelledAt || Date.parse(m.start) <= Date.now()
  return (
    <div className="narrow">
      <BackTitle title="신청자 관리" back={'match/' + m.id} />
      <section className="panel">
        <Tags m={m} />
        <h2 className="large">{m.title}</h2>
        <p className="meta">
          <CalendarDays size={15} />
          {fmtDate(m.start)} {fmtTime(m.start)} · {m.venue}
        </p>
        <div className="manage-stat">
          <Flag size={17} />
          {team
            ? opponent
              ? opponent + ' 매칭 확정'
              : '상대팀 1팀 모집'
            : '확정 ' +
              seats(data, m) +
              ' / ' +
              m.capacity +
              '명 · 잔여 ' +
              remaining +
              '석'}
        </div>
      </section>
      {m.homeRoster && (
        <section className="panel">
          <h2>기존 참가자 명단</h2>
          <p>{m.homeRoster.join(', ')}</p>
        </section>
      )}
      {!m.operations &&
        !m.cancelledAt &&
        Date.parse(m.start) <= Date.now() &&
        !m.endAt && (
          <button
            className="secondary full"
            disabled={busy}
            onClick={async () => {
              if (
                confirm(
                  '실제 경기가 종료되었나요? 지금 시각을 종료 시각으로 기록해요.',
                ) &&
                (await act(
                  { type: 'finishMatch', matchId: m.id },
                  '경기 종료를 기록했어요.',
                ))
              )
                go('conduct/' + m.id)
            }}
          >
            경기 종료 확인
          </button>
        )}
      {!m.cancelledAt &&
        (m.operations
          ? !!m.operations.endedAt
          : m.endAt && Date.parse(m.endAt) <= Date.now()) && (
          <button
            className="primary full"
            onClick={() => go('conduct/' + m.id)}
          >
            출석 확인·칭찬하기
          </button>
        )}
      {!isOver && !m.operations && (
        <div className="action-pair">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => go('edit/' + m.id)}
          >
            모집글 수정
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (confirm('경기를 취소하고 신청자에게 알릴까요?'))
                void act(
                  { type: 'cancelMatch', matchId: m.id },
                  '경기를 취소했어요.',
                )
            }}
          >
            경기 전체 취소
          </button>
        </div>
      )}
      <div className="segmented manage-tabs">
        {(['pending', 'approved', 'history'] as const).map((t, i) => (
          <button
            key={t}
            className={tab === t ? 'sel' : ''}
            onClick={() => setTab(t)}
          >
            {['승인 대기', '확정', '취소·거절'][i]} ({groups[t].length})
          </button>
        ))}
      </div>
      {tab === 'approved' && !team && (
        <div className="panel compact">
          <b>기존 참가자 {m.existing}명</b>
          <p className="hint">모집자를 포함해 개설할 때 등록된 인원이에요.</p>
        </div>
      )}
      {groups[tab].map((e) => {
        const applicant = data.users.find((u) => u.id === e.userId)!
        const currentCount = e.roster?.length ?? 1
        const changeRequest = e.status === 'approved' && !!e.proposedRoster
        const needed = changeRequest
          ? (e.proposedRoster?.length ?? currentCount) - currentCount
          : currentCount
        const canApprove =
          !isOver &&
          (changeRequest ||
            ['모집 중', '경기 진행 가능'].includes(matchStatus(data, m))) &&
          (!!m.operations || team || needed <= remaining)
        return (
          <section className="panel" key={e.id}>
            <div className="person-line">
              <Avatar name={applicant.name} />
              <div>
                <strong>{e.team || applicant.name}</strong>
                <p>
                  {e.team
                    ? '대표 ' + applicant.name
                    : currentCount > 1
                      ? '그룹 ' + currentCount + '명'
                      : '개인 1명'}{' '}
                  ·{' '}
                  {changeRequest && tab === 'pending'
                    ? '명단 변경 요청'
                    : statusLabel[e.status]}
                </p>
              </div>
            </div>
            <p className="hint">
              {m.sport} {applicant.levels?.[m.sport] || '레벨 미설정'} ·
              자기평가
            </p>
            <Manner userId={applicant.id} compact />
            {e.roster && (
              <p className="hint">
                {e.status === 'approved'
                  ? '승인된 신청 명단 · 동의 상태 별도 확인'
                  : '신청 명단'}{' '}
                · {e.roster.join(', ')}
              </p>
            )}
            {changeRequest && (
              <p className="info-note">
                변경 요청 · {e.proposedRoster?.join(', ')}
              </p>
            )}
            {e.note && <p className="quote">{e.note}</p>}
            {changeRequest && e.proposedNote && e.proposedNote !== e.note && (
              <p className="quote">{e.proposedNote}</p>
            )}
            {tab === 'pending' && (
              <div className="action-pair">
                <button
                  className="secondary"
                  disabled={busy || isOver}
                  onClick={() =>
                    void act(
                      changeRequest
                        ? {
                            type: 'reviewRoster',
                            entryId: e.id,
                            decision: 'reject',
                            revision: e.rosterRevision ?? 0,
                          }
                        : {
                            type: 'review',
                            entryId: e.id,
                            revision: e.rosterRevision,
                            decision: 'reject',
                          },
                      changeRequest
                        ? '명단 변경을 거절했어요.'
                        : '신청을 거절했어요.',
                    )
                  }
                >
                  {changeRequest ? '변경 거절' : '거절'}
                </button>
                <button
                  className="primary"
                  disabled={busy || !canApprove}
                  onClick={() =>
                    void act(
                      changeRequest
                        ? {
                            type: 'reviewRoster',
                            entryId: e.id,
                            decision: 'approve',
                            revision: e.rosterRevision ?? 0,
                          }
                        : {
                            type: 'review',
                            revision: e.rosterRevision,
                            entryId: e.id,
                            decision: 'approve',
                          },
                      changeRequest
                        ? '명단 변경을 승인했어요.'
                        : team
                          ? '상대팀 매칭을 확정했어요.'
                          : '참가를 승인했어요.',
                    )
                  }
                >
                  {changeRequest ? '변경 승인' : '승인'}
                </button>
              </div>
            )}
          </section>
        )
      })}
      {!groups[tab].length && (
        <div className="empty">
          <ClipboardList />
          <strong>
            {tab === 'pending'
              ? '대기 중인 신청이 없어요'
              : tab === 'approved'
                ? '승인한 신청이 없어요'
                : '취소·거절·미선정 내역이 없어요'}
          </strong>
        </div>
      )}
    </div>
  )
}
