import { HttpError, requireValue } from './identity.mjs'
import { sports, isTeamSport } from '../src/domain/model.ts'

const uuid = () => crypto.randomUUID()
const ownerCheck =
  'EXISTS(SELECT 1 FROM teams t WHERE t.id=team_members.teamId AND t.ownerId=? AND t.archivedAt IS NULL)'
const trimmed = (value, limit, required = false) => {
  requireValue(
    typeof value === 'string' &&
      value.trim().length <= limit &&
      (!required || value.trim().length > 0),
    400,
    '입력한 팀 정보와 이름을 확인해 주세요.',
  )
  return value.trim().normalize('NFC')
}
const bind = (db, sql, ...args) => db.prepare(sql).bind(...args)
const changed = (result) =>
  requireValue(
    result.meta.changes > 0,
    409,
    '팀 또는 초대 상태가 바뀌었어요. 다시 확인해 주세요.',
  )

function fields(input) {
  requireValue(
    input && sports.includes(input.sport),
    400,
    '주요 활동 종목을 선택해 주세요.',
  )
  return [
    trimmed(input.name, 40, true),
    input.sport,
    trimmed(input.affiliation, 80),
    trimmed(input.bio, 300),
  ]
}

// Each old environment grant receives a stable team ID. Only the first import
// sets its mode, so an explicit switch to personal remains effective across devices.
async function importLegacy(db, actor, env) {
  if (!env?.MOOV_TEAM_LEADERS) return
  const mapping = JSON.parse(env.MOOV_TEAM_LEADERS)
  const legacy = Object.hasOwn(mapping, actor) && mapping[actor]
  if (
    !legacy ||
    !isTeamSport(legacy.sport) ||
    typeof legacy.name !== 'string' ||
    !legacy.name.trim() ||
    legacy.name.length > 40
  )
    return
  const id = 'legacy:' + actor
  if (await bind(db, 'SELECT 1 FROM teams WHERE id=?', id).first()) return
  await db.batch([
    bind(
      db,
      `INSERT INTO teams(id,ownerId,name,sport) SELECT ?,id,?,? FROM profiles WHERE id=?
      ON CONFLICT(id) DO NOTHING`,
      id,
      legacy.name.trim(),
      legacy.sport,
      actor,
    ),
    bind(
      db,
      `INSERT INTO team_preferences(userId,activeTeamId) SELECT ownerId,id FROM teams WHERE id=? AND ownerId=?
      ON CONFLICT(userId) DO NOTHING`,
      id,
      actor,
    ),
  ])
}

export async function getActiveTeam(db, actor, env) {
  await importLegacy(db, actor, env)
  return bind(
    db,
    `SELECT t.id,t.name,t.sport FROM team_preferences p JOIN teams t ON t.id=p.activeTeamId
    WHERE p.userId=? AND t.ownerId=p.userId AND t.archivedAt IS NULL`,
    actor,
  ).first()
}

export async function teamState(db, actor, env) {
  await importLegacy(db, actor, env)
  const [settings, teams, members, memberships] = await db.batch([
    bind(
      db,
      'SELECT activeTeamId,inviteCode FROM team_preferences WHERE userId=?',
      actor,
    ),
    bind(
      db,
      `SELECT id,name,sport,affiliation,bio,revision,archivedAt FROM teams WHERE ownerId=? ORDER BY archivedAt IS NOT NULL,name,id`,
      actor,
    ),
    bind(
      db,
      `SELECT tm.id,tm.teamId,CASE WHEN tm.status='accepted' THEN tm.userId END AS userId,
      coalesce(tm.guestName,p.name) AS name,tm.status FROM team_members tm JOIN teams t ON t.id=tm.teamId
      LEFT JOIN profiles p ON p.id=tm.userId WHERE t.ownerId=? AND t.archivedAt IS NULL AND tm.status IN ('guest','pending','accepted')
      ORDER BY tm.updatedAt,tm.id`,
      actor,
    ),
    bind(
      db,
      `SELECT tm.id,tm.teamId,t.name AS teamName,t.sport,p.name AS ownerName,tm.status
      FROM team_members tm JOIN teams t ON t.id=tm.teamId JOIN profiles p ON p.id=t.ownerId
      WHERE tm.userId=? AND tm.status IN ('pending','accepted') AND t.archivedAt IS NULL ORDER BY tm.updatedAt DESC`,
      actor,
    ),
  ])
  const prefs = settings.results[0]
  const byTeam = new Map()
  for (const { teamId, ...member } of members.results) {
    if (!byTeam.has(teamId)) byTeam.set(teamId, [])
    byTeam.get(teamId).push(member)
  }
  return {
    activeTeamId: prefs?.activeTeamId ?? null,
    inviteCode: prefs?.inviteCode ?? null,
    owned: teams.results.map((t) => ({
      ...t,
      members: byTeam.get(t.id) || [],
    })),
    memberships: memberships.results,
  }
}

export async function teamCommand(db, actor, c, env) {
  if (
    [
      'team.edit',
      'team.archive',
      'team.guest',
      'team.remove',
      'team.invite',
    ].includes(c.type)
  )
    requireValue(
      typeof c.teamId === 'string' && c.teamId.length <= 160,
      400,
      '대상 팀을 확인해 주세요.',
    )
  if (['team.reply', 'team.remove', 'team.leave'].includes(c.type))
    requireValue(
      typeof c.memberId === 'string' && c.memberId.length <= 40,
      400,
      '대상 팀원을 확인해 주세요.',
    )
  if (['team.edit', 'team.archive'].includes(c.type))
    requireValue(
      Number.isSafeInteger(c.revision) && c.revision >= 0,
      400,
      '팀 정보를 다시 불러와 주세요.',
    )
  await importLegacy(db, actor, env)
  const q = (sql, ...args) => bind(db, sql, ...args)
  const at = new Date().toISOString()
  requireValue(
    c.type !== 'team.guest' && !(c.type === 'team.create' && c.guests?.length),
    400,
    '이름만 등록하는 방식은 종료됐어요. 회원을 초대해 주세요.',
  )
  switch (c.type) {
    case 'team.inviteMember': {
      requireValue(
        typeof c.userId === 'string' && c.userId !== actor,
        400,
        '초대할 회원을 선택해 주세요.',
      )
      changed(
        await q(
          "INSERT INTO team_members(id,teamId,userId,status,updatedAt) SELECT ?,t.id,p.id,'pending',? FROM teams t JOIN profiles p ON p.id=? WHERE t.id=? AND t.ownerId=? AND t.archivedAt IS NULL ON CONFLICT(teamId,userId) DO UPDATE SET status='pending',updatedAt=excluded.updatedAt WHERE team_members.status NOT IN ('accepted','pending')",
          uuid(),
          at,
          c.userId,
          c.teamId,
          actor,
        ).run(),
      )
      break
    }
    case 'team.create': {
      const values = fields(c.fields)
      requireValue(
        typeof c.id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(c.id),
        400,
        '팀 등록을 다시 시도해 주세요.',
      )
      requireValue(
        Array.isArray(c.guests) && c.guests.length <= 99,
        400,
        '팀원 명단을 확인해 주세요.',
      )
      const names = c.guests.map((n) => trimmed(n, 30, true))
      requireValue(
        new Set(names).size === names.length,
        400,
        '같은 이름이 두 번 입력됐어요.',
      )
      // A duplicate command fails its first statement and rolls back the entire batch.
      try {
        await db.batch([
          q(
            'INSERT INTO teams(id,ownerId,name,sport,affiliation,bio) VALUES(?,?,?,?,?,?)',
            c.id,
            actor,
            ...values,
          ),
          q(
            `INSERT INTO team_preferences(userId,activeTeamId) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET activeTeamId=excluded.activeTeamId`,
            actor,
            c.id,
          ),
          ...names.map((n) =>
            q(
              "INSERT INTO team_members(id,teamId,guestName,status,updatedAt) VALUES(?,?,?,'guest',?)",
              uuid(),
              c.id,
              n,
              at,
            ),
          ),
        ])
      } catch (error) {
        if (await q('SELECT 1 FROM teams WHERE id=?', c.id).first())
          throw new HttpError(409, '이미 등록된 팀이에요.')
        throw error
      }
      break
    }
    case 'team.edit': {
      const values = fields(c.fields)
      changed(
        await q(
          'UPDATE teams SET name=?,sport=?,affiliation=?,bio=?,revision=revision+1 WHERE id=? AND ownerId=? AND archivedAt IS NULL AND revision=?',
          ...values,
          c.teamId,
          actor,
          c.revision,
        ).run(),
      )
      break
    }
    case 'team.archive': {
      const result = await db.batch([
        q(
          'UPDATE teams SET archivedAt=?,revision=revision+1 WHERE id=? AND ownerId=? AND archivedAt IS NULL AND revision=?',
          at,
          c.teamId,
          actor,
          c.revision,
        ),
        q(
          'UPDATE team_preferences SET activeTeamId=NULL WHERE userId=? AND activeTeamId=? AND EXISTS(SELECT 1 FROM teams WHERE id=? AND ownerId=? AND archivedAt IS NOT NULL)',
          actor,
          c.teamId,
          c.teamId,
          actor,
        ),
      ])
      changed(result[0])
      break
    }
    case 'team.switch': {
      requireValue(
        c.teamId === null || typeof c.teamId === 'string',
        400,
        '활동할 팀을 선택해 주세요.',
      )
      changed(
        await q(
          `INSERT INTO team_preferences(userId,activeTeamId) SELECT ?,? WHERE ? IS NULL
        OR EXISTS(SELECT 1 FROM teams WHERE id=? AND ownerId=? AND archivedAt IS NULL)
        ON CONFLICT(userId) DO UPDATE SET activeTeamId=excluded.activeTeamId`,
          actor,
          c.teamId,
          c.teamId,
          c.teamId,
          actor,
        ).run(),
      )
      break
    }
    case 'team.guest':
      changed(
        await q(
          `INSERT INTO team_members(id,teamId,guestName,status,updatedAt)
        SELECT ?,id,?,'guest',? FROM teams WHERE id=? AND ownerId=? AND archivedAt IS NULL
        ON CONFLICT DO NOTHING`,
          uuid(),
          trimmed(c.name, 30, true),
          at,
          c.teamId,
          actor,
        ).run(),
      )
      break
    case 'team.remove':
      changed(
        await q(
          `DELETE FROM team_members WHERE id=? AND teamId=? AND ${ownerCheck}`,
          c.memberId,
          c.teamId,
          actor,
        ).run(),
      )
      break
    case 'team.code': {
      const code = uuid().replaceAll('-', '')
      await q(
        `INSERT INTO team_preferences(userId,inviteCode) VALUES(?,?) ON CONFLICT(userId) DO UPDATE
        SET inviteCode=coalesce(team_preferences.inviteCode,excluded.inviteCode)`,
        actor,
        code,
      ).run()
      break
    }
    case 'team.invite': {
      const code = trimmed(c.code, 64, true).toLowerCase().replaceAll('-', '')
      requireValue(
        /^[0-9a-f]{32}$/.test(code),
        400,
        '회원이 공유한 초대 코드를 확인해 주세요.',
      )
      changed(
        await q(
          `INSERT INTO team_members(id,teamId,userId,status,updatedAt)
        SELECT ?,t.id,p.userId,'pending',? FROM teams t JOIN team_preferences p ON p.inviteCode=?
        WHERE t.id=? AND t.ownerId=? AND p.userId<>t.ownerId AND t.archivedAt IS NULL
        ON CONFLICT(teamId,userId) DO UPDATE SET status='pending',updatedAt=excluded.updatedAt
        WHERE team_members.status='declined'`,
          uuid(),
          at,
          code,
          c.teamId,
          actor,
        ).run(),
      )
      break
    }
    case 'team.reply':
      requireValue(
        typeof c.accept === 'boolean',
        400,
        '초대 응답을 확인해 주세요.',
      )
      changed(
        await q(
          `UPDATE team_members SET status=?,updatedAt=? WHERE id=? AND userId=? AND status='pending'
        AND EXISTS(SELECT 1 FROM teams WHERE id=team_members.teamId AND archivedAt IS NULL)`,
          c.accept ? 'accepted' : 'declined',
          at,
          c.memberId,
          actor,
        ).run(),
      )
      break
    case 'team.leave':
      changed(
        await q(
          "DELETE FROM team_members WHERE id=? AND userId=? AND status='accepted'",
          c.memberId,
          actor,
        ).run(),
      )
      break
    default:
      throw new HttpError(400, '지원하지 않는 팀 요청이에요.')
  }
}

// Bind JSON.stringify(ids), actor and teamId to this expression inside a match
// INSERT or UPDATE. An acceptance revoked after the UI loaded cannot be used.
export const rosterLinksGuard = `NOT EXISTS(SELECT 1 FROM json_each(?) requested
  WHERE requested.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_members tm
    JOIN teams t ON t.id=tm.teamId WHERE tm.userId=requested.value AND tm.status='accepted'
    AND t.ownerId=? AND t.id=? AND t.archivedAt IS NULL))`

export async function resolveRosterLinks(db, actor, teamId, names, linkedIds) {
  requireValue(
    Array.isArray(names) && names.length <= 29,
    400,
    '참가자 명단을 확인해 주세요.',
  )
  const ids = linkedIds ?? names.map(() => null)
  requireValue(
    Array.isArray(ids) &&
      ids.length === names.length &&
      ids.every(
        (id) =>
          id === null ||
          (typeof id === 'string' &&
            id.length > 0 &&
            id.length <= 128 &&
            id !== actor),
      ),
    400,
    '연결할 팀원을 확인해 주세요.',
  )
  const selected = ids.filter((id) => id !== null)
  requireValue(
    new Set(selected).size === selected.length,
    400,
    '같은 회원을 두 번 선택했어요.',
  )
  if (!selected.length) return { names, ids }
  requireValue(typeof teamId === 'string', 403, '활동할 팀을 선택해 주세요.')
  const rows = await bind(
    db,
    `SELECT p.id,p.name FROM team_members m JOIN teams t ON t.id=m.teamId JOIN profiles p ON p.id=m.userId
    WHERE t.ownerId=? AND t.id=? AND t.archivedAt IS NULL AND m.status='accepted'
    AND p.id IN (SELECT value FROM json_each(?))`,
    actor,
    teamId,
    JSON.stringify(selected),
  ).all()
  requireValue(
    rows.results.length === selected.length,
    403,
    '초대를 수락한 내 팀원만 회원으로 연결할 수 있어요.',
  )
  const canonical = new Map(rows.results.map((row) => [row.id, row.name]))
  return {
    names: names.map((name, i) =>
      ids[i] === null ? name : canonical.get(ids[i]),
    ),
    ids,
  }
}
