import { requireValue } from './identity.mjs'
import {
  operationPolicy as P,
  postReasons,
  participantReasons,
} from '../src/domain/operations.ts'
const q = (db, sql, ...a) => db.prepare(sql).bind(...a)
const uuid = () => crypto.randomUUID()
const ok = (v, message, code = 403) => requireValue(v, code, message)
export function isAdmin(env, actor) {
  try {
    return JSON.parse(env.MOOV_ADMIN_UIDS || '[]').includes(actor)
  } catch {
    return false
  }
}
const attended = `EXISTS(SELECT 1 FROM attendance a WHERE a.matchId=m.id AND a.userId=? AND a.status='present')`
export async function reportCommand(db, actor, c, env) {
  const at = Date.now()
  if (c.type === 'ops.report') {
    ok(
      ['post', 'user', 'operation'].includes(c.category),
      '신고 유형을 확인해 주세요.',
      400,
    )
    const allowed =
      c.category === 'post'
        ? postReasons
        : c.category === 'user'
          ? participantReasons
          : ['실제로 진행되지 않은 경기']
    ok(allowed.includes(c.reason), '신고 사유를 확인해 주세요.', 400)
    const m = await q(db, 'SELECT * FROM matches WHERE id=?', c.matchId).first()
    ok(m, '경기가 없어요.', 404)
    const target = c.category === 'user' ? c.targetId : m.hostId
    ok(target !== actor, '본인 신고는 할 수 없어요.', 400)
    let permission = '1=1',
      args = []
    if (c.category === 'user') {
      permission = `m.cancelledAt IS NULL AND CASE WHEN EXISTS(SELECT 1 FROM match_operations WHERE matchId=m.id) THEN (SELECT json_extract(state,'$.endedAt') FROM match_operations WHERE matchId=m.id) ELSE unixepoch(m.endAt)*1000 END<=? AND NOT EXISTS(SELECT 1 FROM report_cases WHERE matchId=m.id AND category='operation' AND state='confirmed') AND ${attended} AND ${attended}`
      args = [at, actor, target]
    } else if (c.category === 'operation') {
      permission = `EXISTS(SELECT 1 FROM match_operations o,json_each(o.state,'$.people') p WHERE o.matchId=m.id AND json_extract(p.value,'$.userId')=? AND json_extract(p.value,'$.approved')=1 AND json_extract(p.value,'$.consent')='accepted') OR (NOT EXISTS(SELECT 1 FROM match_operations WHERE matchId=m.id) AND EXISTS(SELECT 1 FROM entries e WHERE e.matchId=m.id AND e.status='approved' AND (e.userId=? OR ? IN (SELECT value FROM json_each(e.memberIds)))))`
      args = [actor, actor, actor]
    }
    ok(
      await q(
        db,
        `SELECT 1 FROM matches m WHERE id=? AND (${permission})`,
        m.id,
        ...args,
      ).first(),
      '같은 경기에 참가한 회원만 신고할 수 있어요.',
    )
    const caseId = [c.category, m.id, target].join(':'),
      reportId = uuid()
    const results = await db.batch([
      q(
        db,
        `INSERT INTO report_cases(id,matchId,targetId,category) SELECT ?,m.id,?,? FROM matches m WHERE m.id=? AND (${permission}) ON CONFLICT DO NOTHING`,
        caseId,
        target,
        c.category,
        m.id,
        ...args,
      ),
      q(
        db,
        `INSERT INTO participant_reports(id,caseId,reporter,reason,at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM matches m WHERE m.id=? AND (${permission})) AND (SELECT count(*) FROM participant_reports WHERE reporter=? AND at>?)<5 ON CONFLICT DO NOTHING`,
        reportId,
        caseId,
        actor,
        c.reason,
        at,
        m.id,
        ...args,
        actor,
        at - 86400000,
      ),
    ])
    ok(
      results[1].meta.changes,
      '이미 신고했거나 하루 신고 횟수를 초과했어요.',
      409,
    )
    return true
  }
  if (c.type === 'ops.reportAppeal') {
    ok(
      typeof c.message === 'string' &&
        c.message.trim() &&
        c.message.length <= 500,
      '이의제기 내용을 입력해 주세요.',
      400,
    )
    const r = await q(
      db,
      "UPDATE report_cases SET appeal=?,appealedAt=?,revision=revision+1 WHERE id=? AND targetId=? AND state='confirmed' AND appeal IS NULL",
      c.message.trim(),
      at,
      c.caseId,
      actor,
    ).run()
    ok(r.meta.changes, '본인에게 확정된 제재에 이의제기할 수 있어요.', 409)
    return true
  }
  if (c.type !== 'ops.reportDecision') return false
  ok(isAdmin(env, actor), '운영자만 신고를 처리할 수 있어요.')
  ok(
    ['confirm', 'dismiss', 'correct'].includes(c.decision) &&
      typeof c.reason === 'string' &&
      c.reason.trim() &&
      c.reason.length <= 500,
    '처리 근거를 입력해 주세요.',
    400,
  )
  const r = await q(
    db,
    'SELECT * FROM report_cases WHERE id=?',
    c.caseId,
  ).first()
  ok(r, '신고가 없어요.', 404)
  const correcting = c.decision === 'correct',
    confirm = c.decision === 'confirm'
  ok(
    correcting ? r.state === 'confirmed' : r.state === 'pending',
    '이미 처리된 신고예요.',
    409,
  )
  const state = confirm ? 'confirmed' : correcting ? 'corrected' : 'dismissed',
    rev = r.revision + 1
  const guard =
    'EXISTS(SELECT 1 FROM report_cases WHERE id=? AND revision=? AND state=?)'
  const batch = [
    q(
      db,
      'UPDATE report_cases SET state=?,reason=?,reviewer=?,resolvedAt=?,revision=? WHERE id=? AND revision=?',
      state,
      c.reason.trim(),
      actor,
      at,
      rev,
      r.id,
      r.revision,
    ),
  ]
  if (r.category === 'user' && (confirm || correcting))
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        uuid(),
        r.targetId,
        r.matchId,
        confirm ? 'report_penalty' : 'report_correction',
        confirm ? P.reportTenths : -P.reportTenths,
        r.id,
        at,
        r.id,
        rev,
        state,
      ),
    )
  if (r.category === 'operation' && confirm) {
    // Invalidate attendance evidence; preserve original reports and audit every correction.
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at) SELECT lower(hex(randomblob(16))),a.userId,a.matchId,'invalid_attendance',-2,?||':'||a.id,? FROM attendance a WHERE a.matchId=? AND a.status='present' AND a.userId IS NOT NULL AND ${guard}`,
        r.id,
        at,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at) SELECT lower(hex(randomblob(16))),p.recipient,p.matchId,'invalid_praise',-1,?||':'||p.id,? FROM praises p WHERE p.matchId=? AND ${guard}`,
        r.id,
        at,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
    batch.push(
      q(
        db,
        `UPDATE attendance SET status='unknown',changedAt=? WHERE matchId=? AND ${guard}`,
        at,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at) SELECT lower(hex(randomblob(16))),n.subjectId,n.matchId,'invalid_noshow',30,?||':'||n.id,? FROM noShows n WHERE n.matchId=? AND n.state='confirmed' AND n.subjectId IS NOT NULL AND ${guard}`,
        r.id,
        at,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
    batch.push(
      q(
        db,
        `UPDATE noShows SET state='dismissed',reason='실제 미진행 경기 확인으로 노쇼 정정',resolvedBy=?,resolvedAt=? WHERE matchId=? AND state IN ('pending','appealed','confirmed') AND ${guard}`,
        actor,
        at,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
    batch.push(
      q(
        db,
        `UPDATE match_operations SET state=json_set(state,'$.invalidated',1),revision=revision+1 WHERE matchId=? AND ${guard}`,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
  }
  if (r.category === 'operation' && correcting)
    batch.push(
      q(
        db,
        `UPDATE match_operations SET state=json_set(state,'$.invalidated',0),revision=revision+1 WHERE matchId=? AND ${guard}`,
        r.matchId,
        r.id,
        rev,
        state,
      ),
    )
  batch.push(
    q(
      db,
      `INSERT INTO notices(id,recipient,matchId,text,at) SELECT ?,?,?,?,? WHERE ${guard}`,
      uuid(),
      r.targetId,
      r.matchId,
      '운영자 신고 검토 결과 · ' +
        (confirm ? '확정' : correcting ? '정정' : '기각') +
        ' · ' +
        c.reason,
      new Date(at).toISOString(),
      r.id,
      rev,
      state,
    ),
  )
  batch.push(
    q(
      db,
      `INSERT INTO operation_audit(id,matchId,actor,action,detail,at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
      uuid(),
      r.matchId,
      actor,
      'report.' + c.decision,
      JSON.stringify({ caseId: r.id, reason: c.reason }),
      at,
      r.id,
      rev,
      state,
    ),
  )
  const result = await db.batch(batch)
  ok(result[0].meta.changes, '다른 운영자가 먼저 처리했어요.', 409)
  return true
}
export async function reportState(db, actor, env) {
  const admin = isAdmin(env, actor)
  const rows = await q(
    db,
    `SELECT c.*,m.title,p.name AS targetName,(SELECT count(*) FROM participant_reports r WHERE r.caseId=c.id) AS reporters, (SELECT json_group_array(reason) FROM participant_reports r WHERE r.caseId=c.id) AS reasons FROM report_cases c JOIN matches m ON m.id=c.matchId JOIN profiles p ON p.id=c.targetId WHERE ?=1 OR (c.targetId=? AND c.state<>'pending') ORDER BY (c.state='pending') DESC,reporters DESC,c.id`,
    Number(admin),
    actor,
  ).all()
  const audit = admin
    ? (
        await q(
          db,
          `SELECT a.id,a.matchId,a.action,a.detail,a.at,p.name AS actorName FROM operation_audit a LEFT JOIN profiles p ON p.id=a.actor WHERE a.matchId IN (SELECT DISTINCT matchId FROM report_cases) ORDER BY a.at DESC LIMIT 500`,
        ).all()
      ).results
    : []
  return rows.results.map(({ reviewer, ...r }) => ({
    ...r,
    priority: r.reporters >= P.priorityReports,
    reasons: JSON.parse(r.reasons),
    ...(admin
      ? {
          audit: audit
            .filter((a) => a.matchId === r.matchId)
            .map((a) => ({ ...a, detail: JSON.parse(a.detail) })),
        }
      : {}),
  }))
}
export async function mannerHistory(db, actor) {
  return (
    await q(
      db,
      `SELECT e.id,e.matchId,m.title,e.action,e.delta,e.at FROM conductEvents e JOIN matches m ON m.id=e.matchId WHERE e.userId=? ORDER BY e.at DESC,e.id`,
      actor,
    ).all()
  ).results
}
