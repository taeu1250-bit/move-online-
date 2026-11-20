import { requireValue } from './identity.mjs'
import { operationPolicy as P } from '../src/domain/operations.ts'
const q = (db, sql, ...a) => db.prepare(sql).bind(...a)
const uid = () => crypto.randomUUID()
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('')
export async function inviteLink(db, actor, input, read = false) {
  const at = Date.now()
  requireValue(
    await q(db, 'SELECT 1 FROM profiles WHERE id=?', actor).first(),
    403,
    '프로필 등록 후 초대를 확인해 주세요.',
  )
  if (read) {
    requireValue(
      typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token),
      400,
      '초대 링크를 확인해 주세요.',
    )
    const row = await q(
      db,
      `SELECT t.name,t.sport,l.expiresAt,l.id FROM team_invite_links l JOIN teams t ON t.id=l.teamId WHERE l.tokenHash=? AND l.expiresAt>? AND l.usedBy IS NULL AND l.revokedAt IS NULL AND t.archivedAt IS NULL`,
      await hash(input.token),
      at,
    ).first()
    requireValue(
      row,
      410,
      '만료되거나 사용된 초대 링크예요. 새 초대를 요청해 주세요.',
    )
    return row
  }
  if (input.teamId) {
    const team = await q(
      db,
      'SELECT id FROM teams WHERE id=? AND ownerId=? AND archivedAt IS NULL',
      input.teamId,
      actor,
    ).first()
    requireValue(team, 403, '팀 대표만 초대 링크를 만들 수 있어요.')
    const token = uid().replaceAll('-', '') + uid().replaceAll('-', ''),
      id = uid(),
      expiresAt = at + P.inviteHours * 3600000
    await q(
      db,
      'INSERT INTO team_invite_links(id,teamId,createdBy,tokenHash,expiresAt) VALUES(?,?,?,?,?)',
      id,
      input.teamId,
      actor,
      await hash(token),
      expiresAt,
    ).run()
    return { token, expiresAt, id }
  }
  if (input.revokeId) {
    const r = await q(
      db,
      'UPDATE team_invite_links SET revokedAt=? WHERE id=? AND createdBy=? AND usedBy IS NULL',
      at,
      input.revokeId,
      actor,
    ).run()
    requireValue(r.meta.changes, 409, '이미 사용됐거나 다른 대표자의 링크예요.')
    return { ok: true }
  }
  requireValue(input.accept === true, 400, '팀 가입에 동의한 뒤 수락해 주세요.')
  const valid = await inviteLink(db, actor, input, true),
    mutation = uid()
  const result = await db.batch([
    q(
      db,
      `UPDATE team_invite_links SET usedBy=?,usedAt=?,usedMutation=? WHERE id=? AND usedBy IS NULL AND revokedAt IS NULL AND expiresAt>? AND EXISTS(SELECT 1 FROM teams t WHERE t.id=team_invite_links.teamId AND t.ownerId<>? AND t.archivedAt IS NULL)`,
      actor,
      at,
      mutation,
      valid.id,
      at,
      actor,
    ),
    q(
      db,
      `INSERT INTO team_members(id,teamId,userId,status,updatedAt) SELECT ?,teamId,?,'accepted',? FROM team_invite_links WHERE id=? AND usedMutation=? ON CONFLICT(teamId,userId) DO UPDATE SET status='accepted',updatedAt=excluded.updatedAt`,
      mutation,
      actor,
      new Date(at).toISOString(),
      valid.id,
      mutation,
    ),
  ])
  requireValue(
    result[0].meta.changes,
    409,
    '이미 사용된 링크예요. 본인 팀의 링크는 수락할 수 없어요.',
  )
  return { ok: true }
}
