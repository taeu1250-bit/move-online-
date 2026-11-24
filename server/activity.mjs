import { requireValue } from './identity.mjs'
import { snapshot } from './store.mjs'
import { runLifecycle } from './operations.mjs'

// Prefer an active application, then the latest historic one. Group members have
// their own consent/approval status, independent of the representative's entry.
const statusSQL = `coalesce(
  (SELECT e.status FROM entries e WHERE e.matchId=m.id AND e.userId=?1
    ORDER BY CASE WHEN e.status IN ('pending','approved') THEN 0 ELSE 1 END,e.at DESC,e.id DESC LIMIT 1),
  (SELECT CASE WHEN json_extract(p.value,'$.consent') IN ('cancelled','rejected') THEN json_extract(p.value,'$.consent')
    WHEN json_extract(p.value,'$.approved')=1 AND json_extract(p.value,'$.consent')='accepted' THEN 'approved' ELSE 'pending' END
    FROM match_operations o,json_each(o.state,'$.people') p
    WHERE o.matchId=m.id AND json_extract(p.value,'$.userId')=?1 ORDER BY p.key DESC LIMIT 1),
  (SELECT 'approved' FROM entries e WHERE e.matchId=m.id AND e.status='approved'
    AND ?1 IN (SELECT value FROM json_each(e.memberIds)) LIMIT 1),
  CASE WHEN ?1 IN (SELECT value FROM json_each(m.homeMemberIds)) THEN 'approved' END
)`
export async function activityPage(db, actor, env, { tab = 'joined', status = 'all', cursor = '', scope = 'current' } = {}) {
  requireValue(['joined','hosted'].includes(tab) && ['all','pending','approved'].includes(status) && ['current','history'].includes(scope),400,'활동 필터를 확인해 주세요.')
  let after = null
  if (cursor) {
    try { after = JSON.parse(cursor) } catch { /* rejected below */ }
    requireValue(cursor.length <= 600 && Array.isArray(after) && after.length === 2 &&
      typeof after[0] === 'string' && Number.isFinite(Date.parse(after[0])) &&
      typeof after[1] === 'string' && after[1].length > 0 && after[1].length <= 160,400,'지난 기록 조회 위치를 확인해 주세요.')
  }
  await runLifecycle(db)
  const now = Date.now()
  const page = await db.prepare(`
    SELECT id,start,activityStatus FROM (
      SELECT m.id,m.start,m.hostId,m.cancelledAt,${statusSQL} AS activityStatus,
        coalesce(json_extract(o.state,'$.endedAt'),json_extract(o.state,'$.end'),
          unixepoch(m.endAt)*1000,unixepoch(m.start)*1000+7200000) AS activityEnd
      FROM matches m LEFT JOIN match_operations o ON o.matchId=m.id
    ) WHERE (?2='hosted' AND hostId=?1 OR ?2='joined' AND hostId<>?1 AND activityStatus IS NOT NULL)
      AND (?2='hosted' OR ?3='all' OR activityStatus=?3)
      AND ((?6='current' AND cancelledAt IS NULL AND activityEnd>?7-86400000
            AND (?2='hosted' OR activityStatus IN ('pending','approved')))
        OR (?6='history' AND (activityEnd<=?7 OR cancelledAt IS NOT NULL
            OR activityStatus IN ('cancelled','rejected','unselected'))))
      AND (?4 IS NULL OR start<?4 OR (start=?4 AND id<?5))
    ORDER BY start DESC,id DESC LIMIT 11
  `).bind(actor,tab,status,after?.[0]??null,after?.[1]??null,scope,now).all()
  const rows=page.results.slice(0,10), last=rows.at(-1)
  const data=await snapshot(db,actor,env,rows.map(r=>r.id),false)
  return { data, items:rows.map(r=>({id:r.id,status:r.activityStatus})),
    nextCursor:page.results.length>10 ? JSON.stringify([last.start,last.id]) : null }
}
export async function matchDetail(db, actor, env, id) {
  requireValue(typeof id === 'string' && id.length > 0 && id.length <= 160,400,'경기를 확인해 주세요.')
  const result = await snapshot(db,actor,env,[id])
  requireValue(result.matches?.length,404,'이 경기를 찾을 수 없어요.')
  return result
}
export async function matchesByDay(db, actor, env, day) {
  requireValue(typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day + 'T00:00:00+09:00')),400,'날짜를 확인해 주세요.')
  const start = new Date(day + 'T00:00:00+09:00').toISOString()
  const end = new Date(Date.parse(start) + 86400000).toISOString()
  const rows = await db.prepare('SELECT id FROM matches WHERE start>=? AND start<? ORDER BY start,id').bind(start,end).all()
  return snapshot(db,actor,env,rows.results.map(r=>r.id))
}
