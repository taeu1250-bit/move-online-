import { useState } from 'react'
import { ShareTeamInvite } from './Operations'
import type { FormEvent } from 'react'
import { sports, fmtDate, statusLabel } from '../domain/model'
import type { Team, TeamFields, TeamHub, TeamMember } from '../domain/teams'
import { useMoov, go } from '../ui/context'
import { BackTitle } from '../ui/common'

export function TeamMode() {
  const { data, user, act, busy } = useMoov()
  const hub = data.teamHub
  if (!hub) return null
  const active = hub.owned.find((t) => t.id === hub.activeTeamId)
  const pending = hub.memberships.filter((m) => m.status === 'pending').length
  return (
    <section className="panel">
      <div className="section-head">
        <h2>활동 모드</h2>
        <span className="tag mode-active">
          {active ? '팀 대표자' : '개인회원'}
        </span>
      </div>
      {active && (
        <p>
          {active.name} · {active.sport}
        </p>
      )}
      <div className="mode-buttons">
        <button
          className={!active ? 'primary' : 'secondary'}
          disabled={busy}
          aria-pressed={!active}
          onClick={() => void act({ type: 'team.switch', teamId: null })}
        >
          개인회원
        </button>
        <button
          className={active ? 'primary' : 'secondary'}
          aria-pressed={!!active}
          onClick={() => go('teams')}
        >
          팀 대표자
        </button>
      </div>
      <div className="action-pair">
        {active ? (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(
                { type: 'team.switch', teamId: null },
                '개인회원으로 전환했어요.',
              )
            }
          >
            개인회원으로 전환
          </button>
        ) : (
          <button
            className="primary"
            onClick={() =>
              go(hub.owned.some((t) => !t.archivedAt) ? 'teams' : 'teams?new=1')
            }
          >
            {hub.owned.some((t) => !t.archivedAt)
              ? '팀 대표자로 전환'
              : '팀 대표자로 활동하기'}
          </button>
        )}
        <button className="secondary" onClick={() => go('teams')}>
          팀 설정{pending ? ' · ' + pending : ''}
        </button>
      </div>
      {pending > 0 && (
        <p className="hint">{user.name}님에게 도착한 팀 초대가 있어요.</p>
      )}
    </section>
  )
}

function TeamForm({ team, done }: { team?: Team; done: () => void }) {
  const { act, busy } = useMoov()
  const [id] = useState(() => crypto.randomUUID())
  const [fields, setFields] = useState<TeamFields>(
    team
      ? {
          name: team.name,
          sport: team.sport,
          affiliation: team.affiliation,
          bio: team.bio,
        }
      : { name: '', sport: '풋살', affiliation: '', bio: '' },
  )
  const [revision] = useState(team?.revision ?? 0)

  const change = (key: 'name' | 'bio' | 'affiliation', value: string) =>
    setFields((f) => ({ ...f, [key]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault()
    const saved = team
      ? await act(
          { type: 'team.edit', teamId: team.id, revision, fields },
          '팀 정보를 저장했어요.',
        )
      : await act(
          { type: 'team.create', id, fields, guests: [] },
          '팀을 등록하고 대표자 모드로 전환했어요.',
        )
    if (saved) done()
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>{team ? '팀 정보 수정' : '새 팀 등록'}</h2>
      <label>
        팀 이름
        <input
          required
          maxLength={40}
          value={fields.name}
          onChange={(e) => change('name', e.target.value)}
        />
      </label>
      <label>
        주요 활동 종목
        <select
          value={fields.sport}
          onChange={(e) =>
            setFields((f) => ({
              ...f,
              sport: e.target.value as TeamFields['sport'],
            }))
          }
        >
          {sports.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        소속 동아리 또는 단체 <small>선택</small>
        <input
          maxLength={80}
          value={fields.affiliation}
          onChange={(e) => change('affiliation', e.target.value)}
        />
      </label>
      <label>
        팀 소개 <small>선택</small>
        <textarea
          rows={2}
          maxLength={300}
          value={fields.bio}
          onChange={(e) => change('bio', e.target.value)}
        />
      </label>
      {team && team.revision !== revision && (
        <p role="status">팀 정보가 바뀌었어요. 수정 화면을 다시 열어 주세요.</p>
      )}
      <div className="action-pair">
        <button type="button" className="secondary" onClick={done}>
          닫기
        </button>
        <button
          className="primary"
          disabled={busy || (!!team && team.revision !== revision)}
        >
          {team ? '수정 저장' : '팀 등록'}
        </button>
      </div>
    </form>
  )
}

function Invitations({ hub }: { hub: TeamHub }) {
  const { act, busy } = useMoov()
  const [copied, setCopied] = useState(false)
  const received = hub.memberships.filter((m) => m.status === 'pending')
  const joined = hub.memberships.filter((m) => m.status === 'accepted')
  return (
    <section className="panel stack">
      <h2>팀원 초대</h2>
      {received.map((m) => (
        <div key={m.id}>
          <strong>{m.teamName}</strong>
          <p className="hint">
            {m.sport} · {m.ownerName}님의 초대
          </p>
          <p className="hint">
            수락하면 팀 대표자가 경기 명단에 내 회원 계정을 선택할 수 있어요.
          </p>
          <div className="action-pair">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(
                  { type: 'team.reply', memberId: m.id, accept: false },
                  '초대를 거절했어요.',
                )
              }
            >
              거절
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(
                  { type: 'team.reply', memberId: m.id, accept: true },
                  '팀에 합류했어요.',
                )
              }
            >
              초대 수락
            </button>
          </div>
        </div>
      ))}
      {hub.inviteCode ? (
        <>
          <label>
            내 초대 코드
            <input
              readOnly
              value={hub.inviteCode}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(hub.inviteCode!)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? '복사했어요' : '코드 복사'}
          </button>
        </>
      ) : (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void act({ type: 'team.code' })}
        >
          내 초대 코드 만들기
        </button>
      )}
      <p className="hint">
        받은 코드를 팀 대표자에게 전달하고 이곳에서 초대를 수락하세요.
      </p>
      {joined.length > 0 && (
        <details>
          <summary>팀원으로 가입한 팀 · {joined.length}</summary>
          {joined.map((m) => (
            <div key={m.id} className="form-row">
              <span>
                {m.teamName} · {m.sport}
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (confirm(m.teamName + '에서 나올까요?'))
                    void act(
                      { type: 'team.leave', memberId: m.id },
                      '팀에서 나왔어요.',
                    )
                }}
              >
                팀 나가기
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}

function TeamPanel({
  team,
  active,
  edit,
}: {
  team: Team
  active: boolean
  edit: () => void
}) {
  const { data, user, act, busy } = useMoov()
  const legacy = team.id === 'legacy:' + user.id
  const history = data.matches
    .flatMap((m) => {
      const hosted =
        m.hostId === user.id &&
        (m.hostTeamId === team.id || (legacy && !m.hostTeamId && !!m.homeTeam))
      const entry = data.entries.find(
        (e) =>
          e.matchId === m.id &&
          e.userId === user.id &&
          (e.teamId === team.id || (legacy && !e.teamId && !!e.team)),
      )
      return hosted || entry
        ? [{ match: m, label: hosted ? '모집' : statusLabel[entry!.status] }]
        : []
    })
    .sort((a, b) => b.match.start.localeCompare(a.match.start))
  async function remove(member: TeamMember) {
    if (confirm(member.name + '님을 팀 명단에서 삭제할까요?'))
      await act(
        { type: 'team.remove', teamId: team.id, memberId: member.id },
        '명단을 갱신했어요.',
      )
  }
  return (
    <section className="panel stack">
      <div className="section-head">
        <h2>{team.name}</h2>
        <span className="tag">
          {team.archivedAt ? '보관된 팀' : active ? '활동 중' : team.sport}
        </span>
      </div>
      <p className="hint">
        {[team.sport, team.affiliation].filter(Boolean).join(' · ')}
      </p>
      {team.bio && <p>{team.bio}</p>}
      {!team.archivedAt && (
        <>
          <div className="action-pair">
            {!active && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(
                    { type: 'team.switch', teamId: team.id },
                    team.name + ' 대표자로 전환했어요.',
                  )
                }
              >
                이 팀으로 활동
              </button>
            )}
            <button className="secondary" onClick={edit}>
              팀 정보 수정
            </button>
          </div>
          <details>
            <summary>
              팀원 관리 ·{' '}
              {1 + team.members.filter((m) => m.status !== 'pending').length}명
            </summary>
            <p>{user.name} · 대표자</p>
            {team.members.map((m) => (
              <div className="form-row" key={m.id}>
                <span>
                  {m.name}{' '}
                  <small>
                    {m.status === 'accepted'
                      ? '연결된 회원'
                      : m.status === 'pending'
                        ? '수락 대기'
                        : '직접 입력'}
                  </small>
                </span>
                <button
                  className="secondary"
                  aria-label={m.name + ' 삭제'}
                  disabled={busy}
                  onClick={() => void remove(m)}
                >
                  삭제
                </button>
              </div>
            ))}
            <MemberSearch teamId={team.id} />
            <ShareTeamInvite teamId={team.id} />
          </details>
        </>
      )}
      <details>
        <summary>팀 경기 내역 · {history.length}건</summary>
        {history.length === 0 ? (
          <p className="hint">아직 등록된 경기가 없어요.</p>
        ) : (
          history.map(({ match, label }) => (
            <p key={match.id}>
              <a href={'#/match/' + match.id}>
                {match.title} · {fmtDate(match.start)} · {label}
              </a>
            </p>
          ))
        )}
      </details>
      {!team.archivedAt && (
        <details>
          <summary>팀 보관</summary>
          <p className="hint">
            기존 경기 기록을 유지한 채 이 팀의 활동을 종료해요.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (confirm(team.name + '의 활동을 종료할까요?'))
                void act(
                  {
                    type: 'team.archive',
                    teamId: team.id,
                    revision: team.revision,
                  },
                  '팀을 보관했어요.',
                )
            }}
          >
            팀 보관하기
          </button>
        </details>
      )}
    </section>
  )
}

export function Teams() {
  const { data } = useMoov()
  const hub = data.teamHub
  const [editing, setEditing] = useState<string | null>(() =>
    location.hash.includes('new=1') ? 'new' : null,
  )
  if (!hub)
    return (
      <div className="narrow">
        <BackTitle title="팀 설정" back="profile" />
        <p>팀 정보를 불러오는 중이에요.</p>
      </div>
    )
  const selected = hub.owned.find((t) => t.id === editing)
  return (
    <div className="narrow stack">
      <BackTitle title="팀 설정" back="profile" />
      {editing === 'new' || selected ? (
        <TeamForm key={editing} team={selected} done={() => setEditing(null)} />
      ) : (
        <>
          <button className="primary" onClick={() => setEditing('new')}>
            새 팀 등록
          </button>
          {hub.owned.map((t) => (
            <TeamPanel
              key={t.id}
              team={t}
              active={t.id === hub.activeTeamId}
              edit={() => setEditing(t.id)}
            />
          ))}
          <Invitations hub={hub} />
        </>
      )}
    </div>
  )
}

function MemberSearch({ teamId }: { teamId: string }) {
  const { services, act, busy, run } = useMoov(),
    [query, setQuery] = useState(''),
    [members, setMembers] = useState<
      { id: string; name: string; year: number }[]
    >([]),
    [searched, setSearched] = useState(false)
  return (
    <details>
      <summary>+ 팀원 초대하기</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            setMembers(await services.searchMembers!(query))
            setSearched(true)
          })
        }}
      >
        <label>
          뭅 회원 이름
          <input
            value={query}
            minLength={2}
            maxLength={30}
            required
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || query.trim().length < 2}
        >
          회원 검색
        </button>
      </form>
      <div className="member-search-results">
        {members.map((m) => (
          <button
            key={m.id}
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(
                { type: 'team.inviteMember', teamId, userId: m.id },
                '초대를 보냈어요. 회원이 수락하면 팀에 가입돼요.',
              )
            }
          >
            <span>
              {m.name} · {String(m.year).slice(-2)}학번
            </span>
            <b>초대</b>
          </button>
        ))}
      </div>
      {searched && !members.length && (
        <p className="hint">검색된 회원이 없어요.</p>
      )}
      <p className="hint">
        이메일은 공개하지 않아요. 팀 가입 후에도 경기별 참가 동의가 필요해요.
      </p>
    </details>
  )
}
